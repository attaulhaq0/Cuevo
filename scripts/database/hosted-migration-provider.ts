import { types } from 'node:util';
import { z } from 'zod';

const failure = () => new Error('Hosted migration provider identity requires review; contents withheld.');
const ref = z.string().regex(/^[a-z]{20}$/);
const inputSchema = z.object({ projectRef: ref, boundProjectRef: ref, providerToken: z.string().min(1).max(4096).regex(/^[\x21-\x7e]+$/) }).strict();
const projectSchema = z.object({ id: ref, name: z.string().min(1).max(200), status: z.literal('ACTIVE_HEALTHY'), database: z.object({ host: z.string().max(253), version: z.string().regex(/^17\.\d+(?:\.\d+){0,2}$/), postgres_engine: z.literal('17') }) });
export type HostedMigrationProvider = {
  evidence: 'OFFICIAL_SUPABASE_PROJECT_METADATA'; observedAtMs: number; projectRef: string; projectName: string; projectStatus: 'ACTIVE_HEALTHY';
  directEndpoint: { projectRef: string; kind: 'direct'; host: string; port: 5432; database: 'postgres' };
};
function input(value: unknown) {
  if (!value || typeof value !== 'object' || types.isProxy(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw failure();
  const plain: Record<string, unknown> = Object.create(null);
  for (const key of Reflect.ownKeys(value)) {
    const field = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== 'string' || !field || !('value' in field) || !field.enumerable || typeof field.value !== 'string') throw failure();
    plain[key] = field.value;
  }
  return inputSchema.parse(plain);
}
async function body(response: Response, signal: AbortSignal) {
  if (!response.ok || response.redirected || !response.body) throw failure();
  const size = response.headers.get('content-length');
  if (size !== null && (!/^\d+$/.test(size) || Number(size) > 65536)) { void response.body.cancel().catch(() => undefined); throw failure(); }
  const reader = response.body.getReader(); let bytes = 0, settled = false;
  const pieces: Uint8Array[] = [];
  try {
    while (true) {
      const chunk = await new Promise<ReadableStreamReadResult<Uint8Array>>((done, reject) => {
        const abort = () => { signal.removeEventListener('abort', abort); reject(failure()); };
        if (signal.aborted) return abort();
        signal.addEventListener('abort', abort, { once: true });
        void reader.read().then(value => { signal.removeEventListener('abort', abort); done(value); }, () => { signal.removeEventListener('abort', abort); reject(failure()); });
      });
      if (signal.aborted) throw failure();
      if (chunk.done) { settled = true; break; }
      bytes += chunk.value.byteLength; if (bytes > 65536) throw failure(); pieces.push(chunk.value);
    }
    const joined = new Uint8Array(bytes); let offset = 0;
    for (const piece of pieces) { joined.set(piece, offset); offset += piece.byteLength; }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(joined)) as unknown;
  } finally {
    if (!settled) void reader.cancel().catch(() => undefined);
    try { reader.releaseLock(); } catch { /* A cancelled pending read retains stream cleanup until it settles. */ }
  }
}
/** Fixed official project metadata read only. It does not attest Data API settings, TLS, population, grants or runtime readiness. */
export async function readHostedMigrationProvider(value: unknown): Promise<HostedMigrationProvider> {
  let controller: AbortController | undefined, timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const parsed = input(value); if (parsed.projectRef !== parsed.boundProjectRef) throw failure();
    controller = new AbortController(); timer = setTimeout(() => controller!.abort(), 15000);
    const url = `https://api.supabase.com/v1/projects/${parsed.projectRef}`;
    const response = await fetch(url, { method: 'GET', headers: { Authorization: 'Bearer ' + parsed.providerToken, Accept: 'application/json' }, redirect: 'error', signal: controller.signal });
    if (response.url && response.url !== url) throw failure();
    const project = projectSchema.parse(await body(response, controller.signal));
    if (controller.signal.aborted || project.id !== parsed.projectRef || project.name.toLowerCase() !== 'cuevo' || project.database.host !== `db.${parsed.projectRef}.supabase.co`) throw failure();
    return { evidence: 'OFFICIAL_SUPABASE_PROJECT_METADATA', observedAtMs: Date.now(), projectRef: project.id, projectName: project.name, projectStatus: project.status,
      directEndpoint: { projectRef: project.id, kind: 'direct', host: project.database.host, port: 5432, database: 'postgres' } };
  } catch { throw failure(); }
  finally { if (timer) clearTimeout(timer); controller?.abort(); }
}
