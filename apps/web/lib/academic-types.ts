import { LearningApiError } from './learning-api.ts';

export type AcademicReference = { id: string; title: string; code: string | null; version: string; status: 'DRAFT' | 'APPROVED'; sourceType: 'SCHOOL_AUTHORED'; createdBy: string; approvedBy: string | null };
export type MarkRevision = { id: string; revision: number; score: number; maxScore: number; feedback: string; status: string };
export type MarkingItem = { id: string; assessmentId: string; learnerId: string; content: string; assessmentTitle: string; learnerName: string; maxScore: number; policyVersion: number; referenceId: string | null; currentResult: MarkRevision | null };
export type ReleasedResult = { id: string; submissionId: string; learnerId: string; revision: number; score: number; maxScore: number; feedback: string; status: 'RELEASED'; policyVersion: number; referenceId: string; referenceVersion: string; evidenceId: string; createdAt: string; nativeResult: { type: 'numeric'; score: number; maxScore: number; policyVersion: number }; assessmentTitle?: string; referenceTitle?: string; learnerName?: string };
export type Evidence = { id: string; sourceType: 'SUBMISSION'; sourceObjectId: string; learnerId: string; actorId: string; createdAt: string; quality: 'TEACHER_ENTERED'; referenceId: string; referenceVersion: string; policyVersion: number; resultId: string; revision: number; visibility: string; reviewStatus: string };
export function canMarkSubmission(referenceId: string | null, references: AcademicReference[]) { return referenceId !== null && references.some((reference) => reference.id === referenceId && reference.status === 'APPROVED'); }
function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function strings(value: Record<string, unknown>, keys: string[]) { return keys.every((key) => typeof value[key] === 'string' && value[key] !== ''); }
function integer(value: unknown, min = 1): value is number { return typeof value === 'number' && Number.isInteger(value) && value >= min; }
function score(value: unknown, max: unknown) { return typeof value === 'number' && typeof max === 'number' && Number.isFinite(value) && Number.isFinite(max) && max > 0 && value >= 0 && value <= max; }
function nullableString(value: unknown) { return value === null || typeof value === 'string'; }
export function parseReference(value: unknown): AcademicReference {
  if (!object(value) || !strings(value, ['id', 'title', 'version', 'createdBy']) || !nullableString(value.code) || !nullableString(value.approvedBy) || (value.status !== 'DRAFT' && value.status !== 'APPROVED') || value.sourceType !== 'SCHOOL_AUTHORED' || (value.status === 'APPROVED' && !value.approvedBy)) throw new LearningApiError('invalid');
  return value as AcademicReference;
}
export function parseMarkingItem(value: unknown): MarkingItem {
  if (!object(value) || !strings(value, ['id', 'assessmentId', 'learnerId', 'content', 'assessmentTitle', 'learnerName']) || typeof value.maxScore !== 'number' || value.maxScore <= 0 || !Number.isFinite(value.maxScore) || !integer(value.policyVersion) || !nullableString(value.referenceId) || (value.currentResult !== null && !object(value.currentResult))) throw new LearningApiError('invalid');
  if (object(value.currentResult) && (!strings(value.currentResult, ['id', 'status']) || !['REVIEW', 'RELEASED'].includes(String(value.currentResult.status)) || !integer(value.currentResult.revision) || !score(value.currentResult.score, value.currentResult.maxScore) || typeof value.currentResult.feedback !== 'string')) throw new LearningApiError('invalid');
  return value as MarkingItem;
}
export function parseReleasedResult(value: unknown): ReleasedResult {
  if (!object(value) || !strings(value, ['id', 'submissionId', 'learnerId', 'referenceId', 'referenceVersion', 'evidenceId', 'createdAt']) || !Number.isFinite(Date.parse(String(value.createdAt))) || value.status !== 'RELEASED' || !integer(value.revision) || !integer(value.policyVersion) || !score(value.score, value.maxScore) || typeof value.feedback !== 'string' || !object(value.nativeResult) || value.nativeResult.type !== 'numeric' || !score(value.nativeResult.score, value.nativeResult.maxScore) || value.nativeResult.score !== value.score || value.nativeResult.maxScore !== value.maxScore || value.nativeResult.policyVersion !== value.policyVersion) throw new LearningApiError('invalid');
  return value as ReleasedResult;
}
export function parseEvidence(value: unknown): Evidence {
  if (!object(value) || !strings(value, ['id', 'sourceObjectId', 'learnerId', 'actorId', 'createdAt', 'referenceId', 'referenceVersion', 'resultId', 'visibility', 'reviewStatus']) || !Number.isFinite(Date.parse(String(value.createdAt))) || value.sourceType !== 'SUBMISSION' || value.quality !== 'TEACHER_ENTERED' || !['LEARNER_PRIVATE', 'PARENT_APPROVED'].includes(String(value.visibility)) || value.reviewStatus !== 'APPROVED' || !integer(value.policyVersion) || !integer(value.revision)) throw new LearningApiError('invalid');
  return value as Evidence;
}
