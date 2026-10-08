import { createHash } from 'node:crypto';
import { z } from 'zod';
import { canonicalReleaseExecutionJson } from './release-review';

const sha = z.string().regex(/^[a-f0-9]{40}$/), digest = z.string().regex(/^[a-f0-9]{64}$/), stamp = z.iso.datetime({ offset: true });
const project = z.string().regex(/^[a-z]{20}$/);
const inputSchema = z.object({ projectRef: project, sourceSha: sha, treeSha: sha, token: z.string().min(1).max(24576).regex(/^[\x21-\x7e]+$/) }).strict();
const metadataSchema = z.object({ status: z.literal('CURRENT_METADATA_ONLY'), projectRef: project, sourceSha: sha, treeSha: sha, observedAt: stamp, expiresAt: stamp }).strict();
const expectedSchema = z.object({ projectRef: project, sourceSha: sha, treeSha: sha, now: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER) }).strict();
const evidenceSchema = z.object({
  version: z.literal(1), purpose: z.literal('CUEVO_DATA_API_CONFIGURATION_OBSERVATION'), source: z.literal('SUPABASE_MANAGEMENT_POSTGREST_CONFIG'),
  projectRef: project, sourceSha: sha, treeSha: sha, url: z.string(), configurationState: z.enum(['DISABLED', 'ENABLED', 'UNKNOWN']),
  configurationValueSha256: digest.nullable(), metadataBasis: z.literal('SUPPLIED_CURRENT_METADATA_PORT'), metadataObservedAt: stamp,
  observedAt: stamp, verifiedAt: stamp, expiresAt: stamp, effectAuthority: z.literal(false), hostedAcceptance: z.literal(false),
}).strict();
export type DataApiConfigurationEvidence = z.infer<typeof evidenceSchema>;
export type DataApiConfigurationInput = z.infer<typeof inputSchema>;
export type DataApiConfigurationPorts = { admit(): Promise<unknown>; transport?: typeof fetch; now?: () => number; signal?: AbortSignal };
const fail = () => Error('Data API configuration observation requires review; private contents withheld.');
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const endpoint = (ref: string) => `https://api.supabase.com/v1/projects/${ref}/postgrest`;
const snapshot = (value: unknown) => JSON.parse(canonicalReleaseExecutionJson(value)) as unknown;
function now(port: (() => number) | undefined) { const value = port?.() ?? Date.now(); if (!Number.isSafeInteger(value) || value < 0) throw fail(); return value; }
function metadata(value: unknown, input: DataApiConfigurationInput, at: number) {
  const result = metadataSchema.parse(snapshot(value));
  if (result.projectRef !== input.projectRef || result.sourceSha !== input.sourceSha || result.treeSha !== input.treeSha
    || Date.parse(result.observedAt) > at || at - Date.parse(result.observedAt) > 3600000 || Date.parse(result.expiresAt) <= at
    || Date.parse(result.expiresAt) <= Date.parse(result.observedAt)) throw fail();
  return result;
}
/** Strict receipt validation never treats absent configuration as disabled or
 * a supplied metadata port as native admission, approval or effect authority. */
