import { z } from 'zod';

export const learnerStateQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(25), cursor: z.uuid().optional(), learnerId: z.uuid().optional() }).strict();
export const classLearningSummaryQuerySchema=z.object({limit:z.coerce.number().int().min(1).max(100).default(25),cursor:z.uuid().optional()}).strict();
const observationCountSchema = z.object({ count: z.number().int().min(0).nullable(), observationIds: z.array(z.uuid()).max(1000) });
const nativeNumericSchema = z.object({ type: z.literal('numeric'), score: z.number().min(0), maxScore: z.number().positive().max(100000), policyVersion: z.number().int().positive(), normalized: z.null() });
const nativeRubricSchema = z.object({ type: z.literal('rubric'), rubricId: z.uuid(), rubricTitle: z.string().min(1), rubricVersion: z.string().min(1), policyVersion: z.number().int().positive(), normalized: z.null(), criteria: z.array(z.object({ criterionKey: z.string().min(1), criterionTitle: z.string().min(1), levelKey: z.string().min(1), levelLabel: z.string().min(1), levelDescription: z.string().min(1) }).strict()).min(1).max(30) }).strict();
export const learnerSupportItemSchema = z.object({
  id: z.uuid(), recommendationId: z.uuid(), learnerId: z.uuid(), referenceId: z.uuid(), baselineResultId: z.uuid(),
  title: z.string().min(1).max(200), instructions: z.string().min(1).max(4000), status: z.enum(['ASSIGNED', 'COMPLETED', 'MEASURED']),
  createdAt: z.iso.datetime({ offset: true }), completedAt: z.iso.datetime({ offset: true }).nullable(), followUpAssessmentId: z.uuid().nullable(),
}).strict();
export const learnerOutcomeSchema = z.object({
  id: z.uuid(), interventionId: z.uuid(), baselineResultId: z.uuid(), followUpResultId: z.uuid(),
  status: z.enum(['improved', 'no_meaningful_change', 'inconclusive']), difference: z.number(), minimumChange: z.number().positive().max(100000),
  baseline: z.object({ score: z.number().min(0), maxScore: z.number().positive().max(100000) }).strict(),
  followUp: z.object({ score: z.number().min(0), maxScore: z.number().positive().max(100000) }).strict(),
  reason: z.enum(['OBSERVED_RAW_SCORE_CHANGE', 'FOLLOW_UP_LOWER']), limitation: z.literal('OBSERVED_CHANGE_NOT_CAUSAL_PROOF'), measuredAt: z.iso.datetime({ offset: true }),
}).strict();
export const learnerStateSchema = z.object({
  learnerId: z.uuid(), status: z.enum(['READY', 'UNKNOWN']), freshness: z.enum(['CURRENT', 'STALE', 'APPROVED_PROJECTION']).optional(),
  generatedAt: z.iso.datetime({ offset: true }).nullable(), version: z.number().int().positive().nullable(),
  academic: z.array(z.object({ resultId: z.uuid(), referenceId: z.uuid(), referenceVersion: z.string(), nativeResult: z.discriminatedUnion('type',[nativeNumericSchema,nativeRubricSchema]), evidenceId: z.uuid(), observedAt: z.iso.datetime({ offset: true }) })).max(100),
  development: z.object({ completeness: z.literal('RECORDED_ONLY').optional(), practice: observationCountSchema, revision: observationCountSchema, reflection: observationCountSchema, windowStart: z.iso.datetime({ offset: true }).nullable(), windowEnd: z.iso.datetime({ offset: true }).nullable() }),
  engagement: z.object({ completedActivityCount: z.number().int().min(0).nullable(), lastCompletedAt: z.iso.datetime({ offset: true }).nullable() }),
  support: z.object({ activeInterventionIds: z.array(z.uuid()).max(100), items: z.array(learnerSupportItemSchema).max(100).default([]) }),
  impact: z.object({ status: z.enum(['unmeasured', 'measured']), measurementIds: z.array(z.uuid()).max(100), outcomes: z.array(learnerOutcomeSchema).max(100).default([]) }),
  sourceEventIds: z.array(z.uuid()).max(1000),
}).superRefine((value, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
  if (value.status === 'UNKNOWN' && (value.academic.length || value.generatedAt !== null || value.version !== null || value.development.practice.count !== null || value.development.revision.count !== null || value.development.reflection.count !== null || value.engagement.completedActivityCount !== null || value.sourceEventIds.length)) fail('Unknown state cannot assert measurements');
  if ((value.status === 'UNKNOWN' || value.freshness === 'APPROVED_PROJECTION') && (value.support.items.length || value.support.activeInterventionIds.length || value.impact.outcomes.length || value.impact.measurementIds.length)) fail('Unknown or parent projection cannot assert internal support/impact');
  const sameIds = (a: string[], b: string[]) => new Set(a).size === a.length && new Set(b).size === b.length && a.length === b.length && a.every(id => b.includes(id));
  if (!sameIds(value.support.activeInterventionIds, value.support.items.filter(item => item.status !== 'MEASURED').map(item => item.id))) fail('Active support requires matching source items');
  if (!sameIds(value.impact.measurementIds, value.impact.outcomes.map(item => item.id)) || (value.impact.status === 'measured') !== (value.impact.outcomes.length > 0)) fail('Measured impact requires matching outcome sources');
  if (new Set(value.support.items.map(item => item.id)).size !== value.support.items.length) fail('Support source IDs must be unique');
  for (const row of value.academic) {
    if (row.nativeResult.type === 'numeric' && row.nativeResult.score > row.nativeResult.maxScore) fail('Native score exceeds scale');
    if (row.nativeResult.type === 'rubric' && new Set(row.nativeResult.criteria.map(criterion => criterion.criterionKey)).size !== row.nativeResult.criteria.length) fail('Rubric native criteria must be unique');
  }
  for (const item of value.support.items) {
    if (item.learnerId !== value.learnerId || (item.status === 'ASSIGNED') !== (item.completedAt === null) || item.completedAt && Date.parse(item.completedAt) < Date.parse(item.createdAt)) fail('Support must match learner and valid completion source');
    if (item.status === 'MEASURED' && !value.impact.outcomes.some(outcome => outcome.interventionId === item.id)) fail('Measured support needs outcome source');
  }
  for (const outcome of value.impact.outcomes) {
    const support = value.support.items.find(item => item.id === outcome.interventionId);
    if (!support || support.status !== 'MEASURED' || support.baselineResultId !== outcome.baselineResultId || support.completedAt === null || Date.parse(outcome.measuredAt) < Date.parse(support.completedAt)) fail('Outcome must trace to completed support and baseline');
    if (outcome.baseline.maxScore !== outcome.followUp.maxScore || outcome.baseline.score > outcome.baseline.maxScore || outcome.followUp.score > outcome.followUp.maxScore || Math.abs(outcome.difference - (outcome.followUp.score - outcome.baseline.score)) > 1e-9) fail('Outcome must preserve compatible native values');
    const expectedStatus = outcome.difference >= outcome.minimumChange ? 'improved' : Math.abs(outcome.difference) < outcome.minimumChange ? 'no_meaningful_change' : 'inconclusive';
    const expectedReason = outcome.difference <= -outcome.minimumChange ? 'FOLLOW_UP_LOWER' : 'OBSERVED_RAW_SCORE_CHANGE';
    if (outcome.status !== expectedStatus || outcome.reason !== expectedReason) fail('Outcome status must match observed native change');
  }
});

