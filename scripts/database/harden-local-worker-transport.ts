import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { assertCuevoLocalTarget, type LocalStatus } from '../configure-local';
import { validateOutageDatabaseContainer } from '../verification/runtime-outage-rules';

// Supabase-owned extension ACLs cannot be changed by the ordinary migration role.
// This operator hook is local-only and never grants application runtime access.
const status = JSON.parse(execFileSync(process.execPath, [resolve('node_modules/supabase/dist/supabase.js'), 'status', '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })) as LocalStatus;
assertCuevoLocalTarget(status);
validateOutageDatabaseContainer(JSON.parse(execFileSync('docker', ['inspect', 'supabase_db_cuevo'], { encoding: 'utf8' }))[0]);
const sql = `begin;
revoke usage on schema net,vault from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
revoke all on all tables in schema net,vault from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
revoke all on all sequences in schema net from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant usage on schema net,vault to postgres;
grant select on vault.decrypted_secrets to postgres;
grant select,insert,delete on net.http_request_queue,net._http_response to postgres;
grant usage,select on all sequences in schema net to postgres;
commit;
select net.worker_restart();`;
execFileSync('docker', ['exec', '-i', 'supabase_db_cuevo', 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], { input: sql, stdio: ['pipe', 'ignore', 'pipe'] });
const result = execFileSync('docker', ['exec', 'supabase_db_cuevo', 'psql', '-U', 'postgres', '-d', 'postgres', '-At', '-c', 'select internal.worker_transport_private();'], { encoding: 'utf8' }).trim();
if (result !== 't') throw Error('Local worker transport grants require review.');
console.log('Verified local provider-owned worker transport grants; hosted activation remains separately guarded.');
