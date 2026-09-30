import { Pool, type PoolClient } from 'pg';
import { DomainError } from '@cuevo/domain';
export class Database {
  readonly pool: Pool | undefined;
  constructor(url: string | undefined) {
    this.pool = url ? new Pool({ connectionString: url, max: 10, connectionTimeoutMillis: 3000, idleTimeoutMillis: 10000, statement_timeout: 5000 }) : undefined;
    // pg-pool removes the failed idle client. Consume its event without exposing connection details.
    this.pool?.on('error', () => { console.error(JSON.stringify({ service: 'cuevo-api', code: 'DATABASE_IDLE_CONNECTION_FAILED' })); });
  }
  async actorTransaction<T>(userId: string, schoolId: string | undefined, fn: (client: PoolClient) => Promise<T>): Promise<T> {
    if (!this.pool) throw new DomainError('DATABASE_UNAVAILABLE', 503, 'School services are temporarily unavailable.');
    const client = await this.pool.connect().catch(() => { throw new DomainError('DATABASE_UNAVAILABLE', 503, 'School services are temporarily unavailable.'); });
    try {
      await client.query('BEGIN');
      await client.query("select set_config('app.actor_id',$1,true), set_config('app.school_id',$2,true)", [userId, schoolId ?? '']);
      const result = await fn(client); await client.query('COMMIT'); return result;
    } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error; }
    finally { client.release(); }
  }
  async ready(): Promise<boolean> {
    if (!this.pool) return false;
    try {
      const result = await this.pool.query<{ ready: boolean }>(`
        with runtime as (select oid, rolsuper, rolbypassrls from pg_roles where rolname = current_user),
        required as (select to_regprocedure('"authorization".current_memberships()') as memberships,
          to_regprocedure('"authorization".is_current_session(uuid)') as sessions,
          to_regnamespace('app') as app_schema, to_regnamespace('"authorization"') as authorization_schema,
          to_regnamespace('internal') as internal_schema)
        select coalesce((select not r.rolsuper and not r.rolbypassrls
          and not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
            where n.nspname in ('app','internal','authorization') and c.relowner=r.oid)
          and not exists (select 1 from pg_namespace n where n.nspname in ('app','internal','authorization') and n.nspowner=r.oid)
          and not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
            where n.nspname in ('app','internal','authorization') and p.proowner=r.oid)
          and q.memberships is not null and q.sessions is not null
          and has_function_privilege(current_user,q.memberships,'EXECUTE')
          and has_function_privilege(current_user,q.sessions,'EXECUTE')
          and has_schema_privilege(current_user,q.app_schema,'USAGE')
          and has_schema_privilege(current_user,q.authorization_schema,'USAGE')
          and has_schema_privilege(current_user,q.internal_schema,'USAGE')
          and to_regclass('app.schools') is not null and to_regclass('app.memberships') is not null
          and to_regclass('internal.audit_events') is not null and to_regclass('internal.outbox_events') is not null
          from runtime r cross join required q),false) as ready
      `);
      if (result.rows[0]?.ready !== true) return false;
      // Prove required functions execute. Without actor context these return no memberships/false.
      await this.pool.query('select (select count(*) from "authorization".current_memberships()) as membership_count, "authorization".is_current_session(null::uuid) as session_active');
      return true;
    } catch { return false; }
  }
  async close() { await this.pool?.end(); }
}
