import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Pool } from 'pg';

export type LocalStatus = { API_URL: string; DB_URL: string; PUBLISHABLE_KEY: string; SERVICE_ROLE_KEY: string };
type Secrets = { api: string; worker: string; syntheticPassword: string };

export function assertCuevoLocalConfig(config: string) {
  const section = (name: string) => config.match(new RegExp(`\\[${name}\\]([\\s\\S]*?)(?=\\n\\[|$)`))?.[1] ?? '';
  if (!/^project_id\s*=\s*"cuevo"\s*$/m.test(config)
    || !/^port\s*=\s*56321\s*$/m.test(section('api'))
    || !/^port\s*=\s*56322\s*$/m.test(section('db'))) {
    throw new Error('Bootstrap refuses any project or ports outside the known local Cuevo environment.');
  }
}

export function assertCuevoLocalTarget(status: Pick<LocalStatus, 'API_URL' | 'DB_URL'>) {
  const api = new URL(status.API_URL);
  const db = new URL(status.DB_URL);
  const loopback = (host: string) => ['localhost', '127.0.0.1'].includes(host);
  if (api.protocol !== 'http:' || !loopback(api.hostname) || api.port !== '56321' || api.username || api.password || api.pathname !== '/' || api.search || api.hash
    || !['postgres:', 'postgresql:'].includes(db.protocol) || !loopback(db.hostname) || db.port !== '56322' || db.username !== 'postgres' || db.pathname !== '/postgres' || db.search || db.hash) {
    throw new Error('Refusing to configure a non-Cuevo local environment.');
  }
}

export function createRuntimeUrls(status: Pick<LocalStatus, 'API_URL' | 'DB_URL'>, secrets: Pick<Secrets, 'api' | 'worker'>) {
  assertCuevoLocalTarget(status);
  const dbUrl = (role: string, password: string, docker = false) => {
    const url = new URL(status.DB_URL);
    url.username = role; url.password = password;
    if (docker) url.hostname = 'host.docker.internal';
    return url.toString();
  };
  const dockerAuth = new URL(status.API_URL); dockerAuth.hostname = 'host.docker.internal';
  return {
    DATABASE_URL: dbUrl('cuevo_api', secrets.api), WORKER_DATABASE_URL: dbUrl('cuevo_worker', secrets.worker),
    DOCKER_DATABASE_URL: dbUrl('cuevo_api', secrets.api, true), DOCKER_WORKER_DATABASE_URL: dbUrl('cuevo_worker', secrets.worker, true),
    DOCKER_SUPABASE_URL: dockerAuth.origin,
  };
}

async function main() {
  const config = await readFile('supabase/config.toml', 'utf8');
  assertCuevoLocalConfig(config);
  const status = JSON.parse(execFileSync(process.execPath, [resolve('node_modules/supabase/dist/supabase.js'), 'status', '-o', 'json'], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
  })) as LocalStatus;
  assertCuevoLocalTarget(status);
  await mkdir('.local', { recursive: true });
  const secretFile = resolve('.local/runtime-secrets.json');
  let secrets: Secrets;
  try { secrets = JSON.parse(await readFile(secretFile, 'utf8')) as Secrets; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('Local runtime credentials cannot be read; existing credentials were preserved.');
    secrets = { api: randomBytes(32).toString('hex'), worker: randomBytes(32).toString('hex'), syntheticPassword: randomBytes(24).toString('base64url') };
    await writeFile(secretFile, JSON.stringify(secrets), { mode: 0o600 });
  }
  const admin = new Pool({ connectionString: status.DB_URL });
  try {
    const found = await admin.query<{ rolname: string }>("select rolname from pg_roles where rolname in ('cuevo_api','cuevo_worker')");
    if (found.rowCount !== 2) throw new Error('Apply the Cuevo foundation migration before local configuration.');
    // ALTER ROLE cannot parameterize PASSWORD; generated values must remain constrained hex.
    if (!/^[a-f0-9]{64}$/.test(secrets.api) || !/^[a-f0-9]{64}$/.test(secrets.worker)) throw new Error('Invalid local runtime credential format.');
    await admin.query(`alter role cuevo_api login password '${secrets.api}'`);
    await admin.query(`alter role cuevo_worker login password '${secrets.worker}'`);
    // The managed Realtime tenant table requires the local platform owner, not the app/migration role.
    execFileSync('docker',['exec','supabase_db_cuevo','psql','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1','-c',"do $$begin if(select count(*)from _realtime.tenants)<>1 or not exists(select 1 from _realtime.tenants where external_id='realtime-dev')then raise exception 'Unexpected local Realtime tenant';end if;update _realtime.tenants set private_only=true where external_id='realtime-dev';end$$;"],{stdio:'ignore'});
  } finally { await admin.end(); }
  const variables: Record<string, string> = {
    NODE_ENV: 'development', API_PORT: '4000', WORKER_PORT: '4001', API_ALLOWED_ORIGIN: 'http://localhost:3000',
    AI_GENERATION_MODE: 'FIXTURE', AI_FIXTURE_ENABLED: 'true', AI_POLICY_VERSION: '1',
    ...createRuntimeUrls(status, secrets), SUPABASE_URL: status.API_URL, SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
    SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY, NEXT_PUBLIC_API_URL: 'http://localhost:4000',
    NEXT_PUBLIC_SUPABASE_URL: status.API_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
  };
  await writeFile('.env.local', Object.entries(variables).map(([key, value]) => `${key}=${value}`).join('\n') + '\n', { mode: 0o600 });
  console.log('Local Cuevo environment configured in ignored .env.local; no credentials printed.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
