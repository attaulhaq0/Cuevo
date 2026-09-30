import { describe, expect, it } from 'vitest';
import {
  DomainError,
  requireMutablePackVersion,
  requirePackReadiness,
  requirePackVersion,
  requireVerifiedCurriculumFact,
  validateCurriculumPack,
  type CurriculumPack,
} from '../src/index';

// The fixture describes synthetic School Custom content, never an official curriculum.
function reviewedPack(): CurriculumPack {
  return {
    packId: 'school-custom-synthetic',
    kind: 'school_custom',
    framework: 'School Custom',
    programme: 'Synthetic learning vertical',
    version: 'synthetic-1',
    lifecycle: 'ACTIVE',
    readiness: 'CUSTOMER_READY',
    sources: [{
      id: 'synthetic-source',
      publisher: 'Synthetic school',
      title: 'School-authored synthetic objective',
      location: 'fixtures/school-custom.yaml',
      version: 'synthetic-1',
      publicationDate: '2026-10-01',
      accessedAt: '2026-10-01T09:00:00.000Z',
      rightsStatus: 'PERMITTED',
      allowedScopes: ['synthetic-primary'],
      checksum: null,
      snapshotPath: null,
      authoritative: false,
    }],
    facts: [{
      factId: 'synthetic-objective',
      statement: 'A teacher-authored synthetic learning objective.',
      sourceId: 'synthetic-source',
      scope: 'synthetic-primary',
      status: 'VERIFIED',
      requiredForUse: true,
    }],
    academicReview: { status: 'APPROVED', reviewerId: 'synthetic-academic-owner', reviewedAt: '2026-10-01T09:00:00.000Z' },
    validation: {
      structureReviewed: true,
      assessmentPassed: true,
      reportingPassed: true,
      terminologyReviewed: true,
      goldenCasesPassed: true,
      browserApiDataPassed: true,
      productionConfigurationVerified: true,
    },
    coverage: { requiredRows: ['synthetic-primary'], completeRows: ['synthetic-primary'] },
  };
}

function expectPackRejected(action: () => unknown, code: string) {
  try {
    action();
    expect.fail('Unverified curriculum behavior was accepted');
  } catch (error) {
    expect(error).toBeInstanceOf(DomainError);
    expect(error).toMatchObject({ code });
  }
}

