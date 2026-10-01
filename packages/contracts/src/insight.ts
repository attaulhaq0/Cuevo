import { z } from 'zod';
export const insightEvidenceSchema = z.object({ resultId: z.uuid(), evidenceId: z.uuid(), referenceId: z.uuid(), referenceVersion: z.string().min(1).max(100), score: z.number().min(0), maxScore: z.number().positive().max(100000) }).strict();
const optionSchema = z.object({ activityId: z.uuid(), title: z.string().min(1).max(200), instructions: z.string().min(1).max(4000), kind: z.enum(['practice', 'reflection', 'reading']) }).strict();
export const insightContextSchema = z.object({
  schemaVersion: z.literal('1'), learnerId: z.uuid(), courseId: z.uuid(), classId: z.uuid(),
  reference: z.object({ id: z.uuid(), version: z.string().min(1).max(100), title: z.string().min(1).max(200) }).strict(),
  recentResults: z.array(insightEvidenceSchema).min(1).max(10),
  observations: z.array(z.object({ id: z.uuid(), kind: z.enum(['practice', 'revision', 'reflection']), sourceObjectId: z.uuid(), sourceEventId: z.uuid(), occurredAt: z.iso.datetime({ offset: true }) }).strict()).max(20),
  priorInterventions: z.array(z.object({ id: z.uuid(), status: z.enum(['ASSIGNED', 'COMPLETED', 'MEASURED']), baselineResultId: z.uuid(), outcome: z.object({ id: z.uuid(), status: z.enum(['improved', 'no_meaningful_change', 'inconclusive']), difference: z.number(), minimumChange: z.number().positive(), baselineResultId: z.uuid(), followUpResultId: z.uuid() }).strict().nullable() }).strict()).max(10),
  learningOptions: z.array(optionSchema).max(10), coverage: z.literal('BOUNDED_AUTHORIZED_CONTEXT'),
}).strict();
export type InsightContext = z.infer<typeof insightContextSchema>;
const workflowRateSchema=z.object({numerator:z.number().int().nonnegative(),denominator:z.number().int().nonnegative(),rate:z.number().min(0).max(1).nullable()}).strict().superRefine((value,ctx)=>{if(value.numerator>value.denominator||(value.denominator===0?value.rate!==null:value.rate===null||Math.abs(value.rate-value.numerator/value.denominator)>1e-9))ctx.addIssue({code:'custom',message:'Rates require an explicit nonempty denominator.'});});
export const intelligenceMetricsSchema=z.object({windowDays:z.number().int().positive(),mode:z.enum(['FIXTURE','LIVE']),scope:z.literal('CURRENT_AUTHORIZED_RUNS'),completedRuns:z.number().int().nonnegative(),failedRuns:z.number().int().nonnegative(),groundedResponse:workflowRateSchema,acceptance:workflowRateSchema,completion:workflowRateSchema,observedImprovement:workflowRateSchema,meanLatencyMs:z.number().nonnegative().nullable(),totalCost:z.number().nonnegative(),costPerApprovedWorkflow:z.number().nonnegative().nullable(),unsupportedClaimRate:z.null(),unauthorizedContextLeakageRate:z.null(),invalidToolCallRate:z.null(),humanOverrideRate:z.null(),unknownMetricReason:z.literal('NO_DEDICATED_OBSERVATION_DENOMINATOR')}).strict();

