import { types } from 'node:util';
import { z } from 'zod';
import { canonicalReleaseExecutionJson } from '../verification/release-review';
import { createHash } from 'node:crypto';

const failure = () => new Error('Hosted migration provider identity requires review; contents withheld.');
const ref = z.string().regex(/^[a-z]{20}$/);
const inputSchema = z.object({ projectRef: ref, boundProjectRef: ref, providerToken: z.string().min(1).max(4096).regex(/^[\x21-\x7e]+$/) }).strict();
const projectSchema = z.object({ id: ref, name: z.string().min(1).max(200), status: z.literal('ACTIVE_HEALTHY'), database: z.object({ host: z.string().max(253), version: z.string().regex(/^17\.\d+(?:\.\d+){0,2}$/), postgres_engine: z.literal('17') }) });
const poolerSchema=z.object({identifier:ref,database_type:z.enum(['PRIMARY','READ_REPLICA']),db_user:z.string(),db_host:z.string().regex(/^aws-[0-9]+-[a-z0-9]+(?:-[a-z0-9]+)*\.pooler\.supabase\.com$/),db_port:z.number().int(),db_name:z.string(),pool_mode:z.enum(['transaction','session'])});
export const hostedMigrationEndpointSchema=z.object({projectRef:ref,kind:z.enum(['direct','session-pooler']),host:z.string(),port:z.literal(5432),database:z.literal('postgres')}).strict();
export type HostedMigrationEndpoint=z.infer<typeof hostedMigrationEndpointSchema>;
export type HostedMigrationProvider = {
  evidence: 'OFFICIAL_SUPABASE_PROJECT_METADATA'; observedAtMs: number; projectRef: string; projectName: string; projectStatus: 'ACTIVE_HEALTHY';
  directEndpoint: { projectRef: string; kind: 'direct'; host: string; port: 5432; database: 'postgres' };
  sessionEndpoint: { projectRef: string; kind: 'session-pooler'; host: string; port: 5432; database: 'postgres' };
};
/** Readmission selects only the endpoint already bound by the release package;
 * it never changes transport after an operation becomes uncertain. */
export function requireCurrentHostedMigrationEndpoint(value:unknown,provider:HostedMigrationProvider,fingerprint:string):HostedMigrationEndpoint{const selected=hostedMigrationEndpointSchema.parse(value),current=selected.kind==='direct'?provider.directEndpoint:provider.sessionEndpoint;if(!current||selected.projectRef!==provider.projectRef||canonicalReleaseExecutionJson(selected)!==canonicalReleaseExecutionJson(current))throw failure();if(createHash('sha256').update(canonicalReleaseExecutionJson(selected)).digest('hex')!==fingerprint)throw failure();return selected;}
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
    const poolerUrl=url+'/config/database/pooler',poolerResponse=await fetch(poolerUrl,{method:'GET',headers:{Authorization:'Bearer '+parsed.providerToken,Accept:'application/json'},redirect:'error',signal:controller.signal});if(poolerResponse.url&&poolerResponse.url!==poolerUrl)throw failure();const configurations=z.array(poolerSchema).max(20).parse(await body(poolerResponse,controller.signal)),primary=configurations.filter(row=>row.database_type==='PRIMARY'&&row.identifier===project.id);if(primary.length!==1)throw failure();const pooler=primary[0];if(pooler.db_user!=='postgres.'+project.id||pooler.db_name!=='postgres'||pooler.pool_mode==='session'&&pooler.db_port!==5432||pooler.pool_mode==='transaction'&&pooler.db_port!==6543||controller.signal.aborted)throw failure();
    // The official shared-pooler host also exposes documented session mode on5432.
    return { evidence: 'OFFICIAL_SUPABASE_PROJECT_METADATA', observedAtMs: Date.now(), projectRef: project.id, projectName: project.name, projectStatus: project.status,
      directEndpoint: { projectRef: project.id, kind: 'direct', host: project.database.host, port: 5432, database: 'postgres' },sessionEndpoint:{projectRef:project.id,kind:'session-pooler',host:pooler.db_host,port:5432,database:'postgres'} };
  } catch { throw failure(); }
  finally { if (timer) clearTimeout(timer); controller?.abort(); }
}