describe('curriculum readiness and evidence', () => {
  it('accepts a fully reviewed synthetic pack without changing its version or native context', () => {
    const pack = reviewedPack();
    expect(validateCurriculumPack(pack)).toEqual({ valid: true, issues: [] });
    expect(() => requirePackReadiness(pack, 'CUSTOMER_READY')).not.toThrow();
    expect(() => requireVerifiedCurriculumFact(pack, 'synthetic-objective')).not.toThrow();
    expect(pack.version).toBe('synthetic-1');
  });

  it('retains unknown facts in a draft without promoting them to official behavior', () => {
    const pack = reviewedPack();
    pack.lifecycle = 'DRAFT';
    pack.readiness = 'ARCHITECTURE_READY';
    pack.facts[0]!.status = 'UNKNOWN';
    pack.academicReview = { status: 'PENDING', reviewerId: null, reviewedAt: null };
    expect(validateCurriculumPack(pack).valid).toBe(true);
    expectPackRejected(() => requireVerifiedCurriculumFact(pack, 'synthetic-objective'), 'CURRICULUM_REQUIRES_REVIEW');
  });

  it('does not treat ACTIVE lifecycle as proof of customer readiness', () => {
    const pack = reviewedPack();
    pack.readiness = 'STRUCTURE_READY';
    pack.academicReview = { status: 'PENDING', reviewerId: null, reviewedAt: null };
    expectPackRejected(() => requirePackReadiness(pack, 'CUSTOMER_READY'), 'CURRICULUM_NOT_READY');
  });

  it('does not treat technical validation as academic sign-off', () => {
    const pack = reviewedPack();
    pack.readiness = 'TECHNICALLY_VALIDATED';
    pack.academicReview = { status: 'PENDING', reviewerId: null, reviewedAt: null };
    expect(() => requirePackReadiness(pack, 'TECHNICALLY_VALIDATED')).not.toThrow();
    expectPackRejected(() => requirePackReadiness(pack, 'ACADEMICALLY_REVIEWED'), 'CURRICULUM_NOT_READY');
  });

  it.each(['UNKNOWN', 'REQUIRES_REVIEW', 'SOURCE_RESTRICTED', 'SUPERSEDED', 'NOT_APPLICABLE'] as const)('blocks a required fact with status %s', (status) => {
    const pack = reviewedPack();
    pack.facts[0]!.status = status;
    expect(validateCurriculumPack(pack).valid).toBe(false);
    expectPackRejected(() => requirePackReadiness(pack, 'CUSTOMER_READY'), 'CURRICULUM_NOT_READY');
  });

  it.each(['UNKNOWN', 'REQUIRES_REVIEW', 'SOURCE_RESTRICTED'] as const)('blocks source rights status %s even when a fact says VERIFIED', (rightsStatus) => {
    const pack = reviewedPack();
    pack.sources[0]!.rightsStatus = rightsStatus;
    expect(validateCurriculumPack(pack).valid).toBe(false);
    expectPackRejected(() => requireVerifiedCurriculumFact(pack, 'synthetic-objective'), 'CURRICULUM_SOURCE_RESTRICTED');
  });

  it('rejects use outside the source permission scope', () => {
    const pack = reviewedPack();
    pack.sources[0]!.allowedScopes = ['different-subject'];
    expectPackRejected(() => requireVerifiedCurriculumFact(pack, 'synthetic-objective'), 'CURRICULUM_SOURCE_RESTRICTED');
  });

  it('rejects an unknown reference instead of inventing its mapping', () => {
    expectPackRejected(() => requireVerifiedCurriculumFact(reviewedPack(), 'missing-objective'), 'CURRICULUM_REQUIRES_REVIEW');
  });

  it('rejects a verified fact without its recorded source', () => {
    const pack = reviewedPack();
    pack.sources = [];
    expectPackRejected(() => requireVerifiedCurriculumFact(pack, 'synthetic-objective'), 'CURRICULUM_REQUIRES_REVIEW');
  });

  it.each([
    'structureReviewed', 'assessmentPassed', 'reportingPassed', 'terminologyReviewed',
    'goldenCasesPassed', 'browserApiDataPassed', 'productionConfigurationVerified',
  ] as const)('rejects customer promotion when %s is incomplete', (field) => {
    const pack = reviewedPack();
    pack.validation[field] = false;
    expectPackRejected(() => requirePackReadiness(pack, 'CUSTOMER_READY'), 'CURRICULUM_NOT_READY');
  });

  it('rejects academic approval without a named reviewer', () => {
    const pack = reviewedPack();
    pack.academicReview.reviewerId = null;
    expectPackRejected(() => requirePackReadiness(pack, 'CUSTOMER_READY'), 'CURRICULUM_NOT_READY');
  });

  it('rejects academic approval without a review date', () => {
    const pack = reviewedPack();
    pack.academicReview.reviewedAt = null;
    expectPackRejected(() => requirePackReadiness(pack, 'CUSTOMER_READY'), 'CURRICULUM_NOT_READY');
  });

  it('rejects incomplete customer-specific coverage', () => {
    const pack = reviewedPack();
    pack.coverage.requiredRows.push('synthetic-secondary');
    expectPackRejected(() => requirePackReadiness(pack, 'CUSTOMER_READY'), 'CURRICULUM_NOT_READY');
  });

  it('rejects an empty readiness claim without required coverage or facts', () => {
    const pack = reviewedPack();
    pack.coverage = { requiredRows: [], completeRows: [] };
    pack.facts = [];
    expectPackRejected(() => requirePackReadiness(pack, 'CUSTOMER_READY'), 'CURRICULUM_NOT_READY');
  });

  it.each([
    { lifecycle: 'CUSTOMER_READY' },
    { readiness: 'ACTIVE' },
    { facts: [{ ...reviewedPack().facts[0], status: 'ACTIVE' }] },
    { validation: { ...reviewedPack().validation, goldenCasesPassed: undefined } },
  ])('rejects malformed or conflated statuses %j', (invalid) => {
    expect(validateCurriculumPack({ ...reviewedPack(), ...invalid }).valid).toBe(false);
  });

  it('rejects duplicate fact identities so a caller cannot select a conflicting rule', () => {
    const pack = reviewedPack();
    pack.facts.push({ ...pack.facts[0]! });
    expect(validateCurriculumPack(pack).valid).toBe(false);
  });

  it('rejects incomplete source provenance', () => {
    const pack = reviewedPack();
    pack.sources[0]!.accessedAt = '';
    expect(validateCurriculumPack(pack).valid).toBe(false);
  });

  it('rejects official customer readiness based only on an index URL and structural dossier', () => {
    const pack = reviewedPack();
    pack.kind = 'curriculum';
    pack.sources[0]!.location = 'https://example.invalid/official-source';
    expectPackRejected(() => requirePackReadiness(pack, 'CUSTOMER_READY'), 'CURRICULUM_NOT_READY');
  });

  it('requires a dated authoritative locked snapshot for an official verified rule', () => {
    const pack = reviewedPack();
    pack.kind = 'jurisdiction';
    expectPackRejected(() => requireVerifiedCurriculumFact(pack, 'synthetic-objective'), 'CURRICULUM_REQUIRES_REVIEW');
  });

  it('validates an abstract official pack only when provenance and snapshot evidence are complete', () => {
    const pack = reviewedPack();
    pack.kind = 'curriculum';
    pack.sources[0]!.authoritative = true;
    pack.sources[0]!.snapshotPath = 'locked/abstract-fixture.txt';
    pack.sources[0]!.checksum = 'a'.repeat(64);
    expect(validateCurriculumPack(pack).valid).toBe(true);
  });

  it('blocks new use of a superseded pack while keeping its identity readable for history', () => {
    const pack = reviewedPack();
    pack.lifecycle = 'SUPERSEDED';
    expectPackRejected(() => requirePackReadiness(pack, 'CUSTOMER_READY'), 'CURRICULUM_NOT_READY');
    expectPackRejected(() => requireVerifiedCurriculumFact(pack, 'synthetic-objective'), 'CURRICULUM_REQUIRES_REVIEW');
    expect(() => requirePackVersion('synthetic-1', pack.version)).not.toThrow();
  });

  it.each([
    { status: 'PENDING', reviewerId: null, reviewedAt: null },
    { status: 'REJECTED', reviewerId: 'reviewer', reviewedAt: '2026-10-01T09:00:00.000Z' },
    { status: 'APPROVED', reviewerId: null, reviewedAt: '2026-10-01T09:00:00.000Z' },
    { status: 'APPROVED', reviewerId: 'reviewer', reviewedAt: null },
  ] as const)('blocks verified-rule use without complete academic approval %j', (review) => {
    const pack = reviewedPack();
    pack.academicReview = review;
    expectPackRejected(() => requireVerifiedCurriculumFact(pack, 'synthetic-objective'), 'CURRICULUM_REQUIRES_REVIEW');
  });

  it('blocks verified-rule use before the structure and terminology are reviewed', () => {
    const pack = reviewedPack();
    pack.validation.structureReviewed = false;
    pack.validation.terminologyReviewed = false;
    expectPackRejected(() => requireVerifiedCurriculumFact(pack, 'synthetic-objective'), 'CURRICULUM_REQUIRES_REVIEW');
  });

  it.each(['SUPERSEDED', 'RETIRED'] as const)('blocks new technical use of a %s pack', (lifecycle) => {
    const pack = reviewedPack();
    pack.lifecycle = lifecycle;
    expectPackRejected(() => requirePackReadiness(pack, 'TECHNICALLY_VALIDATED'), 'CURRICULUM_NOT_READY');
  });

  it.each(['SOURCE_RESTRICTED', 'DEFERRED'] as const)('blocks verified-rule use of a %s pack', (readiness) => {
    const pack = reviewedPack();
    pack.readiness = readiness;
    expectPackRejected(() => requireVerifiedCurriculumFact(pack, 'synthetic-objective'), 'CURRICULUM_REQUIRES_REVIEW');
  });

  it.each(['SOURCE_VERSION_REQUIRED', 'SYLLABUS_VERSION_REQUIRED', 'OFFICIAL_VERSION_REQUIRED'])('blocks official readiness with placeholder version %s', (version) => {
    const pack = reviewedPack();
    pack.kind = 'curriculum';
    pack.version = version;
    pack.sources[0]!.authoritative = true;
    pack.sources[0]!.version = version;
    pack.sources[0]!.snapshotPath = 'locked/abstract-fixture.txt';
    pack.sources[0]!.checksum = 'a'.repeat(64);
    expectPackRejected(() => requirePackReadiness(pack, 'CUSTOMER_READY'), 'CURRICULUM_NOT_READY');
  });
});

describe('historical pack versions', () => {
  it('allows an assessment pinned to the exact referenced pack version', () => {
    expect(() => requirePackVersion('synthetic-1', 'synthetic-1')).not.toThrow();
  });

  it('rejects a stale or mismatched version rather than silently upgrading the record', () => {
    expectPackRejected(() => requirePackVersion('synthetic-1', 'synthetic-2'), 'CURRICULUM_VERSION_MISMATCH');
  });

  it('rejects unknown expected version', () => {
    expectPackRejected(() => requirePackVersion('', 'synthetic-1'), 'CURRICULUM_VERSION_MISMATCH');
  });

  it('prevents overwriting a version used by official academic records', () => {
    expectPackRejected(() => requireMutablePackVersion(true), 'CURRICULUM_VERSION_IMMUTABLE');
  });

  it('does not treat unknown historical usage as an unused version', () => {
    expectPackRejected(() => requireMutablePackVersion(undefined), 'CURRICULUM_VERSION_IMMUTABLE');
  });

  it('allows edits before the version is referenced', () => {
    expect(() => requireMutablePackVersion(false)).not.toThrow();
  });
});
