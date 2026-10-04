import { isDeepStrictEqual } from 'node:util';
import { assertCuevoLocalTarget, type LocalStatus } from '../configure-local';
export type ProviderReadinessSample = { attempt: number; elapsedMs: number; state: 'STARTING' | 'UNHEALTHY' | 'STOPPED' | 'READY' | 'UNKNOWN'; cli: 'NOT_REQUESTED' | 'READY' | 'FAILED'; cliExitCode?: number | null; reason?: 'INSPECT_FAILED' | 'CLI_FAILED' | 'CLI_MALFORMED' | 'TARGET_INVALID' | 'DEADLINE_EXCEEDED' };
export type ProviderStatusResult = { exitCode: number | null; stdout: string; stderr: string };
/** Native Docker health is required by the pinned CLI even while SQL and Auth
 * are responding. Observe readiness; never disable that CLI health boundary. */
export async function waitForCuevoProviderReady(ports: { inspect: (remainingMs: number) => Promise<unknown>; readStatus: (remainingMs: number) => Promise<ProviderStatusResult>; now?: () => number; wait?: (ms: number) => Promise<void>; timeoutMs?: number; onSample?: (value: ProviderReadinessSample) => void }): Promise<LocalStatus> {
  const now = ports.now ?? (() => performance.now()), wait = ports.wait ?? (ms => new Promise(done => setTimeout(done, ms)));
  const timeout = ports.timeoutMs ?? 45000;
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 60000) throw Error('Provider readiness requires a bounded deadline.');
  const start = now(); let attempt = 0;
  const elapsed = () => Math.max(0, now() - start);
  const remaining = () => Math.max(1, Math.ceil(timeout - elapsed()));
  const emit = (sample: ProviderReadinessSample) => { sample.elapsedMs = elapsed(); ports.onSample?.(sample); };
  const refuseLate = (sample: ProviderReadinessSample) => {
    if (elapsed() < timeout) return;
    if (sample.cli === 'READY') sample.cli = 'FAILED';
    sample.reason = 'DEADLINE_EXCEEDED'; emit(sample);
    throw Error('Native Cuevo provider readiness deadline exceeded.');
  };
  while (now() - start < timeout) {
    const sample: ProviderReadinessSample = { attempt: ++attempt, elapsedMs: elapsed(), state: 'UNKNOWN', cli: 'NOT_REQUESTED' };
    let value: unknown;
    try { value = await ports.inspect(remaining()); } catch { sample.reason = 'INSPECT_FAILED'; emit(sample); throw Error('Cannot inspect the verified Cuevo database; details withheld.'); }
    try { validateOutageDatabaseContainer(value); } catch { sample.reason = 'TARGET_INVALID'; emit(sample); throw Error('Provider readiness refuses an unverified Cuevo database; details withheld.'); }
    const state = (value as { State?: { Running?: boolean; Restarting?: boolean; Health?: { Status?: string } } }).State;
    const native = state?.Running === false ? 'STOPPED' : state?.Running !== true ? 'UNKNOWN' : state.Restarting === true ? 'STARTING' : state.Restarting !== false ? 'UNKNOWN' : state.Health?.Status === 'healthy' ? 'READY' : state.Health?.Status === 'starting' ? 'STARTING' : state.Health?.Status === 'unhealthy' ? 'UNHEALTHY' : 'UNKNOWN';
    sample.state = native; refuseLate(sample);
    if (native === 'READY') {
      let result: ProviderStatusResult;
      try { result = await ports.readStatus(remaining()); } catch { sample.cli = 'FAILED'; sample.reason = 'CLI_FAILED'; emit(sample); throw Error('Verified local provider status failed; details withheld.'); }
      sample.cli = result.exitCode === 0 ? 'READY' : 'FAILED'; sample.cliExitCode = result.exitCode; refuseLate(sample);
      if (result.exitCode !== 0) { sample.reason = 'CLI_FAILED'; emit(sample); throw Error('Verified local provider status failed; inspect sanitized readiness evidence.'); }
      let status: LocalStatus;
      try { status = JSON.parse(result.stdout) as LocalStatus; } catch { sample.cli = 'FAILED'; sample.reason = 'CLI_MALFORMED'; emit(sample); throw Error('Verified local provider status returned invalid data; contents withheld.'); }
      try { assertCuevoLocalTarget(status); if (typeof status.PUBLISHABLE_KEY !== 'string' || !status.PUBLISHABLE_KEY.startsWith('sb_publishable_') || typeof status.SERVICE_ROLE_KEY !== 'string' || !status.SERVICE_ROLE_KEY.trim()) throw Error('Missing configured provider keys.'); } catch { sample.cli = 'FAILED'; sample.reason = 'TARGET_INVALID'; emit(sample); throw Error('Provider readiness refuses an invalid Cuevo target or configuration; contents withheld.'); }
      refuseLate(sample); emit(sample); return status;
    }
    emit(sample);
    await wait(Math.min(200, remaining()));
  }
  throw Error('Native Cuevo provider readiness deadline exceeded.');
}
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
