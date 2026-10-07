import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import * as roles from './hosted-runtime-role-membership';
const {initialRuntimeRolesSql}=roles;

test('the native runtime provisioning owner consumes the reviewed membership query instead of a duplicated predicate', () => {
 const owner=readFileSync('scripts/database/hosted-migration-database.ts','utf8');
 assert(owner.includes("import { initialRuntimeRolesSql, recoveredRuntimeRolesSql } from './hosted-runtime-role-membership';"));
 assert(owner.includes('await row(initialRuntimeRolesSql)'));
 assert.equal((owner.match(/CUEVO_RUNTIME_INITIAL_ROLES/g)??[]).length,0);
});

test('recovered predicate changes only the reviewed login state and diagnostic marker while retaining all relationship denials',()=>{
 assert.equal(typeof roles.recoveredRuntimeRolesSql,'string');
 assert.equal(roles.recoveredRuntimeRolesSql,initialRuntimeRolesSql.replace('CUEVO_RUNTIME_INITIAL_ROLES','CUEVO_RUNTIME_RECOVERED_ROLES').replace('not rolcanlogin','rolcanlogin'));
 const initialBody=initialRuntimeRolesSql.replace('CUEVO_RUNTIME_INITIAL_ROLES','CUEVO_RUNTIME_RECOVERED_ROLES').replace('not rolcanlogin','rolcanlogin');
 assert.equal(roles.recoveredRuntimeRolesSql,initialBody);
 for(const invariant of ["recipient.rolname = 'postgres'","grantor.rolname = 'supabase_admin'","recipient.rolname in ('cuevo_api','cuevo_worker')",'not membership.inherit_option','not membership.set_option','not rolsuper','not rolbypassrls'])assert.ok(roles.recoveredRuntimeRolesSql.includes(invariant));
 const active=readFileSync('scripts/verification/backend-runtime-resume.ts','utf8');assert.ok(active.includes('query(recoveredRuntimeRolesSql)'));assert.equal(active.includes("initialRuntimeRolesSql.replace"),false);
});

test('native database verification exercises initial role membership without changing applied migrations', () => {
 const runner=readFileSync('scripts/database/worker-transport-fixtures.ts','utf8');
 assert(runner.includes('initialRuntimeRolesSql'));
 assert(runner.includes('runtime-role-memberships'));
 assert(initialRuntimeRolesSql.includes("recipient.rolname = 'postgres'"));
 assert(initialRuntimeRolesSql.includes("grantor.rolname = 'supabase_admin'"));
});
