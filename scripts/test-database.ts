import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { assertCuevoLocalTarget, type LocalStatus } from './configure-local';
const cli = resolve('node_modules/supabase/dist/supabase.js');
const status = JSON.parse(execFileSync(process.execPath, [cli, 'status', '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })) as LocalStatus;
assertCuevoLocalTarget(status);
// Test tooling is local-only; install it outside per-file rollback transactions to avoid races.
execFileSync('docker', ['exec', 'supabase_db_cuevo', 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', 'create extension if not exists pgtap with schema extensions'], { stdio: 'inherit' });
execFileSync(process.execPath, [cli, 'test', 'db', '--local', '--network-id', 'cuevo-local'], { stdio: 'inherit' });
