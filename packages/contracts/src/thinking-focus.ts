import { z } from 'zod';
import { learningResourceSchema } from './resource';

export const THINKING_FOCUS_TAXONOMY_VERSION = 'revised-bloom-2001-cuevo-v1' as const;
export const COGNITIVE_PROCESSES = ['REMEMBER', 'UNDERSTAND', 'APPLY', 'ANALYZE', 'EVALUATE', 'CREATE'] as const;
export const cognitiveProcessSchema = z.enum(COGNITIVE_PROCESSES);
export type CognitiveProcess = z.infer<typeof cognitiveProcessSchema>;
const boundedText = z.string().trim().min(1).max(2000);
const title = z.string().trim().min(1).max(200);
const instant = z.iso.datetime({ offset: true });

/** A task's reviewed demand, never a learner level, prerequisite or award. */
export const thinkingFocusSchema = z.object({
  taxonomyVersion: z.literal(THINKING_FOCUS_TAXONOMY_VERSION),
  primaryProcess: cognitiveProcessSchema,
  additionalProcesses: z.array(cognitiveProcessSchema).max(5),
}).strict().superRefine((focus, context) => {
  if (new Set(focus.additionalProcesses).size !== focus.additionalProcesses.length || focus.additionalProcesses.includes(focus.primaryProcess)) context.addIssue({ code: 'custom', message: 'Additional task focuses must be distinct from each other and the primary focus.' });
});
export type ThinkingFocus = z.infer<typeof thinkingFocusSchema>;

export const thinkingFocusTargetSchema = z.object({
  kind: z.enum(['ACTIVITY', 'ASSESSMENT', 'CRITERION']), id: z.uuid(),
  criterionKey: z.string().trim().min(1).max(100).nullable(),
}).strict().superRefine((target, context) => {
  if ((target.kind === 'CRITERION') !== (target.criterionKey !== null)) context.addIssue({ code: 'custom', message: 'Only an exact criterion target requires a criterion key.' });
});
export type ThinkingFocusTarget = z.infer<typeof thinkingFocusTargetSchema>;
export const thinkingFocusDraftInputSchema = z.object({
  expectedRevision: z.number().int().nonnegative(), expectedSourceVersion: boundedText,
  focus: thinkingFocusSchema, rationale: boundedText,
}).strict();
export type ThinkingFocusDraftInput = z.infer<typeof thinkingFocusDraftInputSchema>;
export const thinkingFocusReviewInputSchema = z.object({
  expectedRevision: z.number().int().positive(), expectedSourceVersion: boundedText,
  decision: z.enum(['APPROVE', 'REJECT', 'WITHDRAW']), reason: boundedText, confirmReview: z.literal(true),
}).strict();
export type ThinkingFocusReviewInput = z.infer<typeof thinkingFocusReviewInputSchema>;

