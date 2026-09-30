import { z } from 'zod';
import { DomainError } from './errors';

export const packLifecycleSchema = z.enum([
  'DRAFT', 'RESEARCH_COMPLETE', 'ACADEMIC_REVIEW', 'TECHNICAL_VALIDATION',
  'APPROVED', 'ACTIVE', 'SUPERSEDED', 'RETIRED',
]);
export const curriculumFactStatusSchema = z.enum([
  'VERIFIED', 'REQUIRES_REVIEW', 'SOURCE_RESTRICTED', 'UNKNOWN', 'SUPERSEDED', 'NOT_APPLICABLE',
]);
export const packReadinessSchema = z.enum([
  'ARCHITECTURE_READY', 'STRUCTURE_READY', 'CONTENT_PARTIAL', 'TECHNICALLY_VALIDATED',
  'ACADEMICALLY_REVIEWED', 'CUSTOMER_READY', 'SOURCE_RESTRICTED', 'DEFERRED',
]);
export const sourceRightsStatusSchema = z.enum(['PERMITTED', 'REQUIRES_REVIEW', 'SOURCE_RESTRICTED', 'UNKNOWN']);

export type PackLifecycle = z.infer<typeof packLifecycleSchema>;
export type CurriculumFactStatus = z.infer<typeof curriculumFactStatusSchema>;
export type PackReadiness = z.infer<typeof packReadinessSchema>;
export type SourceRightsStatus = z.infer<typeof sourceRightsStatusSchema>;

const text = z.string().min(1).refine((value) => value.trim() === value);
const sourceSchema = z.object({
  id: text,
  publisher: text,
  title: text,
  location: text,
  version: text.nullable(),
  publicationDate: z.iso.date().nullable(),
  accessedAt: z.iso.datetime({ offset: true }),
  rightsStatus: sourceRightsStatusSchema,
  allowedScopes: z.array(text),
  checksum: z.string().regex(/^[a-fA-F0-9]{64}$/).nullable(),
  snapshotPath: text.nullable(),
  authoritative: z.boolean(),
});
const factSchema = z.object({
  factId: text,
  statement: text,
  sourceId: text,
  scope: text,
  status: curriculumFactStatusSchema,
  requiredForUse: z.boolean(),
});
const validationSchema = z.object({
  structureReviewed: z.boolean(),
  assessmentPassed: z.boolean(),
  reportingPassed: z.boolean(),
  terminologyReviewed: z.boolean(),
  goldenCasesPassed: z.boolean(),
  browserApiDataPassed: z.boolean(),
  productionConfigurationVerified: z.boolean(),
});

export const curriculumPackSchema = z.object({
  packId: text,
  kind: z.enum(['curriculum', 'jurisdiction', 'quality', 'school_custom']),
  framework: text,
  programme: text,
  version: text,
  lifecycle: packLifecycleSchema,
  readiness: packReadinessSchema,
  sources: z.array(sourceSchema),
  facts: z.array(factSchema),
  academicReview: z.object({
    status: z.enum(['PENDING', 'APPROVED', 'REJECTED']),
    reviewerId: text.nullable(),
    reviewedAt: z.iso.datetime({ offset: true }).nullable(),
  }),
  validation: validationSchema,
  coverage: z.object({ requiredRows: z.array(text), completeRows: z.array(text) }),
});

export type CurriculumPack = z.infer<typeof curriculumPackSchema>;
export type CurriculumSource = z.infer<typeof sourceSchema>;
export type CurriculumFact = z.infer<typeof factSchema>;
export interface PackValidationIssue { code: string; path: string; }
export interface PackValidationResult { valid: boolean; issues: PackValidationIssue[]; }

function isOfficial(pack: CurriculumPack): boolean {
  return pack.kind !== 'school_custom';
}

function isResolvedVersion(version: string | null): boolean {
  return version !== null && !/(?:^|_)(?:REQUIRED|UNKNOWN|REQUIRES_REVIEW)$/.test(version);
}

function hasLockedAuthority(source: CurriculumSource): boolean {
  return source.authoritative && source.publicationDate !== null && isResolvedVersion(source.version)
    && source.checksum !== null && source.snapshotPath !== null
    && !/^[a-z][a-z\d+.-]*:\/\//i.test(source.snapshotPath);
}

