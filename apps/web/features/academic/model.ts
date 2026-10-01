import { LearningApiError } from '../../shared/api/client.ts';

export type AcademicReference = { id: string; title: string; code: string | null; version: string; status: 'DRAFT' | 'APPROVED'; sourceType: 'SCHOOL_AUTHORED'; createdBy: string; approvedBy: string | null };
export type RubricLevel = { key: string; label: string; description: string };
export type RubricCriterion = { key: string; title: string; levels: RubricLevel[] };
export type RubricContext = { id: string; title: string; version: string; criteria: RubricCriterion[] };
export type Rubric = RubricContext & { courseId: string; sourceType: 'SCHOOL_AUTHORED'; createdBy: string; createdAt: string };
export type NativeNumericResult = { type: 'numeric'; score: number; maxScore: number; policyVersion: number; normalized?: null };
export type NativeRubricResult = { type: 'rubric'; rubricId: string; rubricTitle: string; rubricVersion: string; policyVersion: number; normalized: null; criteria: { criterionKey: string; criterionTitle: string; levelKey: string; levelLabel: string; levelDescription: string }[] };
export type NativeResult = NativeNumericResult | NativeRubricResult;
type MarkRevisionBase = { id: string; revision: number; feedback: string; status: 'REVIEW' | 'RELEASED' };
export type MarkRevision = MarkRevisionBase & ({ model: 'numeric'; score: number; maxScore: number } | { model: 'rubric'; nativeResult: NativeRubricResult });
type MarkingBase = { id: string; assessmentId: string; learnerId: string; content: string; assessmentTitle: string; learnerName: string; policyVersion: number; referenceId: string | null; currentResult: MarkRevision | null; submissionRevision: number; submissionStatus: 'SUBMITTED' | 'RETURNED' | 'RESUBMITTED' | 'CLOSED' };
export type MarkingItem = MarkingBase & ({ model: 'numeric'; maxScore: number; rubric: null } | { model: 'rubric'; rubric: RubricContext });
type ReleasedBase = { id: string; submissionId: string; assessmentId?: string; learnerId: string; revision: number; feedback: string; status: 'RELEASED'; policyVersion: number; referenceId: string; referenceVersion: string; evidenceId: string; createdAt: string; assessmentTitle?: string; referenceTitle?: string; learnerName?: string };
export type NumericReleasedResult = ReleasedBase & { model: 'numeric'; score: number; maxScore: number; nativeResult: NativeNumericResult };
export type ReleasedResult = NumericReleasedResult | ReleasedBase & { model: 'rubric'; nativeResult: NativeRubricResult };
export type Evidence = { id: string; sourceType: 'SUBMISSION'; sourceObjectId: string; learnerId: string; actorId: string; createdAt: string; quality: 'TEACHER_ENTERED'; referenceId: string; referenceVersion: string; policyVersion: number; resultId: string; revision: number; visibility: string; reviewStatus: string };
export function canMarkSubmission(referenceId: string | null, references: AcademicReference[]) { return referenceId !== null && references.some((reference) => reference.id === referenceId && reference.status === 'APPROVED'); }
function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function strings(value: Record<string, unknown>, keys: string[]) { return keys.every((key) => typeof value[key] === 'string' && value[key] !== ''); }
function integer(value: unknown, min = 1): value is number { return typeof value === 'number' && Number.isInteger(value) && value >= min; }
function score(value: unknown, max: unknown) { return typeof value === 'number' && typeof max === 'number' && Number.isFinite(value) && Number.isFinite(max) && max > 0 && value >= 0 && value <= max; }
function nullableString(value: unknown) { return value === null || typeof value === 'string'; }
function rubricContext(value: unknown): value is RubricContext {
  if (!object(value) || !strings(value, ['id', 'title', 'version']) || !Array.isArray(value.criteria) || !value.criteria.length || value.criteria.length > 30) return false;
  const keys = new Set<string>();
  for (const criterion of value.criteria) {
    if (!object(criterion) || !strings(criterion, ['key', 'title']) || keys.has(String(criterion.key)) || !Array.isArray(criterion.levels) || !criterion.levels.length || criterion.levels.length > 20) return false;
    keys.add(String(criterion.key));
    const levels = new Set<string>();
    for (const level of criterion.levels) {
      if (!object(level) || !strings(level, ['key', 'label', 'description']) || levels.has(String(level.key))) return false;
      levels.add(String(level.key));
    }
  }
  return true;
}
export function parseRubric(value: unknown): Rubric {
  if (!object(value) || !strings(value, ['courseId', 'createdBy', 'createdAt']) || value.sourceType !== 'SCHOOL_AUTHORED' || !Number.isFinite(Date.parse(String(value.createdAt))) || !rubricContext(value)) throw new LearningApiError('invalid');
  return value as Rubric;
}
export function parseNativeResult(value: unknown): NativeResult {
  if (!object(value) || !integer(value.policyVersion)) throw new LearningApiError('invalid');
  if (value.type === 'numeric' && score(value.score, value.maxScore) && (value.normalized === undefined || value.normalized === null)) return value as NativeNumericResult;
  if (value.type !== 'rubric' || !strings(value, ['rubricId', 'rubricTitle', 'rubricVersion']) || value.normalized !== null || value.score !== undefined || value.maxScore !== undefined || !Array.isArray(value.criteria) || !value.criteria.length || value.criteria.length > 30 || new Set(value.criteria.map((criterion) => object(criterion) ? criterion.criterionKey : null)).size !== value.criteria.length || value.criteria.some((criterion) => !object(criterion) || !strings(criterion, ['criterionKey', 'criterionTitle', 'levelKey', 'levelLabel', 'levelDescription']))) throw new LearningApiError('invalid');
  return value as NativeRubricResult;
}
export function isNumericResult(result: ReleasedResult): result is NumericReleasedResult { return result.model === 'numeric'; }
export function parseReference(value: unknown): AcademicReference {
  if (!object(value) || !strings(value, ['id', 'title', 'version', 'createdBy']) || !nullableString(value.code) || !nullableString(value.approvedBy) || (value.status !== 'DRAFT' && value.status !== 'APPROVED') || value.sourceType !== 'SCHOOL_AUTHORED' || (value.status === 'APPROVED' && !value.approvedBy)) throw new LearningApiError('invalid');
  return value as AcademicReference;
}
export function parseMarkingItem(value: unknown): MarkingItem {
  if (!object(value) || !strings(value, ['id', 'assessmentId', 'learnerId', 'content', 'assessmentTitle', 'learnerName']) || !integer(value.policyVersion) || !nullableString(value.referenceId) || (value.currentResult !== null && !object(value.currentResult))) throw new LearningApiError('invalid');
  const model = value.model ?? 'numeric';
  if (value.submissionRevision !== undefined && !integer(value.submissionRevision) || value.submissionStatus !== undefined && !['SUBMITTED', 'RETURNED', 'RESUBMITTED', 'CLOSED'].includes(String(value.submissionStatus))) throw new LearningApiError('invalid');
  if (model === 'numeric' ? typeof value.maxScore !== 'number' || value.maxScore <= 0 || !Number.isFinite(value.maxScore) : model !== 'rubric' || !rubricContext(value.rubric) || value.maxScore !== undefined) throw new LearningApiError('invalid');
  let currentResult: MarkRevision | null = null;
  if (object(value.currentResult)) {
    const current = value.currentResult;
    if (!strings(current, ['id', 'status']) || !['REVIEW', 'RELEASED'].includes(String(current.status)) || !integer(current.revision) || typeof current.feedback !== 'string') throw new LearningApiError('invalid');
    if (model === 'numeric') {
      if (!score(current.score, current.maxScore) || current.maxScore !== value.maxScore) throw new LearningApiError('invalid');
    } else {
      const native = parseNativeResult(current.nativeResult);
      const rubric = value.rubric as RubricContext;
      if (native.type !== 'rubric' || native.rubricId !== rubric.id || native.rubricVersion !== rubric.version || native.policyVersion !== value.policyVersion || native.criteria.length !== rubric.criteria.length || native.criteria.some((criterion, index) => {
        const allowed = rubric.criteria[index];
        const level = allowed.levels.find((entry) => entry.key === criterion.levelKey);
        return criterion.criterionKey !== allowed.key || criterion.criterionTitle !== allowed.title || !level || level.label !== criterion.levelLabel || level.description !== criterion.levelDescription;
      })) throw new LearningApiError('invalid');
    }
    currentResult = { ...current, model } as MarkRevision;
  }
  return { ...value, model, rubric: model === 'numeric' ? null : value.rubric, currentResult, submissionRevision: value.submissionRevision ?? 1, submissionStatus: value.submissionStatus ?? 'SUBMITTED' } as MarkingItem;
}
export function parseReleasedResult(value: unknown): ReleasedResult {
  if (!object(value) || !strings(value, ['id', 'submissionId', 'learnerId', 'referenceId', 'referenceVersion', 'evidenceId', 'createdAt']) || !Number.isFinite(Date.parse(String(value.createdAt))) || value.status !== 'RELEASED' || !integer(value.revision) || !integer(value.policyVersion) || typeof value.feedback !== 'string') throw new LearningApiError('invalid');
  const nativeResult = parseNativeResult(value.nativeResult);
  const model = value.model ?? 'numeric';
  if (model !== nativeResult.type || nativeResult.policyVersion !== value.policyVersion || (nativeResult.type === 'numeric' ? nativeResult.score !== value.score || nativeResult.maxScore !== value.maxScore : value.score !== undefined || value.maxScore !== undefined)) throw new LearningApiError('invalid');
  return { ...value, model, nativeResult } as ReleasedResult;
}
export function parseEvidence(value: unknown): Evidence {
  if (!object(value) || !strings(value, ['id', 'sourceObjectId', 'learnerId', 'actorId', 'createdAt', 'referenceId', 'referenceVersion', 'resultId', 'visibility', 'reviewStatus']) || !Number.isFinite(Date.parse(String(value.createdAt))) || value.sourceType !== 'SUBMISSION' || value.quality !== 'TEACHER_ENTERED' || !['LEARNER_PRIVATE', 'PARENT_APPROVED'].includes(String(value.visibility)) || value.reviewStatus !== 'APPROVED' || !integer(value.policyVersion) || !integer(value.revision)) throw new LearningApiError('invalid');
  return value as Evidence;
}
