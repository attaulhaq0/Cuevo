import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { z } from 'zod';
import type { HostedExecutionJournal, HostedExecutionPorts } from './hosted-migration-execution';
import { hostedOperatorStorageHeaders } from './hosted-operator-storage-policy';

const purpose = 'CUEVO_HOSTED_SCHEMA_MIGRATION_JOURNAL', bucket = 'cuevo-release-operator';
const failure = () => Error('Remote migration journal identity, private storage or original intent requires review; contents withheld.');
const hash = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
const digest = z.string().regex(/^[a-f0-9]{64}$/), sha = z.string().regex(/^[a-f0-9]{40}$/), ref = z.string().regex(/^[a-z]{20}$/);
const identitySchema = z.object({ projectRef: ref, sourceSha: sha, treeSha: sha, planSha256: digest, stageId: z.enum(['prefix', 'native', 'pre-observability', 'remaining']), stageSha256: digest, databaseUrl: z.string().max(400), approvalDigest: digest, ciRunId: z.string().regex(/^[1-9][0-9]*$/).max(30), certificateSha256: digest }).strict();
const payloadSchema = z.object({ version: z.literal(1), identity: identitySchema, state: z.enum(['INTENT', 'COMMITTED', 'REQUIRES_REVIEW']), schemaHistoryAtomic: z.literal(false), evidence: z.literal('SUPPLIED_PORT_EXECUTION_ONLY') }).strict();
const ownerSchema = z.object({ version: z.literal(1), purpose: z.literal(purpose), identity: identitySchema }).strict();
const recordSchema = z.object({ version: z.literal(1), purpose: z.literal(purpose), sequence: z.number().int().min(1).max(3), previousSha256: digest.nullable(), payload: payloadSchema, payloadSha256: digest }).strict();
const privateToken = z.string().min(20).max(4096).refine(value => [...value].every(character => character.charCodeAt(0) > 32 && character.charCodeAt(0) < 127) && !value.startsWith('sb_publishable_'));
const inputSchema = z.object({ projectRef: ref, boundProjectRef: ref, storageKey: privateToken, providerToken: privateToken, identity: identitySchema }).strict();
const bucketSchema = z.object({ id: z.literal(bucket), name: z.literal(bucket), public: z.literal(false), type: z.literal('STANDARD'), file_size_limit: z.literal(49152), allowed_mime_types: z.array(z.literal('application/json')).length(1) });
const storageBucketSchema = bucketSchema.extend({ type: z.literal('STANDARD').optional() });
const bucketMetadataQuery = "select id,name,public,type::text as type,file_size_limit,allowed_mime_types from storage.buckets where id='cuevo-release-operator'";
const entrySchema = z.object({ name: z.string().min(1).max(100), id: z.string().min(1).nullable(), metadata: z.object({ size: z.number().int().min(1).max(49152), mimetype: z.literal('application/json') }).passthrough().nullable() }).passthrough();
const infoSchema = z.object({ id: z.string().min(1), name: z.string(), bucket_id: z.literal(bucket), size: z.number().int().min(1).max(49152), content_type: z.literal('application/json') });
type Chain = { operation: string; identity: HostedExecutionJournal['identity']; ownerBytes: string; records: { bytes: string; payload: HostedExecutionJournal }[] };
export type RemoteMigrationProjectReceipt = { evidence: 'VERIFIED_OPERATOR_STORAGE_BYTES_AND_METADATA'; projectRef: string; observedAtMs: number; sha256: string; operations: { operation: string; identity: HostedExecutionJournal['identity']; state: HostedExecutionJournal['state'] | 'OWNER_ONLY'; chainSha256: string; objects: { path: string; sha256: string; size: number }[] }[] };
export type HostedMigrationRemoteJournal = Pick<HostedExecutionPorts, 'readJournal' | 'writeJournal'> & { inspectProject(): Promise<RemoteMigrationProjectReceipt> };
function own(value: unknown, depth = 0): unknown {
  if (depth > 8) throw failure(); if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) return value;
  if (!value || typeof value !== 'object' || types.isProxy(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw failure();
  const output: Record<string, unknown> = Object.create(null); for (const key of Reflect.ownKeys(value)) { const field = Object.getOwnPropertyDescriptor(value, key); if (typeof key !== 'string' || !field || !('value' in field) || !field.enumerable) throw failure(); output[key] = own(field.value, depth + 1); } return output;
}
function identity(value: unknown) { const checked = identitySchema.parse(own(value)), url = new URL(checked.databaseUrl); const direct = url.hostname === `db.${checked.projectRef}.supabase.co` && url.username === 'postgres', pooler = /^aws-[0-9]+-[a-z0-9]+(?:-[a-z0-9]+)*\.pooler\.supabase\.com$/.test(url.hostname) && url.username === `postgres.${checked.projectRef}`; if (url.protocol !== 'postgresql:' || url.password || url.port !== '5432' || url.pathname !== '/postgres' || url.search !== '?sslmode=verify-full' || url.hash || url.toString() !== checked.databaseUrl || !(direct || pooler)) throw failure(); return checked; }
const json = (value: unknown) => JSON.stringify(value) + '\n';
function transition(prior: HostedExecutionJournal['state'] | undefined, next: HostedExecutionJournal['state']) { return prior === undefined ? next === 'INTENT' : prior === 'INTENT' ? next === 'COMMITTED' || next === 'REQUIRES_REVIEW' : prior === 'COMMITTED' && next === 'REQUIRES_REVIEW'; }
function decode(bytes: Uint8Array) { return new TextDecoder('utf8', { fatal: true }).decode(bytes); }

/** Fixed private operator Storage consumer only. Bucket creation, current
 * deployment authority, cooperative DB lock and native dual acknowledgement
 * belong to its separately reviewed caller. No generic Storage port is exposed. */
export async function createHostedMigrationRemoteJournal(value: unknown): Promise<HostedMigrationRemoteJournal> {
  let input: z.infer<typeof inputSchema>; try { input = inputSchema.parse(own(value)); input.identity = identity(input.identity); if (input.projectRef !== input.boundProjectRef || input.projectRef !== input.identity.projectRef) throw failure(); } catch { throw failure(); }
  const origin = `https://${input.projectRef}.supabase.co/storage/v1`, projectPrefix = `migration/v1/${input.projectRef}`, operation = hash(JSON.stringify(input.identity)), ownPrefix = `${projectPrefix}/${operation}`;
  let uncertain = false, writing = false, publishedIntentSha256: string | null = null;
  const request = async (path: string, method: 'GET' | 'POST', body?: string, upload = false, missing = false, management = false): Promise<{ status: number; bytes: Uint8Array }> => {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000); let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      const url = management ? `https://api.supabase.com/v1/projects/${input.projectRef}/database/query` : `${origin}/${path}`, response = await fetch(url, { method, headers: { ...(management ? { Authorization: 'Bearer ' + input.providerToken } : hostedOperatorStorageHeaders(input.storageKey)), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(upload ? { 'x-upsert': 'false', 'Cache-Control': 'no-store' } : {}) }, ...(body === undefined ? {} : { body }), cache: 'no-store', redirect: 'error', signal: controller.signal });
      if (response.redirected || response.url && response.url !== url || response.status === 404 && !missing || !response.ok && !(upload && response.status === 409) && !(missing && response.status === 404)) throw failure();
      if (response.status === 404 || response.status === 409) { void response.body?.cancel().catch(() => undefined); return { status: response.status, bytes: new Uint8Array() }; }
      const declared = response.headers.get('content-length'); if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > 65536) || !response.body) throw failure();
      reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
      while (true) { const part = await new Promise<ReadableStreamReadResult<Uint8Array>>((done, reject) => { const abort = () => { controller.signal.removeEventListener('abort', abort); reject(failure()); }; if (controller.signal.aborted) return abort(); controller.signal.addEventListener('abort', abort, { once: true }); void reader!.read().then(part => { controller.signal.removeEventListener('abort', abort); done(part); }, () => { controller.signal.removeEventListener('abort', abort); reject(failure()); }); }); if (controller.signal.aborted) throw failure(); if (part.done) break; size += part.value.byteLength; if (size > 65536) throw failure(); chunks.push(part.value); }
      return { status: response.status, bytes: Buffer.concat(chunks) };
    } catch { throw failure(); } finally { clearTimeout(timer); controller.abort(); if (reader) { void reader.cancel().catch(() => undefined); try { reader.releaseLock(); } catch { /* Cancelled transport retains its pending read cleanup. */ } } }
  };
  const bucketRead = async () => { const rows = z.array(bucketSchema).length(1).parse(JSON.parse(decode((await request('', 'POST', JSON.stringify({ query: bucketMetadataQuery }), false, false, true)).bytes))), metadata = rows[0]; const storage = storageBucketSchema.parse(JSON.parse(decode((await request(`bucket/${bucket}`, 'GET')).bytes))); const comparable = (value: typeof storage) => ({ id: value.id, name: value.name, public: value.public, file_size_limit: value.file_size_limit, allowed_mime_types: value.allowed_mime_types }); if (JSON.stringify(comparable(storage)) !== JSON.stringify(comparable(metadata))) throw failure(); };
  const list = async (prefix: string) => {
    const entries: z.infer<typeof entrySchema>[] = []; const seen = new Set<string>(); let prior = '';
    for (let offset = 0; offset <= 1000; offset += 100) {
      const received = z.array(entrySchema).max(100).parse(JSON.parse(decode((await request(`object/list/${bucket}`, 'POST', JSON.stringify({ prefix, offset, limit: 100, sortBy: { column: 'name', order: 'asc' } }))).bytes)));
      for (const row of received) { if (seen.has(row.name) || row.name <= prior || row.name.includes('/') || row.name.includes('\\')) throw failure(); entries.push(row); seen.add(row.name); prior = row.name; }
      if (entries.length > 1000) throw failure(); if (received.length < 100) return entries;
    }
    throw failure();
  };
  const download = async (path: string, listed?: z.infer<typeof entrySchema>): Promise<string | null> => {
    const read = await request(`object/${bucket}/${path}`, 'GET', undefined, false, !listed); if (read.status === 404) return null; if (read.bytes.length > 49152) throw failure();
    const metadata = infoSchema.parse(JSON.parse(decode((await request(`object/info/${bucket}/${path}`, 'GET')).bytes))); if (metadata.name !== path || metadata.size !== read.bytes.length || listed && (listed.id !== metadata.id || listed.metadata?.size !== metadata.size)) throw failure(); return decode(read.bytes);
  };
  const chain = async (name: string): Promise<Chain> => {
    if (!/^[a-f0-9]{64}$/.test(name)) throw failure(); const prefix = `${projectPrefix}/${name}`, entries = await list(prefix), names = entries.map(row => row.name); const expected = ['owner.json', ...names.filter(name => /^00000[1-3]\.record\.json$/.test(name))].sort();
    if (JSON.stringify(names) !== JSON.stringify(expected) || entries.some(row => row.id === null || row.metadata === null) || names.length > 4) throw failure();
    const ownerBytes = await download(`${prefix}/owner.json`, entries.find(row => row.name === 'owner.json')); if (ownerBytes === null) throw failure(); const owner = ownerSchema.parse(own(JSON.parse(ownerBytes))), checked = identity(owner.identity); if (checked.projectRef !== input.projectRef || hash(JSON.stringify(checked)) !== name || ownerBytes !== json({ version: 1, purpose, identity: checked })) throw failure();
    const records: Chain['records'] = []; let previous: string | null = null;
    for (const [index, row] of entries.filter(row => row.name !== 'owner.json').entries()) { if (row.name !== String(index + 1).padStart(6, '0') + '.record.json') throw failure(); const bytes = await download(`${prefix}/${row.name}`, row); if (bytes === null) throw failure(); const raw = JSON.parse(bytes), record = recordSchema.parse(own(raw)), checkedIdentity = identity(record.payload.identity); if (record.sequence !== index + 1 || record.previousSha256 !== previous || JSON.stringify(checkedIdentity) !== JSON.stringify(checked) || record.payloadSha256 !== hash(JSON.stringify(raw.payload)) || !transition(records.at(-1)?.payload.state, record.payload.state) || bytes !== json(raw)) throw failure(); records.push({ bytes, payload: raw.payload as HostedExecutionJournal }); previous = hash(bytes); }
    if (!sameEntries(entries, await list(prefix))) throw failure(); return { operation: name, identity: checked, ownerBytes, records };
  };
  function sameEntries(left: z.infer<typeof entrySchema>[], right: z.infer<typeof entrySchema>[]) { return JSON.stringify(left.map(row => ({ name: row.name, id: row.id, metadata: row.metadata }))) === JSON.stringify(right.map(row => ({ name: row.name, id: row.id, metadata: row.metadata }))); }
  const inspect = async () => { if (uncertain) throw failure(); await bucketRead(); const entries = await list(projectPrefix); if (entries.some(row => row.id !== null || row.metadata !== null || !/^[a-f0-9]{64}$/.test(row.name))) throw failure(); const chains: Chain[] = []; for (const row of entries) chains.push(await chain(row.name)); if (!sameEntries(entries, await list(projectPrefix))) throw failure(); await bucketRead(); return chains; };
  const publish = async (path: string, bytes: string) => { if (Buffer.byteLength(bytes) > 49152 || bytes.includes(input.storageKey) || bytes.includes(input.providerToken)) throw failure(); await request(`object/${bucket}/${path}`, 'POST', bytes, true); if (await download(path) !== bytes) throw failure(); };
  try { await bucketRead(); } catch { throw failure(); }
  return {
    readJournal: async () => { try { const chains = await inspect(); if (chains.some(row => row.operation !== operation && row.records.at(-1)?.payload.state !== 'COMMITTED')) throw failure(); const current = chains.find(row => row.operation === operation); if (current && !current.records.length) throw failure(); return structuredClone(current?.records.at(-1)?.payload ?? null); } catch { uncertain = true; throw failure(); } },
    inspectProject: async () => { try { const chains = await inspect(), operations: RemoteMigrationProjectReceipt['operations'] = chains.map(row => ({ operation: row.operation, identity: structuredClone(row.identity), state: row.records.at(-1)?.payload.state ?? 'OWNER_ONLY', chainSha256: hash(row.ownerBytes + row.records.map(record => record.bytes).join('')), objects: [{ path: `${projectPrefix}/${row.operation}/owner.json`, sha256: hash(row.ownerBytes), size: Buffer.byteLength(row.ownerBytes) }, ...row.records.map((record, index) => ({ path: `${projectPrefix}/${row.operation}/${String(index + 1).padStart(6, '0')}.record.json`, sha256: hash(record.bytes), size: Buffer.byteLength(record.bytes) }))] })); return { evidence: 'VERIFIED_OPERATOR_STORAGE_BYTES_AND_METADATA', projectRef: input.projectRef, observedAtMs: Date.now(), sha256: hash(JSON.stringify(operations)), operations }; } catch { uncertain = true; throw failure(); } },
    writeJournal: async value => {
      if (uncertain || writing) return { kind: 'UNCONFIRMED' }; writing = true;
      try {
        const raw = own(value), checked = payloadSchema.parse(raw); if (JSON.stringify(identity(checked.identity)) !== JSON.stringify(input.identity)) throw failure(); const payload = JSON.parse(JSON.stringify(raw)) as HostedExecutionJournal, payloadSha256 = hash(JSON.stringify(payload)); const chains = await inspect();
        if (chains.some(row => row.operation !== operation && row.records.at(-1)?.payload.state !== 'COMMITTED')) throw failure(); const current = chains.find(row => row.operation === operation), previous = current?.records.at(-1); if (previous?.payload.state === 'INTENT' && hash(JSON.stringify(previous.payload)) !== publishedIntentSha256) throw failure(); if (current && !previous) throw failure(); if (previous && hash(JSON.stringify(previous.payload)) === payloadSha256) return { kind: 'SYNCED', sha256: payloadSha256 }; if (!transition(previous?.payload.state, payload.state)) throw failure();
        const ownerBytes = json({ version: 1, purpose, identity: input.identity }); if (!current) await publish(`${ownPrefix}/owner.json`, ownerBytes);
        const sequence = (current?.records.length ?? 0) + 1, bytes = json({ version: 1, purpose, sequence, previousSha256: previous ? hash(previous.bytes) : null, payload, payloadSha256 }); if (sequence > 3) throw failure(); await publish(`${ownPrefix}/${String(sequence).padStart(6, '0')}.record.json`, bytes);
        const after = await inspect(), retained = after.find(row => row.operation === operation); if (!retained || retained.ownerBytes !== ownerBytes || hash(JSON.stringify(retained.records.at(-1)?.payload)) !== payloadSha256 || after.some(row => row.operation !== operation && row.records.at(-1)?.payload.state !== 'COMMITTED')) throw failure(); if (payload.state === 'INTENT') publishedIntentSha256 = payloadSha256; return { kind: 'SYNCED', sha256: payloadSha256 };
      } catch { uncertain = true; return { kind: 'UNCONFIRMED' }; } finally { writing = false; }
    },
  };
}
