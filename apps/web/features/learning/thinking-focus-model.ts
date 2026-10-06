import { thinkingFocusCatalogueSchema, thinkingFocusDraftInputSchema, thinkingFocusQueueSchema, thinkingFocusResponseSchema, thinkingFocusReviewInputSchema, thinkingFocusSnapshotSchema, thinkingFocusTargetSchema, thinkingFocusMaterialManifestSchema, type CognitiveProcess, type ThinkingFocusCatalogue, type ThinkingFocusResponse, type ThinkingFocusSnapshot, type ThinkingFocusTarget } from '@cuevo/contracts';
import { LearningApiError, type Command } from '../../shared/api/client';
import { parseRubric } from '../academic/model';

export type ThinkingFocusKind = 'activity' | 'assessment' | 'criterion';
export type ThinkingFocusSelection={target:ThinkingFocusTarget;sourceVersion:string;revision:number;cursor:string|null};
export function parseThinkingFocusSelection(value:unknown):ThinkingFocusSelection|null{if(!value||typeof value!=='object'||Array.isArray(value))return null;const row=value as Record<string,unknown>,target=thinkingFocusTargetSchema.safeParse(row.target),cursor=typeof row.cursor==='string'?/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(row.cursor):row.cursor===null;return Object.keys(row).length===4&&target.success&&cursor&&typeof row.sourceVersion==='string'&&!!row.sourceVersion.trim()&&row.sourceVersion.length<=2000&&Number.isSafeInteger(row.revision)&&Number(row.revision)>=0?{target:target.data,sourceVersion:row.sourceVersion,revision:Number(row.revision),cursor:row.cursor as string|null}:null;}
export function currentThinkingFocusSelection<T extends{target:ThinkingFocusTarget;courseId:string;sourceVersion:string;revision:number}>(rows:T[],selection:ThinkingFocusSelection|null,courseId:string,current:boolean):T|null{if(!selection||!current)return null;const matches=rows.filter(row=>row.courseId===courseId&&row.target.kind===selection.target.kind&&row.target.id===selection.target.id&&row.target.criterionKey===selection.target.criterionKey&&row.sourceVersion===selection.sourceVersion&&row.revision===selection.revision);return matches.length===1?matches[0]:null;}
export function thinkingFocusTarget(kind: ThinkingFocusKind, id: string, criterionKey?: string): ThinkingFocusTarget {
  return thinkingFocusTargetSchema.parse({ kind: kind.toUpperCase(), id, criterionKey: criterionKey ?? null });
}
export function thinkingFocusPath(kind: ThinkingFocusKind, id: string, criterionKey?: string, action?: 'draft' | 'review' | 'history') {
  const target = thinkingFocusTarget(kind, id, criterionKey);
  return `/v1/thinking-focus/${kind}/${target.id}${action ? `/${action}` : ''}${target.criterionKey ? `?criterionKey=${encodeURIComponent(target.criterionKey)}` : ''}`;
}
export function thinkingFocusMaterialsPath(target: ThinkingFocusTarget, sourceVersion: string, resource?: { id: string; revisionId: string }) {
  const query = new URLSearchParams({ sourceVersion });
  if (target.criterionKey) query.set('criterionKey', target.criterionKey);
  return `/v1/thinking-focus/${target.kind.toLowerCase()}/${target.id}/materials${resource ? `/${resource.id}/${resource.revisionId}/download` : ''}?${query}`;
}
export function parseThinkingFocusMaterials(value: unknown, source: ThinkingFocusResponse) {
  const parsed = thinkingFocusMaterialManifestSchema.safeParse(value);
  if (!parsed.success || parsed.data.courseId !== source.courseId || parsed.data.sourceVersion !== source.sourceVersion || parsed.data.target.kind !== source.target.kind || parsed.data.target.id !== source.target.id || parsed.data.target.criterionKey !== source.target.criterionKey) throw new LearningApiError('invalid');
  return parsed.data;
}
export function parseThinkingFocusRead(value: unknown, target: ThinkingFocusTarget, courseId: string): ThinkingFocusResponse {
  const parsed = thinkingFocusResponseSchema.safeParse(value);
  if (!parsed.success || parsed.data.courseId !== courseId || parsed.data.target.kind !== target.kind || parsed.data.target.id !== target.id || parsed.data.target.criterionKey !== target.criterionKey) throw new LearningApiError('invalid');
  return parsed.data;
}
export function parseThinkingFocusRubric(value: unknown, assessment: { rubricId: string; courseId: string }, source: ThinkingFocusResponse) {
  const rubric = parseRubric(value);
  if (rubric.id !== assessment.rubricId || rubric.courseId !== assessment.courseId || source.courseId !== assessment.courseId || source.source.rubricVersion !== `${rubric.id}:${rubric.version}`) throw new LearningApiError('invalid');
  return rubric;
}
export function thinkingFocusActionAvailable(current: ThinkingFocusResponse | null, action: 'draft' | 'review' | null, frozen: ThinkingFocusResponse | null, pending: boolean) {
  if (!current || !action || !frozen) return false;
  return (action === 'draft' ? current.canAuthor : current.canReview) || pending && current.sourceVersion === frozen.sourceVersion;
}
export function currentThinkingFocusRead(read: { scope: string | null; value: ThinkingFocusResponse } | null, scope: string | null) { return scope && read?.scope === scope ? read.value : null; }
export function parseThinkingFocusCatalogue(value: unknown): ThinkingFocusCatalogue { return thinkingFocusCatalogueSchema.parse(value); }
export function parseThinkingFocusQueue(value: unknown, courseId: string) {
  const parsed = thinkingFocusQueueSchema.safeParse(value);
  if (!parsed.success || parsed.data.courseId !== courseId) throw new LearningApiError('invalid');
  return parsed.data;
}
export function parseThinkingFocusSnapshot(value: unknown, type: 'completion' | 'submission' | 'result', sourceId: string): ThinkingFocusSnapshot {
  const parsed = thinkingFocusSnapshotSchema.safeParse(value);
  if (!parsed.success || (type === 'result' ? parsed.data.kind !== 'submission' || parsed.data.resultId !== sourceId : parsed.data.kind !== type || parsed.data.id !== sourceId)) throw new LearningApiError('invalid');
  return parsed.data;
}
export function buildThinkingFocusDraft(values: FormData, basis: ThinkingFocusResponse) {
  const additionalProcesses = [...values.keys()].filter(key => key.startsWith('additional:') && values.get(key) === 'on').map(key => key.slice('additional:'.length) as CognitiveProcess);
  return thinkingFocusDraftInputSchema.parse({ expectedRevision: basis.revision, expectedSourceVersion: basis.sourceVersion, focus: { taxonomyVersion: 'revised-bloom-2001-cuevo-v1', primaryProcess: values.get('primaryProcess'), additionalProcesses }, rationale: values.get('rationale') });
}
export function validateThinkingFocusReceipt(receipt: unknown, command: Command, basis: ThinkingFocusResponse, actorId: string, action: 'draft' | 'review') {
  try { validateReceiptSource(receipt, command, basis, actorId, action); }
  catch { throw new LearningApiError('invalid', true); }
}
function validateReceiptSource(receipt: unknown, command: Command, basis: ThinkingFocusResponse, actorId: string, action: 'draft' | 'review') {
  const result = parseThinkingFocusRead(receipt, basis.target, basis.courseId);
  const commandPath = thinkingFocusPath(basis.target.kind.toLowerCase() as ThinkingFocusKind, basis.target.id, basis.target.criterionKey ?? undefined, action);
  if (command.path !== commandPath || !result.id || result.id !== result.classification?.id || result.revision !== basis.revision + 1 || result.sourceVersion !== basis.sourceVersion || JSON.stringify(result.source) !== JSON.stringify(basis.source)) throw new LearningApiError('invalid', true);
  const recorded = result.classification;
  if (action === 'draft') {
    const payload = thinkingFocusDraftInputSchema.parse(command.body);
    if (payload.expectedRevision !== basis.revision || payload.expectedSourceVersion !== basis.sourceVersion || result.status !== 'AWAITING_REVIEW' || JSON.stringify(recorded.focus) !== JSON.stringify(payload.focus) || recorded.rationale !== payload.rationale || recorded.reviewerId !== null || recorded.authorId !== actorId) throw new LearningApiError('invalid', true);
  } else {
    const payload = thinkingFocusReviewInputSchema.parse(command.body);
    const status = { APPROVE: 'APPROVED', REJECT: 'REJECTED', WITHDRAW: 'WITHDRAWN' } as const;
    if (payload.expectedRevision !== basis.revision || payload.expectedSourceVersion !== basis.sourceVersion || !basis.classification || result.status !== status[payload.decision] || recorded.reviewerId !== actorId || recorded.reviewReason !== payload.reason || recorded.authorId !== basis.classification.authorId || recorded.authoredAt !== basis.classification.authoredAt || JSON.stringify(recorded.focus) !== JSON.stringify(basis.classification.focus) || recorded.rationale !== basis.classification.rationale) throw new LearningApiError('invalid', true);
  }
}
