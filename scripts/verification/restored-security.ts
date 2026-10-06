import type { Pool } from 'pg';
import { Database } from '../../apps/api/src/platform/database/database';
export async function verifyRestoredSecurity(owner: Pool, sourceApiUrl: string, scratch: string) {
  const url = new URL(sourceApiUrl); url.pathname = '/' + scratch;
  const database = new Database(url.toString());
  try {
    if (!await database.ready()) throw Error('Restored restricted API role is not ready.');
    const tenant = '10000000-0000-4000-8000-000000000001';
    const learner = '20000000-0000-4000-8000-000000000012';
    const peer = '20000000-0000-4000-8000-000000000013';
    const own = await database.actorTransaction(learner, tenant, async client => (await client.query('select count(*)::integer total from app.people')).rows[0].total);
    if (own !== 1) throw Error('Restored self scope is invalid.');
    const denied = await database.actorTransaction(peer, tenant, async client => (await client.query('select count(*)::integer total from app.people where actor_id=$1', [learner])).rows[0].total);
    if (denied !== 0) throw Error('Restored peer scope leaked a learner.');
    const unknown = await database.actorTransaction(learner, tenant, async client => (await client.query('select "authorization".is_current_session($1)as active', ['99999999-0000-4000-8000-000000000001'])).rows[0]?.active);
    if (unknown !== false) throw Error('Restored unknown session is authorized.');
    const session=(await owner.query('select id from auth.sessions where user_id=$1 and(not_after is null or not_after>now())order by created_at desc limit 1',[learner])).rows[0]?.id;
    if(!session)throw Error('No restored current synthetic learner session available.');
    const sessionActive=await database.actorTransaction(learner,tenant,async client=>(await client.query('select "authorization".is_current_session($1)as active',[session])).rows[0]?.active);
    if(sessionActive!==true)throw Error('Restored current session smoke failed.');
    await owner.query("update auth.sessions set not_after=clock_timestamp()-interval'1 second'where id=$1",[session]);
    const sessionDenied=await database.actorTransaction(learner,tenant,async client=>(await client.query('select "authorization".is_current_session($1)as active',[session])).rows[0]?.active);
    if(sessionDenied!==false)throw Error('Restored revoked session retained access.');
    let auditDenied=false;try{await database.actorTransaction(learner,tenant,client=>client.query('select *from internal.audit_events limit 1'));}catch(error){auditDenied=typeof error==='object'&&error!==null&&'code'in error&&error.code==='42501';}
    if (!auditDenied) throw Error('Restored private audit grants changed or were not verified.');
    const privateGrants = (await owner.query("select count(*)::integer total from pg_class table_row join pg_namespace namespace on namespace.oid=table_row.relnamespace join pg_roles role_row on role_row.rolname in('anon','authenticated','service_role')where namespace.nspname in('app','internal')and table_row.relkind='r'and has_table_privilege(role_row.oid,table_row.oid,'SELECT,INSERT,UPDATE,DELETE')")).rows[0]?.total;
    if (privateGrants !== 0) throw Error('Restored Data API has private table privileges.');
    const protectedTables = (await owner.query("select count(*)::integer total from pg_class table_row join pg_namespace namespace on namespace.oid=table_row.relnamespace where namespace.nspname in('app','internal')and table_row.relkind='r'and(not table_row.relrowsecurity or not table_row.relforcerowsecurity)")).rows[0]?.total;
    if(protectedTables!==0)throw Error('Restored private tables lost forced row security.');
    const workerWrite = (await owner.query("select count(*)::integer total from pg_class table_row join pg_namespace namespace on namespace.oid=table_row.relnamespace where namespace.nspname='app'and table_row.relkind='r'and has_table_privilege('cuevo_worker',table_row.oid,'INSERT,UPDATE,DELETE')")).rows[0]?.total;
    if(workerWrite!==0)throw Error('Restored worker gained raw authority.');
    return { name: 'restored_restricted_scope_and_grants', passed: true };
  } finally { await database.close(); }
}
