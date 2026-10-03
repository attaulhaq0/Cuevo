import { resultPublicationResponseSchema, resultPublicationSchema } from '@cuevo/contracts';
import { LearningApiError, type Command } from '../../shared/api/client.ts';
import { canOpenWorkspace } from '../../shared/session/capabilities.ts';

export type PublicationReadContext = { apiUrl: string; membership: { userId: string; schoolId: string; role: string; entitlements: string[] } | null; accessToken: string | null; accessGeneration: number; online: boolean; status: string };
export type ResultPublicationRecord = ReturnType<typeof resultPublicationResponseSchema.parse>;
export type PublicationMutationBasis = { parentVisible: boolean; expectedPublicationRevision: number; expectedResultRevision: number };
export function recoverPublicationBasis(command: Command | undefined, resultId: string): PublicationMutationBasis | null {
  if (!command || command.path !== `/v1/results/${resultId}/publication`) return null;
  const input = resultPublicationSchema.safeParse(command.body);
  return input.success ? parsePublicationMutationBasis({ parentVisible: input.data.parentVisible, expectedPublicationRevision: input.data.expectedPublicationRevision, expectedResultRevision: input.data.expectedResultRevision }) : null;
}
export function parsePublicationMutationBasis(value: unknown): PublicationMutationBasis | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const basis = value as Record<string, unknown>;
  if (Object.keys(basis).length !== 3 || Object.keys(basis).some(key => !['parentVisible','expectedPublicationRevision','expectedResultRevision'].includes(key)) || typeof basis.parentVisible !== 'boolean' || !Number.isSafeInteger(basis.expectedPublicationRevision) || Number(basis.expectedPublicationRevision) < 0 || !Number.isSafeInteger(basis.expectedResultRevision) || Number(basis.expectedResultRevision) < 1) return null;
  return basis as PublicationMutationBasis;
}
export function publicationDecisionCurrent(source: ResultPublicationRecord | null, resultId: string, basis: PublicationMutationBasis): boolean {
  return !!source && source.id === resultId && source.parentVisible !== basis.parentVisible && source.publicationRevision === basis.expectedPublicationRevision && source.resultRevision === basis.expectedResultRevision;
}
export type PublicationRead<T> = { scope: string | null; value: T };
export function resultPublicationScope(context: PublicationReadContext, resultId: string, refresh: number): string | null {
  if (!context.online || context.status !== 'ready' || !context.accessToken || !context.membership || !['teacher','admin'].includes(context.membership.role) || !canOpenWorkspace('academic', context.membership.entitlements, context.membership.role)) return null;
  return JSON.stringify([context.apiUrl, context.membership.schoolId, context.membership.userId, context.membership.role, context.accessToken, context.online, context.accessGeneration, resultId, refresh]);
}
export function currentResultPublication<T>(read: PublicationRead<T> | null, scope: string | null): T | null { return scope && read?.scope === scope ? read.value : null; }
export function parseCurrentResultPublication(value: unknown, resultId: string): ResultPublicationRecord {
  const parsed = resultPublicationResponseSchema.safeParse(value);
  if (!parsed.success || parsed.data.id !== resultId) throw new LearningApiError('invalid');
  return parsed.data;
}
/** Only these result/sharing revisions are echoed by the current SQL receipt.
 * Reason and confirmation remain validated original payload, not invented echoes. */
export function validateResultPublicationReceipt(value: unknown, originalCommand: Command): ResultPublicationRecord {
  const match = originalCommand.path.match(/^\/v1\/results\/([^/]+)\/publication$/);
  const body = resultPublicationSchema.safeParse(originalCommand.body);
  try {
    if (!match || !body.success) throw new LearningApiError('invalid');
    const receipt = parseCurrentResultPublication(value, match[1]);
    if (receipt.parentVisible !== body.data.parentVisible || receipt.publicationRevision !== body.data.expectedPublicationRevision + 1 || receipt.resultRevision !== body.data.expectedResultRevision) throw new LearningApiError('invalid');
    return receipt;
  } catch { throw new LearningApiError('invalid', true); }
}
