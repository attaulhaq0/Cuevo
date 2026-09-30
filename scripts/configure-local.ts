import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { Pool } from 'pg';
type Status = { API_URL: string; DB_URL: string; PUBLISHABLE_KEY: string; SERVICE_ROLE_KEY: string };
const status = JSON.parse(execFileSync(process.execPath, [resolve('node_modules/supabase/dist/supabase.js'), 'status', '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })) as Status;
if (!['localhost', '127.0.0.1'].includes(new URL(status.API_URL).hostname) || new URL(status.DB_URL).port !== '56322') throw new Error('Refusing to configure a non-Cuevo local environment.');
await mkdir('.local', { recursive: true });
const secretFile = resolve('.local/runtime-secrets.json');
let secrets: { api: string; worker: string; syntheticPassword: string };
try { secrets = JSON.parse(await readFile(secretFile, 'utf8')) as typeof secrets; }
catch { secrets = { api: randomBytes(32).toString('hex'), worker: randomBytes(32).toString('hex'), syntheticPassword: randomBytes(24).toString('base64url') }; await writeFile(secretFile, JSON.stringify(secrets), { mode: 0o600 }); }
const admin = new Pool({ connectionString: status.DB_URL });
try {
  const found = await admin.query<{ rolname: string }>("select rolname from pg_roles where rolname in ('cuevo_api','cuevo_worker')");
  if (found.rowCount !== 2) throw new Error('Apply the Cuevo foundation migration before local configuration.');
  // Generated hex passwords are constrained here because ALTER ROLE cannot parameterize PASSWORD.
  if (!/^[a-f0-9]{64}$/.test(secrets.api) || !/^[a-f0-9]{64}$/.test(secrets.worker)) throw new Error('Invalid local runtime credential format.');
  await admin.query(`alter role cuevo_api login password '${secrets.api}'`);
  await admin.query(`alter role cuevo_worker login password '${secrets.worker}'`);
} finally { await admin.end(); }
const dbUrl = (role: string, password: string) => { const url = new URL(status.DB_URL); url.username = role; url.password = password; return url.toString(); };
const variables: Record<string, string> = { NODE_ENV: 'development', API_PORT: '4000', WORKER_PORT: '4001', API_ALLOWED_ORIGIN: 'http://localhost:3000', DATABASE_URL: dbUrl('cuevo_api', secrets.api), WORKER_DATABASE_URL: dbUrl('cuevo_worker', secrets.worker), SUPABASE_URL: status.API_URL, SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY, NEXT_PUBLIC_API_URL: 'http://localhost:4000', NEXT_PUBLIC_SUPABASE_URL: status.API_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY };
await writeFile('.env.local', Object.entries(variables).map(([key, value]) => `${key}=${value}`).join('\n') + '\n', { mode: 0o600 });
console.log('Local Cuevo environment configured in ignored .env.local; no credentials printed.');
