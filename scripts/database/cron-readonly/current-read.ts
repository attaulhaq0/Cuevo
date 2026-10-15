import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { currentFactsEndpoint, currentFactsQuerySha256, inspectCurrentCronRecovery, isBoundedCurrentData, type CurrentCronRecovery } from './current-facts';

export type AuthenticatedCurrentCronRecovery = Omit<CurrentCronRecovery, 'currentReadAuthentication'> & {
  currentReadAuthentication: 'AUTHENTICATED_FIXED_READER' | 'UNKNOWN';
};
const failed = (): AuthenticatedCurrentCronRecovery => ({ ...inspectCurrentCronRecovery('observe', '', null), reasons: ['CURRENT_READ_FAILED_OR_UNPROVED'], currentReadAuthentication: 'UNKNOWN' });
const originalKeys = ['intent', 'custody', 'acknowledgement', 'originalRunBinding', 'originalArmBinding', 'armIntent', 'unrelatedApplicationDrift', 'unrelatedSourceDrift'];

// Called synchronously only after bounded own-data validation. Read descriptor
// values directly; do not invoke JSON hooks or retain caller object references.
function privateDataSnapshot(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Array.isArray(value)) {
    const result: unknown[] = [];
    for (let index = 0; index < descriptors.length!.value; index++) result.push(privateDataSnapshot(descriptors[String(index)]!.value));
    return result;
  }
  const result: Record<string, unknown> = Object.create(null);
  for (const [key, descriptor] of Object.entries(descriptors)) result[key] = privateDataSnapshot(descriptor.value);
  return result;
}

async function fixedSource() {
  const bytes = await readFile(new URL('./collect-current-facts.sql', import.meta.url));
  if (createHash('sha256').update(bytes).digest('hex') !== currentFactsQuerySha256) throw Error('Current read source changed.');
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}
async function boundedBody(response: Response, signal: AbortSignal): Promise<string> {
  if ((response.status !== 200 && response.status !== 201) || response.redirected || response.url !== currentFactsEndpoint || !response.body) throw Error('Current read transport unproved.');
  const size = response.headers.get('content-length');
  if (size !== null && (!/^\d+$/.test(size) || Number(size) > 2097152)) { await response.body.cancel(); throw Error('Current read body exceeds bound.'); }
  const reader = response.body.getReader(), pieces: Uint8Array[] = []; let bytes = 0, settled = false;
  try {
    while (true) {
      if (signal.aborted) throw Error('Current read expired.');
      const chunk = await reader.read();
      if (signal.aborted) throw Error('Current read expired.');
      if (chunk.done) { settled = true; break; }
      bytes += chunk.value.byteLength; if (bytes > 2097152) throw Error('Current read body exceeds bound.'); pieces.push(chunk.value);
    }
    const joined = new Uint8Array(bytes); let offset = 0;
    for (const piece of pieces) { joined.set(piece, offset); offset += piece.byteLength; }
    // TextDecoder would strip a BOM. Refuse it so the retained response digest
    // always identifies the actual received bytes rather than a normalized body.
    if (joined[0] === 0xef && joined[1] === 0xbb && joined[2] === 0xbf) throw Error('Current read encoding unproved.');
    return new TextDecoder('utf-8', { fatal: true }).decode(joined);
  } finally {
    if (!settled) { try { await reader.cancel(); } catch { /* The failed read remains unknown. */ } }
    reader.releaseLock();
  }
}

/** Call only under separate operator authorization for a current read. There is
 * no CLI, automatic invocation, configurable endpoint, arbitrary SQL, effect
 * selector, retry, custody writer or import of the held native executor.
 * Authentication means this one fixed HTTPS response, never original custody. */
export async function readCurrentCronRecovery(action: string, value: unknown): Promise<AuthenticatedCurrentCronRecovery> {
  let controller: AbortController | undefined, timer: ReturnType<typeof setTimeout> | undefined;
  try {
    if (!['prepare', 'observe', 'restore'].includes(action) || !isBoundedCurrentData(value) || !value || typeof value !== 'object'
      || Object.keys(value).length !== 2 || !Object.hasOwn(value, 'providerToken') || !Object.hasOwn(value, 'originalEvidence')) return failed();
    const input = value as { providerToken: unknown; originalEvidence: unknown };
    if (typeof input.providerToken !== 'string' || !/^[\x21-\x7e]{1,4096}$/.test(input.providerToken) || !input.originalEvidence
      || typeof input.originalEvidence !== 'object' || Array.isArray(input.originalEvidence)
      || Object.keys(input.originalEvidence).some(key => !originalKeys.includes(key)) || process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') return failed();
    const providerToken = input.providerToken;
    const originalEvidence = privateDataSnapshot(input.originalEvidence) as Record<string, unknown>;
    const query = await fixedSource();
    controller = new AbortController(); timer = setTimeout(() => controller!.abort(), 30000);
    // Capture the actual earliest request issue once. No late read or decision renews it.
    const issuedAt = new Date().toISOString();
    const response = await fetch(currentFactsEndpoint, { method: 'POST', redirect: 'error', signal: controller.signal,
      headers: { Authorization: 'Bearer ' + providerToken, Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) });
    const responseText = await boundedBody(response, controller.signal), observedAt = new Date().toISOString();
    if (controller.signal.aborted) return failed();
    await fixedSource();
    if (controller.signal.aborted) return failed();
    const decisionAt = new Date().toISOString();
    const decision = inspectCurrentCronRecovery(action, responseText, { ...originalEvidence, decisionAt,
      currentRead: { endpoint: currentFactsEndpoint, querySha256: currentFactsQuerySha256, issuedAt, observedAt, responseSha256: createHash('sha256').update(responseText).digest('hex') } });
    return { ...decision, currentReadAuthentication: 'AUTHENTICATED_FIXED_READER' };
  } catch { return failed(); }
  finally { if (timer) clearTimeout(timer); controller?.abort(); }
}
