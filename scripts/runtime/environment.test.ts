import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runtimeEnvironment } from './environment';
import {parseServerConfig}from'@cuevo/config';

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
test('worker generation remains a private worker-only runtime input',()=>{const current={...input,CUEVO_WORKER_RELEASE_GENERATION:'9223372036854775807'};assert.equal(runtimeEnvironment('worker',current).CUEVO_WORKER_RELEASE_GENERATION,'9223372036854775807');assert.equal(runtimeEnvironment('api',current).CUEVO_WORKER_RELEASE_GENERATION,undefined);assert.equal(runtimeEnvironment('web',current).CUEVO_WORKER_RELEASE_GENERATION,undefined);});

test('mapped presentation profile preserves strict local admission and cannot sanitize hosted or provisioning authority',()=>{
  const local={CUEVO_LOCAL_DEMO_MODE:'INTEGRATION_PRESENTATION',NODE_ENV:'development',CUEVO_DEPLOYMENT_ENVIRONMENT:'local',SUPABASE_URL:'http://127.0.0.1:57421',DATABASE_URL:'postgresql://cuevo_api:fixture@127.0.0.1:57422/cuevo_integration_20261004',API_ALLOWED_ORIGIN:'http://127.0.0.1:54131',API_PORT:'54132',AI_GENERATION_MODE:'FIXTURE',AI_FIXTURE_ENABLED:'true',POSTHOG_CAPTURE_MODE:'DISABLED'};
  assert.equal(parseServerConfig(runtimeEnvironment('api',local),'api').localDemoMode,'INTEGRATION_PRESENTATION');
  for(const patch of [{VERCEL:'1'},{VERCEL:''},{VERCEL_ENV:'preview'},{VERCEL_URL:'cuevo.vercel.app'},{CUEVO_AUTH_PROVISIONING_MODE:'HOSTED'},{CUEVO_AUTH_PROVISIONING_KEY:'private-provider-canary'},{CUEVO_AUTH_PROVISIONING_MODE:'DISABLED',CUEVO_AUTH_PROVISIONING_KEY:'private-provider-canary'}])assert.throws(()=>parseServerConfig(runtimeEnvironment('api',{...local,...patch}),'api'),error=>error instanceof Error&&!error.message.includes('private-provider-canary'));
});

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

test('dedicated local Auth provisioning inputs reach only the explicit API child', () => {
  const provision = { CUEVO_AUTH_PROVISIONING_MODE: 'LOCAL_SYNTHETIC', CUEVO_AUTH_PROVISIONING_KEY: 'dedicated-auth-key', CUEVO_AUTH_PROVISIONING_URL: 'http://127.0.0.1:56321', CUEVO_AUTH_PROVISIONING_PROJECT_REF: 'LOCAL_CUEVO', CUEVO_AUTH_PROVISIONING_WEB_ORIGIN: 'http://localhost:3000' };
  const api = runtimeEnvironment('api', { ...input, ...provision });
  for (const [key, value] of Object.entries(provision)) assert.equal(api[key], value);
  for (const service of ['web', 'worker'] as const) {
    const child = runtimeEnvironment(service, { ...input, ...provision });
    for (const key of Object.keys(provision)) assert.equal(child[key], undefined);
  }
});

test('disabled or absent local provisioning mode never forwards the dedicated key', () => {
  for (const mode of [undefined, 'DISABLED']) {
    const child = runtimeEnvironment('api', { ...input, CUEVO_AUTH_PROVISIONING_MODE: mode, CUEVO_AUTH_PROVISIONING_KEY: 'dedicated-auth-key' });
    assert.equal(child.CUEVO_AUTH_PROVISIONING_KEY, undefined);
  }
});

test('testing quick-login flag and private account path reach only an explicitly enabled local web child', () => {
  const local = { ...input, HOSTNAME: '127.0.0.1', CUEVO_TEST_QUICK_LOGIN: '1', CUEVO_TEST_LOGIN_ACCOUNTS_FILE: 'private-local-file', NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:57421' };
  assert.equal(runtimeEnvironment('web', local).CUEVO_TEST_LOGIN_ACCOUNTS_FILE, 'private-local-file');
  for (const service of ['api', 'worker'] as const) assert.equal(runtimeEnvironment(service, local).CUEVO_TEST_QUICK_LOGIN, undefined);
  for (const patch of [{ HOSTNAME: '0.0.0.0' }, { HOSTNAME: undefined }, { VERCEL: '1' }, { VERCEL_ENV: 'preview' }, { CUEVO_DEPLOYMENT_ENVIRONMENT: 'production' }, { CUEVO_TEST_QUICK_LOGIN: 'false' }, { NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co' }]) {
    const child = runtimeEnvironment('web', { ...local, ...patch }); assert.equal(child.CUEVO_TEST_QUICK_LOGIN, undefined); assert.equal(child.CUEVO_TEST_LOGIN_ACCOUNTS_FILE, undefined);
  }
});
