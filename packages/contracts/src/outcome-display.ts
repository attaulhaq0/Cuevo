import { z } from 'zod';
import { nativeInterventionOutcomeSchema } from './improvement';

const name = z.string().min(1).max(200).refine(value => value.trim().length > 0, 'A source label must contain text.').nullable();
/** Read-time context only. It does not replace measurement facts or authorize source access. */
export const outcomeDisplayContextSchema = z.object({
  status: z.enum(['READY', 'REQUIRES_REVIEW']), labelBasis: z.literal('CURRENT_REGISTERED_NAMES_AND_IMMUTABLE_TASK'),
  learnerId: z.uuid(), identityRequiresReview: z.boolean(), learnerName: name, className: name,
  yearGroupName: name, academicYearName: name, courseTitle: name, practiceTitle: name,
  baselineAssessmentTitle: name, followUpAssessmentTitle: name,
  baselineSubmittedAt: z.iso.datetime({ offset: true }).nullable(), followUpSubmittedAt: z.iso.datetime({ offset: true }).nullable(),
}).strict().superRefine((value, context) => {
  if (value.status === 'READY' && (value.identityRequiresReview || Object.values(value).some(field => field === null))) {
    context.addIssue({ code: 'custom', message: 'Ready outcome context requires complete non-ambiguous source labels and dates.' });
  }
});
export type OutcomeDisplayContext = z.infer<typeof outcomeDisplayContextSchema>;

// This is the existing numeric learner outcome value shape; display metadata is a separate extension.
export const numericOutcomeValueSchema = z.object({
  id: z.uuid(), interventionId: z.uuid(), baselineResultId: z.uuid(), followUpResultId: z.uuid(),
  status: z.enum(['improved', 'no_meaningful_change', 'inconclusive']), difference: z.number(), minimumChange: z.number().positive().max(100000),
  baseline: z.object({ score: z.number().min(0), maxScore: z.number().positive().max(100000) }).strict(),
  followUp: z.object({ score: z.number().min(0), maxScore: z.number().positive().max(100000) }).strict(),
  reason: z.enum(['OBSERVED_RAW_SCORE_CHANGE', 'FOLLOW_UP_LOWER']), limitation: z.literal('OBSERVED_CHANGE_NOT_CAUSAL_PROOF'), measuredAt: z.iso.datetime({ offset: true }),
  requiresReview: z.boolean().optional(), reviewReason: z.literal('ACADEMIC_SOURCE_CHANGED').nullable().optional(),
}).strict();
export const numericOutcomeDisplaySchema = numericOutcomeValueSchema.extend({ context: outcomeDisplayContextSchema.optional() });
export const nativeOutcomeDisplaySchema = nativeInterventionOutcomeSchema.safeExtend({ context: outcomeDisplayContextSchema.optional() });
export const outcomeDisplaySchema = z.union([numericOutcomeDisplaySchema, nativeOutcomeDisplaySchema]);
