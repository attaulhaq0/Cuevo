import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { registerHooks } from 'node:module';
import { transformSync } from 'esbuild';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { canonicalReleaseReviewJson } from './release-review';

const secret = 'private-backend-phase-canary';
const state = { events: [] as string[], failApproval: false, status: 'COMMITTED', bundle: {} as Record<string, unknown> };
const replacements: Record<string, string> = {
  'backend-release-prepare.ts': 'export const prepareNativeBackendRelease=globalThis.backendPhaseFixture.prepare;',
  'backend-release-admission.ts': 'export const readBackendReleaseAdmission=globalThis.backendPhaseFixture.admission;',
  'backend-release-contracts.ts': 'export const validatePreparedBackendReleaseIntent=globalThis.backendPhaseFixture.validate;',
  'hosted-operator-storage-bootstrap.ts': 'export const createHostedOperatorStorageBootstrap=globalThis.backendPhaseFixture.bootstrap;',
  'hosted-migration-executor.ts': 'export const executeNativeHostedMigrations=globalThis.backendPhaseFixture.schema;',
};
registerHooks({ resolve(specifier, context, next) {
  const name = specifier.split('/').at(-1)!;
  if (replacements[name + '.ts']) return { shortCircuit: true, url: new URL(specifier + '.ts', context.parentURL).href };
  return next(specifier, context);
}, load(url, context, next) {
  const name = url.split('/').at(-1)!;
  if (replacements[name]) return { format: 'module', shortCircuit: true, source: replacements[name] };
  if (name === 'backend-release.ts') return { format: 'module', shortCircuit: true, source: transformSync(readFileSync(new URL(url), 'utf8'), { loader: 'ts', format: 'esm' }).code };
  return next(url, context);
} });
(globalThis as unknown as { backendPhaseFixture: object }).backendPhaseFixture = {
  prepare: async (input: Record<string, unknown>) => { state.events.push('prepare'); assert.equal(input.providerToken, secret); return { ...state.bundle, preparedApproval: { canonicalJson: '{}', comment: 'Source-bound package comment' }, bundlePath: join(input.repoRoot as string, '.local/hosted-release/backend-bundle.json'), bundleSha256: digest(JSON.stringify(state.bundle)) }; },
  validate: (prepared: unknown) => prepared,
  admission: async () => { state.events.push('approval'); if (state.failApproval) throw Error(secret); return { provenance: 'OFFICIAL_GITHUB_AND_VERIFIED_GIT_SOURCE', approval: { state: 'approved' } }; },
  bootstrap: async (input: Record<string, unknown>) => { state.events.push('bucket'); assert.equal(input.journalStorageKey, secret); assert.equal(Object.hasOwn(input, 'migrationPassword'), false); return { bootstrap: async () => ({ status: 'CREATED_CONFIRMED', mutation: 'CONFIRMED' }) }; },
  schema: async (input: Record<string, unknown>) => { state.events.push('schema'); assert.equal(input.migrationPassword, secret); assert.equal(input.journalStorageKey, secret); assert.equal(Object.hasOwn(input.toolchain as object, 'SUPABASE_ACCESS_TOKEN'), false); return { status: state.status, schemaHistoryAtomic: false, hostedAcceptance: false }; },
};
const digest = (text: string) => createHash('sha256').update(text).digest('hex');
async function subject() {
  let api: Record<string, unknown> = {};
  try { api = await import(pathToFileURL(resolve(import.meta.dirname, 'backend-release.ts')).href); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ERR_MODULE_NOT_FOUND') throw error; }
  assert.equal(typeof api.runBackendReleasePhase, 'function', 'backend workflow has an executable owner');
  return api as typeof import('./backend-release');
}
async function fixture(run: (root: string, env: Record<string, string>) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'cuevo-backend-phase-'));
  try {
    await mkdir(join(root, '.local/hosted-release'), { recursive: true });
    state.events = []; state.failApproval = false; state.status = 'COMMITTED';
    const sha = 'a'.repeat(40);
    state.bundle = { version: 1, purpose: 'CUEVO_BACKEND_RELEASE_EXECUTION', repoRoot: root, expected: { repository: 'attaulhaq0/Cuevo', releaseSha: sha, releaseRunId: '51', runAttempt: 1, ciRunId: '31', environmentName: 'staging', deploymentEnvironment: 'synthetic-staging' }, preparedApproval: {}, plan: {}, stages: [], toolchainManifestPath: join(root, '.local/hosted-release/toolchain.json'), operatorStoragePolicyPath: join(root, '.local/hosted-release/operator-policy.json'), artifacts: { apiRoot: join(root, '.local/runtime-artifacts/api-vercel'), edgeRoot: join(root, '.local/edge-artifacts/cuevo-worker') } };
    const path = join(root, '.local/hosted-release/backend-bundle.json'); await writeFile(path, canonicalReleaseReviewJson(state.bundle));
    const env = { GITHUB_REPOSITORY: 'attaulhaq0/Cuevo', GITHUB_SHA: sha, GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_RUN_ID: '51', GITHUB_RUN_ATTEMPT: '1', GITHUB_EVENT_PATH: join(root, 'event.json'), GH_TOKEN: secret, SUPABASE_ACCESS_TOKEN: secret, CUEVO_BACKEND_BUNDLE_PATH: path, CUEVO_BACKEND_BUNDLE_SHA256: digest(canonicalReleaseReviewJson(state.bundle)), CUEVO_BACKEND_RELEASE_INPUT_JSON: '{}', GITHUB_OUTPUT: join(root, 'output.txt'), GITHUB_STEP_SUMMARY: join(root, 'summary.md'), CUEVO_MIGRATION_DATABASE_PASSWORD: secret, CUEVO_RELEASE_JOURNAL_STORAGE_KEY: secret, CUEVO_DATABASE_TLS_CA: '-----BEGIN CERTIFICATE-----\nFixture certificate\n-----END CERTIFICATE-----', PATH: process.env.PATH ?? '' };
    await run(root, env);
  } finally { assert.equal(resolve(root, '..'), resolve(tmpdir())); await rm(root, { recursive: true, force: true }); }
}
test('failed official approval cannot reach bucket or schema even with configured private credentials', async () => {
  const api = await subject(); await fixture(async (repoRoot, env) => { state.failApproval = true; await assert.rejects(api.runBackendReleasePhase({ mode: 'bootstrap-schema', repoRoot, env }), error => error instanceof Error && !error.message.includes(secret)); assert.deepEqual(state.events, ['approval']); });
});
test('schema workflow consumes complete configuration only after admission and retains native uncertainty', async () => {
  const api = await subject(); await fixture(async (repoRoot, env) => { state.status = 'REQUIRES_REVIEW'; await assert.rejects(api.runBackendReleasePhase({ mode: 'bootstrap-schema', repoRoot, env })); assert.deepEqual(state.events, ['approval', 'bucket', 'schema']); const receipt = JSON.parse(await readFile(join(repoRoot, '.local/hosted-release/schema-result.json'), 'utf8')); assert.equal(receipt.status, 'REQUIRES_REVIEW'); assert.equal(receipt.hostedAcceptance, false); assert.equal(JSON.stringify(receipt).includes(secret), false); });
});
test('missing database credential refuses before any provider mutation; changed package and foreign run refuse before admission', async () => {
  const api = await subject(); await fixture(async (repoRoot, env) => { delete env.CUEVO_MIGRATION_DATABASE_PASSWORD; await assert.rejects(api.runBackendReleasePhase({ mode: 'bootstrap-schema', repoRoot, env })); assert.deepEqual(state.events, ['approval']); });
  for (const patch of [{ CUEVO_BACKEND_BUNDLE_SHA256: '0'.repeat(64) }, { GITHUB_RUN_ATTEMPT: '2' }, { GITHUB_REF: 'refs/heads/other' }, { GITHUB_REPOSITORY: 'fork/Cuevo' }]) await fixture(async (repoRoot, env) => { await assert.rejects(api.runBackendReleasePhase({ mode: 'approval', repoRoot, env: { ...env, ...patch } })); assert.deepEqual(state.events, []); });
});
test('preparation refuses database storage or Vercel deployment credentials and accepts metadata token only', async () => {
  const api = await subject(); await fixture(async (repoRoot, env) => { await assert.rejects(api.runBackendReleasePhase({ mode: 'prepare', repoRoot, env })); assert.deepEqual(state.events, []); delete env.CUEVO_MIGRATION_DATABASE_PASSWORD; delete env.CUEVO_RELEASE_JOURNAL_STORAGE_KEY; delete env.CUEVO_DATABASE_TLS_CA; await api.runBackendReleasePhase({ mode: 'prepare', repoRoot, env }); assert.deepEqual(state.events, ['prepare']); assert.equal((await readFile(env.GITHUB_OUTPUT, 'utf8')).includes(secret), false); });
});
