import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ProviderDeploymentOperation, ProviderDeploymentState } from './hosted-provider-state';

const identity = { sourceSha: 'a'.repeat(40), treeSha: 'b'.repeat(40), apiArtifactSha256: 'c'.repeat(64), edgeArtifactSha256: 'd'.repeat(64), denoLockSha256: 'e'.repeat(64), runtimeSha256: 'f'.repeat(64), teamId: 'team_Cuevo', projectId: 'prj_Api', originalRunId: '51', originalRunAttempt: 1, originalPackageSha256: '1'.repeat(64) };
const operation = (): ProviderDeploymentOperation => ({ identity, phases: [{ name: 'API_ENVIRONMENT', state: 'INTENT', receipt: null }] });
const state = () => ({ version: 1, purpose: 'CUEVO_PRIVATE_PROVIDER_DEPLOYMENT_STATE', projectRef: 'mqxdjvsyckzocokuikmx', operations: [operation()] });

test('private provider history retains original identity and refuses backward or skipped phase transitions', async () => {
  const { validateProviderDeploymentTransition } = await import('./hosted-provider-state');
  const before = state();
  const confirmed = structuredClone(before) as ProviderDeploymentState;
  confirmed.operations[0].phases[0] = { name: 'API_ENVIRONMENT', state: 'CONFIRMED', receipt: { kind: 'API_ENVIRONMENT', keysSha256: '2'.repeat(64), valuesSha256: '3'.repeat(64), variables: [{ key: 'NODE_ENV', id: 'env_original', valueSha256: '4'.repeat(64) }] } };
  assert.doesNotThrow(() => validateProviderDeploymentTransition(before, confirmed, before.projectRef));
  assert.throws(() => validateProviderDeploymentTransition(confirmed, before, before.projectRef));
  for (const change of ['identity', 'skip', 'erase', 'new-operation']) {
    const next = structuredClone(before) as ProviderDeploymentState;
    if (change === 'identity') next.operations[0].identity.originalRunId = '52';
    if (change === 'skip') next.operations[0].phases.push({ name: 'EDGE_SECRETS', state: 'INTENT', receipt: null });
    if (change === 'erase') next.operations = [];
    if (change === 'new-operation') next.operations.push({ ...operation(), identity: { ...identity, sourceSha: '2'.repeat(40) } });
    assert.throws(() => validateProviderDeploymentTransition(before, next, before.projectRef));
  }
});

test('private provider state rejects extra secret fields and unconfirmed receipts', async () => {
  const { providerDeploymentStateSchema } = await import('./hosted-provider-state');
  assert.throws(() => providerDeploymentStateSchema.parse({ ...state(), password: 'must-never-be-public' }));
  const next = state() as ProviderDeploymentState;
  next.operations[0].phases[0].receipt = { kind: 'API_ENVIRONMENT', keysSha256: '2'.repeat(64), valuesSha256: '3'.repeat(64), variables: [{ key: 'NODE_ENV', id: 'env_original', valueSha256: '4'.repeat(64) }] };
  assert.throws(() => providerDeploymentStateSchema.parse(next));
});
