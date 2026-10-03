import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runtimeEnvironment } from './environment';

const input = {
  PATH: 'toolchain', SystemRoot: 'windows', NODE_ENV: 'development', NODE_OPTIONS: '--require=unsafe',
  DATABASE_URL: 'api-credential', WORKER_DATABASE_URL: 'worker-credential',
  SUPABASE_URL: 'https://auth.example', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
  SUPABASE_SERVICE_ROLE_KEY: 'storage-credential', OPENAI_API_KEY: 'model-credential',
  POSTHOG_CAPTURE_MODE: 'LIVE_SYNTHETIC', POSTHOG_PROJECT_ID: '393668', POSTHOG_HOST: 'https://us.i.posthog.com',
  POSTHOG_PROJECT_KEY: 'project-credential', POSTHOG_PSEUDONYM_KEY: 'a'.repeat(64),
  POSTHOG_PSEUDONYM_KEY_VERSION: '1', POSTHOG_ENVIRONMENT: 'QA',
  POSTHOG_PERSONAL_API_KEY: 'unreviewed-credential', UNRELATED_SECRET: 'unrelated-credential',
  NEXT_PUBLIC_API_URL: 'https://api.example', NEXT_PUBLIC_SUPABASE_URL: 'https://auth.example',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example', NEXT_PUBLIC_UNREVIEWED_KEY: 'unreviewed',
  AI_GENERATION_MODE: 'FIXTURE', AI_FIXTURE_ENABLED: 'true', ANALYTICS_FIXTURE_ENABLED: 'true',
};

test('web child receives only reviewed public configuration and toolchain environment', () => {
  const child = runtimeEnvironment('web', input);
  assert.equal(child.NEXT_PUBLIC_API_URL, input.NEXT_PUBLIC_API_URL);
  assert.equal(child.PATH, input.PATH);
  for (const key of ['DATABASE_URL', 'WORKER_DATABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'OPENAI_API_KEY', 'POSTHOG_PROJECT_KEY', 'UNRELATED_SECRET', 'NODE_OPTIONS', 'NEXT_PUBLIC_UNREVIEWED_KEY']) assert.equal(child[key], undefined);
});

test('API child excludes worker and unrelated credentials while retaining its required consumers', () => {
  const child = runtimeEnvironment('api', input);
  assert.equal(child.DATABASE_URL, input.DATABASE_URL);
  assert.equal(child.SUPABASE_SERVICE_ROLE_KEY, input.SUPABASE_SERVICE_ROLE_KEY);
  assert.equal(child.AI_GENERATION_MODE, 'FIXTURE');
  for (const key of ['WORKER_DATABASE_URL', 'UNRELATED_SECRET', 'NODE_OPTIONS', 'NEXT_PUBLIC_API_URL', 'POSTHOG_PROJECT_KEY']) assert.equal(child[key], undefined);
});

test('worker child retains its restricted credential and excludes API, storage and model credentials', () => {
  const child = runtimeEnvironment('worker', input);
  assert.equal(child.WORKER_DATABASE_URL, input.WORKER_DATABASE_URL);
  assert.equal(child.ANALYTICS_FIXTURE_ENABLED, 'true');
  for (const key of ['DATABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'OPENAI_API_KEY', 'UNRELATED_SECRET', 'NODE_OPTIONS', 'NEXT_PUBLIC_API_URL']) assert.equal(child[key], undefined);
});

test('analytics capture settings have only the worker as a child recipient', () => {
  const worker = runtimeEnvironment('worker', input);
  const api = runtimeEnvironment('api', input);
  const web = runtimeEnvironment('web', input);
  for (const key of [
    'POSTHOG_CAPTURE_MODE', 'POSTHOG_PROJECT_ID', 'POSTHOG_HOST', 'POSTHOG_PROJECT_KEY',
    'POSTHOG_PSEUDONYM_KEY', 'POSTHOG_PSEUDONYM_KEY_VERSION', 'POSTHOG_ENVIRONMENT',
  ] as const) {
    assert.equal(worker[key], input[key]);
    assert.equal(api[key], undefined);
    assert.equal(web[key], undefined);
  }
  for (const child of [worker, api, web]) assert.equal(child.POSTHOG_PERSONAL_API_KEY, undefined);
});

test('hosted synthetic authority stays server-only while API and worker retain the exact source binding', () => {
  const authority = { CUEVO_DEPLOYMENT_ENVIRONMENT: 'synthetic-staging', CUEVO_SYNTHETIC_PROJECT_REF: 'abcdefghijklmnopqrst', CUEVO_SYNTHETIC_WEB_ORIGIN: 'https://cuevo.example', CUEVO_DATABASE_TLS_CA: 'reviewed-ca', SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co' };
  for (const service of ['api', 'worker'] as const) {
    const child = runtimeEnvironment(service, authority);
    for (const [key, value] of Object.entries(authority)) assert.equal(child[key], value);
  }
  const web = runtimeEnvironment('web', authority);
  for (const key of Object.keys(authority)) assert.equal(web[key], undefined);
});
