import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const input = { sourceSha: 'a'.repeat(40), treeSha: 'b'.repeat(40), projectRef: 'mqxdjvsyckzocokuikmx' };
async function api() {
  let value: Record<string, unknown> = {};
  try { value = await import(pathToFileURL(resolve(import.meta.dirname, 'hosted-operator-storage-policy.ts')).href); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ERR_MODULE_NOT_FOUND') throw error; }
  assert.equal(typeof value.prepareHostedOperatorStoragePolicy, 'function');
  assert.equal(typeof value.validateHostedOperatorStoragePolicy, 'function');
  return value as typeof import('./hosted-operator-storage-policy');
}
test('operator policy binds fixed original journal retention rules without claiming provider state', async () => {
  const { prepareHostedOperatorStoragePolicy, validateHostedOperatorStoragePolicy } = await api();
  const prepared = prepareHostedOperatorStoragePolicy(input);
  assert.equal(prepared.sha256, createHash('sha256').update(prepared.canonicalJson).digest('hex'));
  const policy = JSON.parse(prepared.canonicalJson);
  assert.equal(policy.bucket, 'cuevo-release-operator'); assert.equal(policy.bucketType, 'STANDARD'); assert.equal(policy.public, false);
  assert.equal(policy.origin, `https://${input.projectRef}.supabase.co`); assert.equal(policy.keyPrefix, `migration/v1/${input.projectRef}`);
  assert.equal(policy.immutableWrites, 'ONLY_UPSERT_FALSE'); assert.equal(policy.scope, 'OPERATOR_METADATA_ONLY');
  assert.equal(policy.fileSizeLimit, 49152); assert.deepEqual(policy.allowedMimeTypes, ['application/json']);
  assert.deepEqual(validateHostedOperatorStoragePolicy(prepared.canonicalJson, input), prepared);
  assert.doesNotMatch(prepared.canonicalJson, /credential|verifiedAt|approvedAt|grantsVerified|readiness|secret/);
});
test('wrong identity omitted fields altered rules and extra proof cannot authorize operator Storage policy', async () => {
  const { prepareHostedOperatorStoragePolicy, validateHostedOperatorStoragePolicy } = await api(); const prepared = prepareHostedOperatorStoragePolicy(input), policy = JSON.parse(prepared.canonicalJson);
  for (const delta of [{ bucket: 'learner-private' }, { public: true }, { fileSizeLimit: 65536 }, { immutableWrites: 'UPSERT_ALLOWED' }, { sourceSha: 'c'.repeat(40) }, { origin: 'https://other.invalid' }, { grantsVerified: true }, { objectSchemaVersion: undefined }]) assert.throws(() => validateHostedOperatorStoragePolicy(JSON.stringify({ ...policy, ...delta }), input));
  assert.throws(() => validateHostedOperatorStoragePolicy(prepared.canonicalJson, { ...input, projectRef: 'a'.repeat(20) }));
  assert.throws(() => validateHostedOperatorStoragePolicy(prepared.canonicalJson + ' ', input));
  assert.throws(() => validateHostedOperatorStoragePolicy('{}', input));
});
test('policy inputs cannot invoke getters or inject a bucket callback or secret', async () => {
  const { prepareHostedOperatorStoragePolicy } = await api(); let calls = 0;
  const getter = { ...input }; Object.defineProperty(getter, 'projectRef', { enumerable: true, get() { calls++; return input.projectRef; } });
  const proxy = new Proxy(input, { ownKeys() { calls++; return Object.keys(input); } });
  for (const value of [getter, proxy, { ...input, storageKey: 'private-canary' }, { ...input, bucket: 'other' }, { ...input, sourceSha: 'unknown' }]) assert.throws(() => prepareHostedOperatorStoragePolicy(value));
  assert.equal(calls, 0);
});

test('modern secret keys use only apikey while legacy operator credentials retain Bearer authentication', async () => {
  const module = await api(); assert.equal(typeof module.hostedOperatorStorageHeaders, 'function');
  const modern = 'sb_secret_private-operator-key-canary';
  assert.deepEqual(module.hostedOperatorStorageHeaders(modern), { apikey: modern });
  const legacy = 'legacy-operator-jwt-key-canary';
  assert.deepEqual(module.hostedOperatorStorageHeaders(legacy), { apikey: legacy, Authorization: 'Bearer ' + legacy });
  for (const value of ['sb_publishable_public-key-canary', modern + '\n', '', 12]) assert.throws(() => module.hostedOperatorStorageHeaders(value));
});