export const thinkingFocusClassificationSchema = z.object({
  id: z.uuid(), revision: z.number().int().positive(), focus: thinkingFocusSchema, rationale: boundedText,
  authorId: z.uuid(), authoredAt: instant, reviewerId: z.uuid().nullable(), reviewedAt: instant.nullable(), reviewReason: boundedText.nullable(),
}).strict().superRefine((classification, context) => {
  const review = [classification.reviewerId, classification.reviewedAt, classification.reviewReason];
  if (review.some(value => value !== null) && review.some(value => value === null)) context.addIssue({ code: 'custom', message: 'Review identity, time and reason must be supplied together.' });
  if (classification.reviewerId === classification.authorId) context.addIssue({ code: 'custom', message: 'A different authorized actor must review the classification.' });
  if (classification.reviewedAt && Date.parse(classification.reviewedAt) < Date.parse(classification.authoredAt)) context.addIssue({ code: 'custom', message: 'A review cannot precede the authored classification.' });
});
export type ThinkingFocusClassification = z.infer<typeof thinkingFocusClassificationSchema>;
export const thinkingFocusSourceSchema = z.object({
  title, instructions: z.string().max(50000), contentRevision: z.number().int().positive().nullable(),
  preparationVersion: z.number().int().positive().nullable(), policyVersion: z.number().int().positive().nullable(),
  rubricVersion: z.string().trim().min(1).max(2000).nullable(), criterionTitle: title.nullable(),
}).strict();
export type ThinkingFocusSource = z.infer<typeof thinkingFocusSourceSchema>;
export const thinkingFocusResponseSchema = z.object({
  id: z.uuid().optional(), schemaVersion: z.literal('1'), target: thinkingFocusTargetSchema, courseId: z.uuid(), targetTitle: title,
  sourceVersion: boundedText, status: z.enum(['UNCLASSIFIED', 'AWAITING_REVIEW', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'SOURCE_CHANGED']),
  revision: z.number().int().nonnegative(), classification: thinkingFocusClassificationSchema.nullable(), source: thinkingFocusSourceSchema,
  canAuthor: z.boolean(), canReview: z.boolean(),
}).strict().superRefine((response, context) => {
  if (response.id !== undefined && response.id !== response.classification?.id) context.addIssue({ code: 'custom', message: 'A mutation receipt must identify its exact classification revision.' });
  if (response.status === 'UNCLASSIFIED') {
    if (response.revision !== 0 || response.classification !== null) context.addIssue({ code: 'custom', message: 'Unclassified work has no classification revision.' });
  } else if (!response.classification || response.revision !== response.classification.revision) context.addIssue({ code: 'custom', message: 'Classification identity must match its immutable revision.' });
  if (response.status === 'AWAITING_REVIEW' && response.classification?.reviewerId !== null) context.addIssue({ code: 'custom', message: 'A pending classification has no review receipt.' });
  if (['APPROVED', 'REJECTED', 'WITHDRAWN'].includes(response.status) && !response.classification?.reviewerId) context.addIssue({ code: 'custom', message: 'A review outcome requires an explicit reviewer receipt.' });
});
export type ThinkingFocusResponse = z.infer<typeof thinkingFocusResponseSchema>;

export const thinkingFocusQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(25), cursor: z.uuid().optional() }).strict();
export const thinkingFocusHistoryQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(25).default(25), cursor: z.uuid().optional() }).strict();
function rowIdentity(row: ThinkingFocusResponse) { return `${row.target.kind}:${row.target.id}:${row.target.criterionKey ?? ''}:${row.revision}`; }
export const thinkingFocusHistorySchema = z.object({
  schemaVersion: z.literal('1'), target: thinkingFocusTargetSchema, courseId: z.uuid(), targetTitle: title,
  sourceVersion: boundedText, items: z.array(thinkingFocusResponseSchema).max(25), nextCursor: z.uuid().nullable(),
}).strict().superRefine((history, context) => {
  if (history.items.some(row => row.courseId !== history.courseId || row.target.kind !== history.target.kind || row.target.id !== history.target.id || row.target.criterionKey !== history.target.criterionKey) || new Set(history.items.map(rowIdentity)).size !== history.items.length) context.addIssue({ code: 'custom', message: 'History must contain distinct revisions of the exact target and course.' });
});
export type ThinkingFocusHistory = z.infer<typeof thinkingFocusHistorySchema>;
export const thinkingFocusQueueSchema = z.object({
  schemaVersion: z.literal('1'), courseId: z.uuid(), items: z.array(thinkingFocusResponseSchema).max(100), nextCursor: z.uuid().nullable(),
}).strict().superRefine((queue, context) => {
  if (queue.items.some(row => row.courseId !== queue.courseId) || new Set(queue.items.map(rowIdentity)).size !== queue.items.length) context.addIssue({ code: 'custom', message: 'A review queue requires distinct exact current-course rows.' });
});
export type ThinkingFocusQueue = z.infer<typeof thinkingFocusQueueSchema>;
export const thinkingFocusSnapshotSchema = z.object({
  schemaVersion: z.literal('1'), kind: z.enum(['completion', 'submission']), id: z.uuid(), resultId: z.uuid().optional(), recorded: z.boolean(),
  scope: z.literal('RECORDED_TASK_DEMAND_NOT_ATTAINMENT'), items: z.array(thinkingFocusResponseSchema).max(1031),
}).strict().superRefine((snapshot, context) => {
  if (snapshot.resultId !== undefined && snapshot.kind !== 'submission') context.addIssue({ code: 'custom', message: 'Only a native-result submission wrapper carries a result identity.' });
  if (snapshot.items.some(row => row.canAuthor || row.canReview) || !snapshot.recorded && snapshot.items.length > 0 || new Set(snapshot.items.map(rowIdentity)).size !== snapshot.items.length) context.addIssue({ code: 'custom', message: 'Recorded snapshots retain distinct read-only source rows; an unrecorded source has none.' });
  const encoded = new TextEncoder().encode(JSON.stringify(snapshot));
  if (encoded.byteLength > 500000) context.addIssue({ code: 'custom', message: 'Snapshot capacity requires review rather than truncated source evidence.' });
});
export type ThinkingFocusSnapshot = z.infer<typeof thinkingFocusSnapshotSchema>;

