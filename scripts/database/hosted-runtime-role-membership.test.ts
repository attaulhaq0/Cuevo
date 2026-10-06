import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { initialRuntimeRolesSql } from './hosted-runtime-role-membership';

test('the native runtime provisioning owner consumes the reviewed membership query instead of a duplicated predicate', () => {
 const owner=readFileSync('scripts/database/hosted-migration-database.ts','utf8');
 assert(owner.includes("import { initialRuntimeRolesSql } from './hosted-runtime-role-membership';"));
 assert(owner.includes('await row(initialRuntimeRolesSql)'));
 assert.equal((owner.match(/CUEVO_RUNTIME_INITIAL_ROLES/g)??[]).length,0);
});

test('native database verification exercises initial role membership without changing applied migrations', () => {
 const runner=readFileSync('scripts/database/worker-transport-fixtures.ts','utf8');
 assert(runner.includes('initialRuntimeRolesSql'));
 assert(runner.includes('runtime-role-memberships'));
 assert(initialRuntimeRolesSql.includes("recipient.rolname = 'postgres'"));
 assert(initialRuntimeRolesSql.includes("grantor.rolname = 'supabase_admin'"));
});
