import { z } from 'zod';
import { academicReportResultSchema, markingInputSchema, nativeAcademicResultSchema, resultReleaseSchema } from '@cuevo/contracts';
import { LearningApiError, type Command } from '../../shared/api/client';
import { parseMarkingItem, type MarkingItem, type MarkRevision } from './model';

const markContext = {
  id: z.uuid(), submissionId: z.uuid(), learnerId: z.uuid(), revision: z.number().int().positive(),
  feedback: z.string().max(10000), status: z.literal('REVIEW'), policyVersion: z.number().int().positive(), referenceId: z.uuid(),
};
/** AcademicService returns these fields from the immutable marking revision.
 * Marking ID is generated; no source timestamp, actor or result ID is echoed. */
const markReceiptSchema = z.discriminatedUnion('model', [
  z.object({ ...markContext, model: z.literal('numeric'), score: z.number().finite().nonnegative(), maxScore: z.number().finite().positive() }).strict(),
  z.object({ ...markContext, model: z.literal('rubric'), nativeResult: nativeAcademicResultSchema }).strict(),
]);

const invalid = (): never => { throw new LearningApiError('invalid', true); };
function sameNative(left: unknown, right: unknown): boolean {
  const a = nativeAcademicResultSchema.safeParse(left), b = nativeAcademicResultSchema.safeParse(right);
  if (!a.success || !b.success || a.data.type !== b.data.type || a.data.policyVersion !== b.data.policyVersion) return false;
  if (a.data.type === 'numeric' && b.data.type === 'numeric') return a.data.score === b.data.score && a.data.maxScore === b.data.maxScore;
  if (a.data.type !== 'rubric' || b.data.type !== 'rubric') return false;
  return a.data.rubricId === b.data.rubricId && a.data.rubricTitle === b.data.rubricTitle && a.data.rubricVersion === b.data.rubricVersion
    && a.data.criteria.length === b.data.criteria.length && a.data.criteria.every((criterion, index) => {
      const other = b.data.type === 'rubric' ? b.data.criteria[index] : undefined;
      return !!other && criterion.criterionKey === other.criterionKey && criterion.criterionTitle === other.criterionTitle
        && criterion.levelKey === other.levelKey && criterion.levelLabel === other.levelLabel && criterion.levelDescription === other.levelDescription;
    });
}
function markNative(mark: MarkRevision, policyVersion: number) {
  return mark.model === 'numeric' ? { type: 'numeric' as const, score: mark.score, maxScore: mark.maxScore, policyVersion } : mark.nativeResult;
}

/** Validate against the original submitted command and its source snapshot.
 * It never consults a current query, mounted component or request journal. */
export function validateAcademicMarkReceipt(receipt: unknown, originalCommand: Command, item: MarkingItem): void {
  try {
    const original = markingInputSchema.parse(originalCommand.body), saved = markReceiptSchema.parse(receipt), source = parseMarkingItem(item);
    if (originalCommand.path !== `/v1/submissions/${source.id}/results` || !['SUBMITTED', 'RESUBMITTED'].includes(source.submissionStatus)
      || !source.referenceId || original.expectedPolicyVersion !== source.policyVersion || saved.submissionId !== source.id || saved.learnerId !== source.learnerId
      || saved.referenceId !== source.referenceId || saved.policyVersion !== source.policyVersion || saved.revision !== original.expectedRevision + 1 || saved.feedback !== original.feedback) return invalid();
    if (source.model === 'numeric') {
      if (!('score' in original) || saved.model !== 'numeric' || original.score > source.maxScore || saved.score !== original.score || saved.maxScore !== source.maxScore) return invalid();
      return;
    }
    if (!('nativeResult' in original) || saved.model !== 'rubric' || original.nativeResult.rubricId !== source.rubric.id || original.nativeResult.criteria.length !== source.rubric.criteria.length) return invalid();
    const expected = {
      type: 'rubric' as const, rubricId: source.rubric.id, rubricTitle: source.rubric.title, rubricVersion: source.rubric.version,
      policyVersion: source.policyVersion, normalized: null,
      criteria: source.rubric.criteria.map(criterion => {
        const choice = original.nativeResult.criteria.find(row => row.criterionKey === criterion.key), level = criterion.levels.find(row => row.key === choice?.levelKey);
        if (!choice || !level) return invalid();
        return { criterionKey: criterion.key, criterionTitle: criterion.title, levelKey: level.key, levelLabel: level.label, levelDescription: level.description };
      }),
    };
    if (!sameNative(saved.nativeResult, expected)) return invalid();
  } catch { return invalid(); }
}

/** Release preserves the reviewed mark revision; SQL does not increment it.
 * The receipt lacks markingId, so only echoed source/native values are bound. */
export function validateAcademicReleaseReceipt(receipt: unknown, originalCommand: Command, item: MarkingItem, currentMark: MarkRevision): void {
  try {
    const original = resultReleaseSchema.parse(originalCommand.body), saved = academicReportResultSchema.parse(receipt), source = parseMarkingItem({ ...item, currentResult: currentMark });
    if (!z.uuid().safeParse(currentMark.id).success || originalCommand.path !== `/v1/results/${currentMark.id}/release`
      || !['SUBMITTED', 'RESUBMITTED'].includes(source.submissionStatus) || !source.referenceId || original.expectedRevision !== currentMark.revision
      || saved.submissionId !== source.id || saved.assessmentId !== source.assessmentId || saved.assessmentTitle !== source.assessmentTitle
      || saved.learnerId !== source.learnerId || saved.referenceId !== source.referenceId || saved.policyVersion !== source.policyVersion
      || saved.revision !== original.expectedRevision || saved.feedback !== currentMark.feedback || saved.parentVisible !== original.parentVisible
      || saved.model !== source.model || currentMark.model !== source.model || !sameNative(saved.nativeResult, markNative(currentMark, source.policyVersion))) return invalid();
  } catch { return invalid(); }
}