export const thinkingFocusMaterialsQuerySchema=z.object({sourceVersion:boundedText,criterionKey:z.string().trim().min(1).max(100).optional()}).strict();
export const thinkingFocusMaterialManifestSchema=z.object({schemaVersion:z.literal('1'),target:thinkingFocusTargetSchema,courseId:z.uuid(),sourceVersion:boundedText,items:z.array(learningResourceSchema).max(100)}).strict().superRefine((manifest,context)=>{
  const kind=manifest.target.kind==='ACTIVITY'?'activity':'assessment';
  if(new Set(manifest.items.map(item=>item.id)).size!==manifest.items.length||manifest.items.some(item=>item.courseId!==manifest.courseId||item.targetKind!==kind||item.targetId!==manifest.target.id||!['ATTACHED','PUBLISHED'].includes(item.state)||item.assetState!=='AVAILABLE'))context.addIssue({code:'custom',message:'Review material must identify distinct available exact source revisions.'});
  if(new TextEncoder().encode(JSON.stringify(manifest)).byteLength>500000)context.addIssue({code:'custom',message:'A complete material manifest requires review when its capacity is exceeded.'});
});
export type ThinkingFocusMaterialManifest=z.infer<typeof thinkingFocusMaterialManifestSchema>;

const bilingual = z.object({ en: boundedText, ar: boundedText }).strict();
const catalogueSourceSchema = z.object({
  sourceId: z.string().min(1).max(100), citation: boundedText, url: z.url(),
  accessedOn: z.iso.date(), sourceVersion: z.string().min(1).max(200),
  access: z.enum(['PUBLIC_REFERENCE_CAPTURE', 'BIBLIOGRAPHIC_ONLY']),
  snapshotSha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
}).strict().superRefine((source, context) => {
  if ((source.access === 'PUBLIC_REFERENCE_CAPTURE') !== (source.snapshotSha256 !== null)) context.addIssue({ code: 'custom', message: 'Only captured public reference bytes have a snapshot digest.' });
});
export const thinkingFocusCatalogueSchema = z.object({
  schemaVersion: z.literal('1'), taxonomyVersion: z.literal(THINKING_FOCUS_TAXONOMY_VERSION), title: bilingual,
  interpretation: z.literal('TASK_DEMAND_NOT_LEARNER_LEVEL'), contentAuthorship: z.literal('CUEVO_ORIGINAL_PARAPHRASES'),
  reviewRequirement: z.literal('EXACT_SOURCE_HUMAN_REVIEW'), knowledgeDimension: z.literal('NOT_IMPLEMENTED'), limitations: bilingual,
  rights: z.object({ content: z.literal('CUEVO_AUTHORED_ORIGINAL'), externalFullTextLicensed: z.literal(false), publisherApproval: z.literal(false), externalTablesReproduced: z.literal(false) }).strict(),
  sources: z.array(catalogueSourceSchema).min(1).max(10),
  processes: z.array(z.object({ process: cognitiveProcessSchema, label: bilingual, description: bilingual, learnerPrompt: bilingual, sourceIds: z.array(z.string().min(1).max(100)).min(1).max(10) }).strict()).length(6),
}).strict().superRefine((catalogue, context) => {
  const sources = new Set(catalogue.sources.map(source => source.sourceId));
  if (sources.size !== catalogue.sources.length || new Set(catalogue.processes.map(process => process.process)).size !== 6) context.addIssue({ code: 'custom', message: 'Category and source identities must be complete and unique.' });
  if (catalogue.processes.some(process => new Set(process.sourceIds).size !== process.sourceIds.length || process.sourceIds.some(sourceId => !sources.has(sourceId)))) context.addIssue({ code: 'custom', message: 'Category references must identify distinct recorded sources.' });
});
export type ThinkingFocusCatalogue = z.infer<typeof thinkingFocusCatalogueSchema>;
