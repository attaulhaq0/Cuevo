import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { z } from 'zod';
import { canonicalReleaseReviewJson, parseCanonicalReleaseReviewJson } from '../verification/release-review';

const failure = () => Error('Hosted operator Storage policy requires review; contents withheld.');
const operatorCredential = z.string().min(20).max(4096).refine(value => [...value].every(character => character.charCodeAt(0) > 32 && character.charCodeAt(0) < 127) && !value.startsWith('sb_publishable_'));
const source = z.object({ sourceSha: z.string().regex(/^[a-f0-9]{40}$/), treeSha: z.string().regex(/^[a-f0-9]{40}$/), projectRef: z.string().regex(/^[a-z]{20}$/) }).strict();
function own(value: unknown) {
  if (!value || typeof value !== 'object' || types.isProxy(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw failure();
  const output: Record<string, string> = Object.create(null);
  for (const key of Reflect.ownKeys(value)) { const field = Object.getOwnPropertyDescriptor(value, key); if (typeof key !== 'string' || !field || !('value' in field) || !field.enumerable || typeof field.value !== 'string') throw failure(); output[key] = field.value; }
  return source.parse(output);
}
export type HostedOperatorStoragePolicy = {
  version: 1; purpose: 'CUEVO_HOSTED_MIGRATION_ORIGINAL_INTENT'; sourceSha: string; treeSha: string; projectRef: string; origin: string;
  bucket: 'cuevo-release-operator'; bucketType: 'STANDARD'; public: false; fileSizeLimit: 49152; allowedMimeTypes: ['application/json'];
  keyPrefix: string; originalJournalPurpose: 'CUEVO_HOSTED_SCHEMA_MIGRATION_JOURNAL'; objectSchemaVersion: 1; immutableWrites: 'ONLY_UPSERT_FALSE'; scope: 'OPERATOR_METADATA_ONLY';
};
export type PreparedHostedOperatorStoragePolicy = { policy: HostedOperatorStoragePolicy; canonicalJson: string; sha256: string; evidence: 'POLICY_CONFIGURATION_ONLY' };
/** Modern API keys are not JWTs. Only the legacy operator key is also a Bearer
 * credential; these headers belong solely to the fixed private Storage endpoint. */
export function hostedOperatorStorageHeaders(value: unknown): Record<string, string> {
  const parsed = operatorCredential.safeParse(value); if (!parsed.success) throw failure();
  return parsed.data.startsWith('sb_secret_') ? { apikey: parsed.data } : { apikey: parsed.data, Authorization: 'Bearer ' + parsed.data };
}
/** Reproducible policy configuration only. It does not read provider state or approve a bucket, credential, migration or private data path. */
export function prepareHostedOperatorStoragePolicy(value: unknown): PreparedHostedOperatorStoragePolicy {
  try {
    const input = own(value);
    const policy: HostedOperatorStoragePolicy = { version: 1, purpose: 'CUEVO_HOSTED_MIGRATION_ORIGINAL_INTENT', ...input, origin: `https://${input.projectRef}.supabase.co`, bucket: 'cuevo-release-operator', bucketType: 'STANDARD', public: false, fileSizeLimit: 49152, allowedMimeTypes: ['application/json'], keyPrefix: `migration/v1/${input.projectRef}`, originalJournalPurpose: 'CUEVO_HOSTED_SCHEMA_MIGRATION_JOURNAL', objectSchemaVersion: 1, immutableWrites: 'ONLY_UPSERT_FALSE', scope: 'OPERATOR_METADATA_ONLY' };
    const canonicalJson = canonicalReleaseReviewJson(policy), sha256 = createHash('sha256').update(canonicalJson).digest('hex');
    return { policy, canonicalJson, sha256, evidence: 'POLICY_CONFIGURATION_ONLY' };
  } catch { throw failure(); }
}
export function validateHostedOperatorStoragePolicy(text: unknown, expected: unknown): PreparedHostedOperatorStoragePolicy {
  try {
    if (typeof text !== 'string' || Buffer.byteLength(text) > 8192) throw failure();
    const parsed = parseCanonicalReleaseReviewJson(text), prepared = prepareHostedOperatorStoragePolicy(expected);
    if (canonicalReleaseReviewJson(parsed) !== prepared.canonicalJson || text !== prepared.canonicalJson) throw failure();
    return prepared;
  } catch { throw failure(); }
}
