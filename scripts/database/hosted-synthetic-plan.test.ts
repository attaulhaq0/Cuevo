import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hostedSyntheticPlan, validateHostedEmptyTarget } from './hosted-synthetic-plan';

const projectRef = 'mqxdjvsyckzocokuikmx';
const settings = { CUEVO_DEPLOYMENT_ENVIRONMENT: 'synthetic-staging', CUEVO_SYNTHETIC_PROJECT_REF: projectRef };
const project = { id: projectRef, name: 'Cuevo', status: 'ACTIVE_HEALTHY' };
const target = { authUsers: 0, storageObjects: 0, appSchemas: [], migrationVersions: [] };
const migrations = () => readdirSync('supabase/migrations').filter(name => name.endsWith('.sql')).map(name => ({ name, bytes: readFileSync('supabase/migrations/' + name) }));

test('hosted synthetic plan pins the explicit healthy empty project and preserves both migration prerequisites', () => {
  const plan = hostedSyntheticPlan(projectRef, settings, project, target, migrations());
  assert.equal(plan.projectRef, projectRef);
  assert.equal(plan.mode, 'SCHEMA_PLAN_ONLY');
  assert.equal(plan.dispatch, 'DISABLED');
  assert.equal(plan.migrations.length, migrations().length);
  assert.ok(plan.migrations.every(row => /^[a-f0-9]{64}$/.test(row.sha256)));
  const versions = plan.migrations.map(row => row.version);
  assert.ok(versions.indexOf('20261002021737') < versions.indexOf('20261002021206'));
  assert.ok(versions.indexOf('20261002204500') < versions.indexOf('20261002195537'));
});

test('hosted planning refuses missing staging authority, foreign projects and unhealthy targets', () => {
  for (const input of [{}, { ...settings, CUEVO_DEPLOYMENT_ENVIRONMENT: 'production' }, { ...settings, CUEVO_SYNTHETIC_PROJECT_REF: 'cdlgtbvxlxjpcddjazzx' }]) {
    assert.throws(() => hostedSyntheticPlan(projectRef, input, project, target, migrations()));
  }
  assert.throws(() => hostedSyntheticPlan(projectRef, settings, { ...project, id: 'cdlgtbvxlxjpcddjazzx' }, target, migrations()));
  assert.throws(() => hostedSyntheticPlan(projectRef, settings, { ...project, status: 'INACTIVE' }, target, migrations()));
  assert.throws(() => hostedSyntheticPlan(projectRef, settings, { ...project, name: 'Edeviser-Kiro' }, target, migrations()));
});

test('empty hosted plan cannot silently adopt populated Auth, Storage, schemas or migration history', () => {
  for (const value of [{ ...target, authUsers: 1 }, { ...target, storageObjects: 1 }, { ...target, appSchemas: ['app'] }, { ...target, migrationVersions: ['20260930000000'] }, { ...target, authUsers: -1 }, { ...target, storageObjects: null }, { ...target, extra: true }]) {
    assert.throws(() => validateHostedEmptyTarget(value));
  }
});

test('plan is metadata-only and changing locked prerequisite bytes fails before any operation', () => {
  const source = migrations();
  const plan = hostedSyntheticPlan(projectRef, settings, project, target, source);
  assert.equal(JSON.stringify(plan).includes('create function'), false);
  assert.equal(Object.hasOwn(plan, 'credentials'), false);
  assert.throws(() => hostedSyntheticPlan(projectRef, settings, project, target, source.map(row => row.name.startsWith('20261002021737_') ? { ...row, bytes: Buffer.from('changed') } : row)));
});
