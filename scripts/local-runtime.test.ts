import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { assertCuevoLocalConfig, assertCuevoLocalTarget, createRuntimeUrls } from './configure-local';

test('the actual Cuevo config authorizes the advertised local target', () => {
  assert.doesNotThrow(() => assertCuevoLocalConfig(readFileSync('supabase/config.toml', 'utf8')));
});
test('bootstrap refuses another project or Supabase port before service actions', () => {
  const valid = 'project_id = "cuevo"\n[api]\nport = 56321\n[db]\nport = 56322\n';
  for (const config of [valid.replace('"cuevo"', '"other"'), valid.replace('56321', '54321'), valid.replace('56322', '54322')]) {
    assert.throws(() => assertCuevoLocalConfig(config));
  }
});
test('container URLs retain constrained runtime roles and host URLs remain loopback', () => {
  const urls = createRuntimeUrls({ API_URL: 'http://127.0.0.1:56321', DB_URL: 'postgresql://postgres:synthetic@127.0.0.1:56322/postgres' }, { api: 'synthetic-api', worker: 'synthetic-worker' });
  assert.equal(new URL(urls.DATABASE_URL).hostname, '127.0.0.1');
  assert.equal(new URL(urls.DOCKER_DATABASE_URL).hostname, 'host.docker.internal');
  assert.equal(new URL(urls.DOCKER_DATABASE_URL).username, 'cuevo_api');
  assert.equal(new URL(urls.DOCKER_WORKER_DATABASE_URL).username, 'cuevo_worker');
  assert.equal(urls.DOCKER_SUPABASE_URL, 'http://host.docker.internal:56321');
});
test('local credential provisioning rejects remote hosts and legacy project ports', () => {
  const valid = { API_URL: 'http://127.0.0.1:56321', DB_URL: 'postgresql://postgres:synthetic@127.0.0.1:56322/postgres' };
  for (const target of [
    { ...valid, API_URL: 'https://remote.supabase.co' },
    { ...valid, API_URL: 'http://localhost:54321' },
    { ...valid, DB_URL: 'postgresql://postgres:synthetic@remote.example:56322/postgres' },
    { ...valid, DB_URL: 'postgresql://postgres:synthetic@localhost:54322/postgres' },
  ]) assert.throws(() => assertCuevoLocalTarget(target));
});