function sourcePermitsFact(source: CurriculumSource, fact: CurriculumFact): boolean {
  return source.rightsStatus === 'PERMITTED' && source.allowedScopes.includes(fact.scope);
}

function readinessIssues(pack: CurriculumPack, readiness: PackReadiness): PackValidationIssue[] {
  const issues: PackValidationIssue[] = [];
  const add = (code: string, path: string) => issues.push({ code, path });
  const check = (key: keyof CurriculumPack['validation']) => {
    if (!pack.validation[key]) add('VALIDATION_INCOMPLETE', `validation.${key}`);
  };
  const technical = readiness === 'TECHNICALLY_VALIDATED' || readiness === 'CUSTOMER_READY';
  const academic = readiness === 'ACADEMICALLY_REVIEWED' || readiness === 'CUSTOMER_READY';
  if (readiness === 'STRUCTURE_READY' || readiness === 'CONTENT_PARTIAL' || technical || academic) {
    check('structureReviewed');
  }
  if (technical) {
    check('assessmentPassed');
    check('reportingPassed');
    check('goldenCasesPassed');
    check('browserApiDataPassed');
  }
  if (academic) {
    check('terminologyReviewed');
    if (pack.academicReview.status !== 'APPROVED'
      || pack.academicReview.reviewerId === null || pack.academicReview.reviewedAt === null) {
      add('ACADEMIC_REVIEW_REQUIRED', 'academicReview');
    }
  }
  if (readiness === 'CUSTOMER_READY') {
    check('productionConfigurationVerified');
    if (pack.coverage.requiredRows.length === 0
      || !pack.coverage.requiredRows.every((row) => pack.coverage.completeRows.includes(row))) {
      add('COVERAGE_INCOMPLETE', 'coverage');
    }
    if (!pack.facts.some((fact) => fact.requiredForUse)) add('REQUIRED_FACTS_MISSING', 'facts');
    if (isOfficial(pack) && !isResolvedVersion(pack.version)) add('VERSION_REQUIRES_REVIEW', 'version');
    for (const fact of pack.facts.filter((entry) => entry.requiredForUse)) {
      const source = pack.sources.find((entry) => entry.id === fact.sourceId);
      if (fact.status !== 'VERIFIED') add('FACT_REQUIRES_REVIEW', `facts.${fact.factId}`);
      if (!source) {
        add('SOURCE_MISSING', `facts.${fact.factId}.sourceId`);
      } else {
        if (!sourcePermitsFact(source, fact)) add('RIGHTS_REQUIRED', `sources.${source.id}`);
        if (isOfficial(pack) && !hasLockedAuthority(source)) add('LOCKED_SOURCE_REQUIRED', `sources.${source.id}`);
      }
    }
  }
  return issues;
}

/**
 * Validate trusted metadata and a declared readiness claim. This pure function cannot grant
 * source rights, verify file bytes or perform academic sign-off; those are controlled workflows.
 * Unknown facts may be stored in drafts but cannot be used as verified academic behavior.
 */
export function validateCurriculumPack(input: unknown): PackValidationResult {
  const parsed = curriculumPackSchema.safeParse(input);
  if (!parsed.success) {
    return { valid: false, issues: parsed.error.issues.map((issue) => ({ code: 'INVALID_PACK', path: issue.path.join('.') })) };
  }
  const pack = parsed.data;
  const issues: PackValidationIssue[] = [];
  for (const [label, ids] of [
    ['sources', pack.sources.map((source) => source.id)],
    ['facts', pack.facts.map((fact) => fact.factId)],
    ['coverage.requiredRows', pack.coverage.requiredRows],
    ['coverage.completeRows', pack.coverage.completeRows],
  ] as const) {
    if (new Set(ids).size !== ids.length) issues.push({ code: 'DUPLICATE_ID', path: label });
  }
  for (const fact of pack.facts) {
    if (!pack.sources.some((source) => source.id === fact.sourceId)) {
      issues.push({ code: 'SOURCE_MISSING', path: `facts.${fact.factId}.sourceId` });
    }
  }
  issues.push(...readinessIssues(pack, pack.readiness));
  return { valid: issues.length === 0, issues };
}