const classSourceIds=z.array(z.uuid()).max(10);
const classObservationSchema=z.object({count:z.number().int().nonnegative().nullable(),observationIds:classSourceIds,moreSourceIds:z.boolean()}).strict().superRefine((value,ctx)=>{if(value.count===null&&(value.observationIds.length||value.moreSourceIds)||value.count!==null&&(value.count<value.observationIds.length||value.moreSourceIds!==(value.count>value.observationIds.length)))ctx.addIssue({code:'custom',message:'Recorded observation counts must match cited bounded sources.'});});
const classAcademicSourceSchema=z.object({resultId:z.uuid(),evidenceId:z.uuid(),referenceId:z.uuid(),referenceVersion:z.string().min(1),observedAt:z.iso.datetime({offset:true}),nativeResult:z.discriminatedUnion('type',[nativeNumericSchema,nativeRubricSchema])}).strict();
const classSummaryRowSchema=z.object({learnerId:z.uuid(),learnerName:z.string().min(1).max(200),academic:z.object({numericCount:z.number().int().nonnegative(),rubricCount:z.number().int().nonnegative(),sources:z.array(classAcademicSourceSchema).max(10),moreSources:z.boolean()}).strict(),observed:z.object({practice:classObservationSchema,revision:classObservationSchema,reflection:classObservationSchema}).strict(),support:z.object({assignedCount:z.number().int().nonnegative(),completedCount:z.number().int().nonnegative(),measuredCount:z.number().int().nonnegative(),interventionIds:classSourceIds}).strict(),outcomes:z.object({improvedCount:z.number().int().nonnegative(),noMeaningfulChangeCount:z.number().int().nonnegative(),inconclusiveCount:z.number().int().nonnegative(),measurementIds:classSourceIds}).strict()}).strict().superRefine((row,ctx)=>{const count=row.academic.numericCount+row.academic.rubricCount;if(count<row.academic.sources.length||row.academic.moreSources!==(count>row.academic.sources.length)||new Set(row.academic.sources.map(source=>source.resultId)).size!==row.academic.sources.length)ctx.addIssue({code:'custom',message:'Current academic record counts must match bounded source citations.'});for(const source of row.academic.sources)if(source.nativeResult.type==='numeric'&&source.nativeResult.score>source.nativeResult.maxScore)ctx.addIssue({code:'custom',message:'Native source exceeds its scale.'});const supportCount=row.support.assignedCount+row.support.completedCount+row.support.measuredCount;const outcomeCount=row.outcomes.improvedCount+row.outcomes.noMeaningfulChangeCount+row.outcomes.inconclusiveCount;if(row.support.interventionIds.length!==Math.min(supportCount,10)||new Set(row.support.interventionIds).size!==row.support.interventionIds.length||row.outcomes.measurementIds.length!==Math.min(outcomeCount,10)||new Set(row.outcomes.measurementIds).size!==row.outcomes.measurementIds.length)ctx.addIssue({code:'custom',message:'Support and outcome record counts require unique bounded source citations.'});});
export const classLearningSummarySchema=z.object({schoolId:z.uuid(),classId:z.uuid(),generatedAt:z.iso.datetime({offset:true}),scope:z.literal('CURRENT_CLASS_PAGE'),coverage:z.literal('NOT_ESTABLISHED'),observationCoverage:z.literal('RECORDED_ONLY'),windowStart:z.iso.datetime({offset:true}).nullable(),windowEnd:z.iso.datetime({offset:true}).nullable(),items:z.array(classSummaryRowSchema).max(100),nextCursor:z.uuid().nullable()}).strict().superRefine((summary,ctx)=>{if(new Set(summary.items.map(item=>item.learnerId)).size!==summary.items.length||(summary.windowStart===null)!==(summary.windowEnd===null))ctx.addIssue({code:'custom',message:'Class rows/window must be exact and unique.'});if(summary.windowStart!==null&&summary.windowEnd!==null&&Date.parse(summary.windowStart)>Date.parse(summary.windowEnd))ctx.addIssue({code:'custom',message:'Observation window must retain source time order.'});if(summary.windowStart===null&&summary.items.some(item=>['practice','revision','reflection'].some(kind=>item.observed[kind as keyof typeof item.observed].count!==null)))ctx.addIssue({code:'custom',message:'Missing observation policy cannot assert observed counts.'});});
export type ClassLearningSummary=z.infer<typeof classLearningSummarySchema>;