export function validateDataApiConfigurationEvidence(value: unknown, expectedValue: unknown): DataApiConfigurationEvidence {
  try {
    const expected = expectedSchema.parse(snapshot(expectedValue)), result = evidenceSchema.parse(snapshot(value));
    const first = Date.parse(result.observedAt), second = Date.parse(result.verifiedAt), expires = Date.parse(result.expiresAt), meta = Date.parse(result.metadataObservedAt);
    if (result.projectRef !== expected.projectRef || result.sourceSha !== expected.sourceSha || result.treeSha !== expected.treeSha || result.url !== endpoint(expected.projectRef)
      || first < meta || second < first || second > expected.now || first > expected.now || expected.now - first > 3600000 || expires <= expected.now
      || expires <= first || expires > first + 3600000 || result.configurationValueSha256 === null
      || result.configurationState === 'DISABLED' && result.configurationValueSha256 !== hash(canonicalReleaseExecutionJson(''))
      || result.configurationState === 'ENABLED' && result.configurationValueSha256 === hash(canonicalReleaseExecutionJson(''))) throw fail();
    return result;
  } catch { throw fail(); }
}
function race<T>(task: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener('abort', abort); reject(fail()); };
    if (signal.aborted) { void task.catch(() => undefined); return abort(); }
    signal.addEventListener('abort', abort, { once: true });
    void task.then(value => { signal.removeEventListener('abort', abort); if (signal.aborted) reject(fail()); else resolve(value); }, () => { signal.removeEventListener('abort', abort); reject(fail()); });
  });
}
async function admit(ports: DataApiConfigurationPorts) {
  const signal = ports.signal ? AbortSignal.any([ports.signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000);
  if (signal.aborted) throw fail();
  return race(ports.admit(), signal);
}
async function read(input: DataApiConfigurationInput, ports: DataApiConfigurationPorts) {
  const signal = ports.signal ? AbortSignal.any([ports.signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000), url = endpoint(input.projectRef);
  if (signal.aborted) throw fail();
  const response = await race((ports.transport ?? fetch)(url, { method: 'GET', headers: { Authorization: 'Bearer ' + input.token, Accept: 'application/json' }, redirect: 'error', credentials: 'omit', cache: 'no-store', signal }), signal);
  const declared = response.headers.get('content-length');
  if (response.status !== 200 || response.redirected || response.url !== url || !response.body || response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json'
    || declared !== null && (!/^[0-9]+$/.test(declared) || Number(declared) > 131072)) { void response.body?.cancel().catch(() => undefined); throw fail(); }
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) { const chunk = await race(reader.read(), signal); if (chunk.done) break; size += chunk.value.byteLength; if (size > 131072) throw fail(); chunks.push(chunk.value); }
    const result = JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(Buffer.concat(chunks))) as unknown;
    if (result === null || typeof result !== 'object' || Array.isArray(result)) throw fail();
    // Only the selected configuration value is classified; optional jwt_secret
    // and every other private provider field are discarded inside this owner.
    const value = (result as Record<string, unknown>).db_schema;
    const selected = typeof value === 'string' && value.length <= 4096 ? value : null;
    let state: DataApiConfigurationEvidence['configurationState'] = 'UNKNOWN';
    if (selected === '') state = 'DISABLED';
    else if (selected !== null && selected.trim()) {
      const names = selected.split(',').map(name => name.trim());
      if (names.every(name => /^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(name)) && new Set(names).size === names.length) state = 'ENABLED';
    }
    const selectedIdentity = Object.hasOwn(result, 'db_schema') ? canonicalReleaseExecutionJson(value) : 'MISSING_DB_SCHEMA';
    return { state, valueSha256: hash(selectedIdentity) };
  } finally { void reader.cancel().catch(() => undefined); try { reader.releaseLock(); } catch { /* An aborted read retains cancellation ownership. */ } }
}
/** Fixed official GETs only. Callers must supply their independently verified
 * current metadata port; this standalone reader creates no native permit. */
export async function readDataApiConfiguration(value: unknown, ports: DataApiConfigurationPorts): Promise<{ evidence: DataApiConfigurationEvidence; canonicalJson: string; sha256: string }> {
  try {
    const input = inputSchema.parse(snapshot(value));
    if (ports.signal?.aborted) throw fail();
    const admitted = metadata(await admit(ports), input, now(ports.now));
    const first = await read(input, ports), observedAt = now(ports.now);
    metadata(admitted, input, observedAt);
    const second = await read(input, ports), verifiedAt = now(ports.now);
    if (canonicalReleaseExecutionJson(first) !== canonicalReleaseExecutionJson(second)) throw fail();
    const final = metadata(await admit(ports), input, now(ports.now));
    if (canonicalReleaseExecutionJson(final) !== canonicalReleaseExecutionJson(admitted)) throw fail();
    const evidence = validateDataApiConfigurationEvidence({ version: 1, purpose: 'CUEVO_DATA_API_CONFIGURATION_OBSERVATION', source: 'SUPABASE_MANAGEMENT_POSTGREST_CONFIG',
      projectRef: input.projectRef, sourceSha: input.sourceSha, treeSha: input.treeSha, url: endpoint(input.projectRef), configurationState: first.state, configurationValueSha256: first.valueSha256,
      metadataBasis: 'SUPPLIED_CURRENT_METADATA_PORT', metadataObservedAt: admitted.observedAt, observedAt: new Date(observedAt).toISOString(), verifiedAt: new Date(verifiedAt).toISOString(),
      expiresAt: new Date(Math.min(Date.parse(admitted.expiresAt), observedAt + 3600000)).toISOString(), effectAuthority: false, hostedAcceptance: false,
    }, { projectRef: input.projectRef, sourceSha: input.sourceSha, treeSha: input.treeSha, now: now(ports.now) });
    const canonicalJson = canonicalReleaseExecutionJson(evidence); if (ports.signal?.aborted) throw fail(); return { evidence, canonicalJson, sha256: hash(canonicalJson) };
  } catch { throw fail(); }
}