// Academic review and technical validation are independent; CUSTOMER_READY requires both.
const satisfiesReadiness: Record<PackReadiness, readonly PackReadiness[]> = {
  ARCHITECTURE_READY: ['ARCHITECTURE_READY', 'STRUCTURE_READY', 'CONTENT_PARTIAL', 'TECHNICALLY_VALIDATED', 'ACADEMICALLY_REVIEWED', 'CUSTOMER_READY'],
  STRUCTURE_READY: ['STRUCTURE_READY', 'CONTENT_PARTIAL', 'TECHNICALLY_VALIDATED', 'ACADEMICALLY_REVIEWED', 'CUSTOMER_READY'],
  CONTENT_PARTIAL: ['CONTENT_PARTIAL', 'TECHNICALLY_VALIDATED', 'ACADEMICALLY_REVIEWED', 'CUSTOMER_READY'],
  TECHNICALLY_VALIDATED: ['TECHNICALLY_VALIDATED', 'CUSTOMER_READY'],
  ACADEMICALLY_REVIEWED: ['ACADEMICALLY_REVIEWED', 'CUSTOMER_READY'],
  CUSTOMER_READY: ['CUSTOMER_READY'],
  SOURCE_RESTRICTED: [],
  DEFERRED: [],
};

export function requirePackReadiness(input: unknown, required: PackReadiness): void {
  const parsed = curriculumPackSchema.safeParse(input);
  if (!parsed.success || !packReadinessSchema.safeParse(required).success
    || !validateCurriculumPack(input).valid
    || !satisfiesReadiness[required].includes(parsed.data.readiness)
    || readinessIssues(parsed.data, required).length > 0
    || ['SUPERSEDED', 'RETIRED'].includes(parsed.data.lifecycle)
    || (required === 'CUSTOMER_READY' && !['APPROVED', 'ACTIVE'].includes(parsed.data.lifecycle))) {
    throw new DomainError('CURRICULUM_NOT_READY', 409, 'The curriculum pack has not met the required readiness criteria.');
  }
}

export function requireVerifiedCurriculumFact(input: unknown, factId: string): CurriculumFact {
  const parsed = curriculumPackSchema.safeParse(input);
  const reviewRequired = () => new DomainError('CURRICULUM_REQUIRES_REVIEW', 409, 'The curriculum rule requires source or academic review.');
  if (!parsed.success || !text.safeParse(factId).success) throw reviewRequired();
  const pack = parsed.data;
  const facts = pack.facts.filter((fact) => fact.factId === factId);
  if (facts.length !== 1 || facts[0]!.status !== 'VERIFIED'
    || !['APPROVED', 'ACTIVE'].includes(pack.lifecycle)
    || ['SOURCE_RESTRICTED', 'DEFERRED'].includes(pack.readiness)
    || (isOfficial(pack) && !isResolvedVersion(pack.version))
    || readinessIssues(pack, 'ACADEMICALLY_REVIEWED').length > 0) {
    throw reviewRequired();
  }
  const fact = facts[0]!;
  const sources = pack.sources.filter((source) => source.id === fact.sourceId);
  if (sources.length !== 1) throw reviewRequired();
  const source = sources[0]!;
  if (!sourcePermitsFact(source, fact)) {
    throw new DomainError('CURRICULUM_SOURCE_RESTRICTED', 409, 'The source permission does not allow this curriculum rule.');
  }
  if (isOfficial(pack) && !hasLockedAuthority(source)) throw reviewRequired();
  return fact;
}

export function requirePackVersion(expectedVersion: unknown, actualVersion: unknown): void {
  if (!text.safeParse(expectedVersion).success || !text.safeParse(actualVersion).success || expectedVersion !== actualVersion) {
    throw new DomainError('CURRICULUM_VERSION_MISMATCH', 409, 'The curriculum version differs from the version pinned to this record.');
  }
}

export function requireMutablePackVersion(hasOfficialRecords: unknown): void {
  if (hasOfficialRecords !== false) {
    throw new DomainError('CURRICULUM_VERSION_IMMUTABLE', 409, 'A referenced or unverified curriculum version cannot be overwritten.');
  }
}
