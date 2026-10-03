import { isDeepStrictEqual } from 'node:util';
export type ContainerState = { id: string; running: boolean; startedAt: string };
export type ObservedContainer = ContainerState & { name: string; project?: string; networks: string[]; restarting: boolean; status: string; restartCount: number };
export function baselineExternalRestart(item: ObservedContainer) {
  return item.restarting === true && item.status === 'restarting' && item.restartCount > 0
    && Boolean(item.project && item.project !== 'cuevo') && item.networks.length > 0 && !item.networks.includes('cuevo-local');
}
export function sameContainerIdentities(before: ObservedContainer[], after: ObservedContainer[]) {
  const current = new Map(after.map(item => [item.id, item]));
  return before.every(item => { const next = current.get(item.id); return next?.name === item.name && next.project === item.project && isDeepStrictEqual([...next.networks].sort(), [...item.networks].sort()); });
}
export function requireCuevoLifecycleCommand(action: string, container: string) {
  if (!['stop', 'start'].includes(action) || container !== 'supabase_db_cuevo') throw Error('Outage lifecycle command must target only the validated Cuevo database.');
}
export function isCuevoDependencyContainer(name: string, project: string | undefined, networks: string[]) {
  return /^\/supabase_(db|storage|rest|realtime|inbucket|auth|kong)_cuevo$/.test(name) && project === 'cuevo' && networks.includes('cuevo-local');
}
export function validateOutageDatabaseContainer(value: unknown) {
  const item = value as { Name?: string; Config?: { Image?: string }; NetworkSettings?: { Ports?: Record<string, { HostPort?: string }[] | null>; Networks?: Record<string, unknown> } };
  if (!item || item.Name !== '/supabase_db_cuevo' || !item.Config?.Image?.includes('supabase/postgres:17.')
    || !item.NetworkSettings?.Ports?.['5432/tcp']?.some(port => port.HostPort === '56322')
    || !Object.keys(item.NetworkSettings?.Networks ?? {}).includes('cuevo-local')) throw Error('Outage drill refuses an unverified Cuevo database container.');
}
export function sameUnrelatedContainers(before: ContainerState[], after: ContainerState[]) {
  const index = new Map(after.map(item => [item.id, item]));
  return before.every(item => { const current = index.get(item.id); return current?.running === item.running && current.startedAt === item.startedAt; });
}
export function requireOriginalReceipt(before: unknown, after: unknown) {
  const original = before as { id?: unknown }; const replay = after as { id?: unknown };
  if (!original || typeof original.id !== 'string' || !replay || replay.id !== original.id || !isDeepStrictEqual(before, after)) throw Error('Original-key receipt changed during recovery.');
}
