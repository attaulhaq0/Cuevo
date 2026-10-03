import { config as dotenv } from 'dotenv';
import { describe, expect, it } from 'vitest';
import { Pool, type PoolClient } from 'pg';
import { createCustomerContext } from './customer-test-context';

dotenv({ path: '.env.local', quiet: true });
describe.skipIf(process.env.CUEVO_REQUIRE_INTEGRATION !== '1')('capture activation and school policy serialization', () => {
  it('revocation waits for in-flight activation and reapproval cannot reuse its cutoff', async () => {
    const context = await createCustomerContext({ committed: true });
    const target = new URL(process.env.DATABASE_URL ?? '');
    if (!['127.0.0.1', 'localhost'].includes(target.hostname) || target.port !== '56322' || target.pathname !== '/postgres') throw Error('Exact synthetic local Cuevo target required.');
    target.username = 'postgres'; target.password = 'postgres';
    const owner = new Pool({ connectionString: target.toString(), max: 1, connectionTimeoutMillis: 3000, statement_timeout: 5000 });
    let connection: PoolClient | undefined;
    try {
      const policy = { parentAttendanceVisible: false, parentUpcomingVisible: false, studentMessagingEnabled: false, recognitionEnabled: false, leaderboardEnabled: false, reason: 'Synthetic capture epoch concurrency verification.', confirmPolicyApproval: true };
      await context.command('admin', '/v1/school/policies', { ...policy, expectedVersion: 0, analyticsEnabled: true });
      connection = await owner.connect(); await connection.query('BEGIN');
      await connection.query("set local app.runtime_env='local'");
      expect((await connection.query("select internal.configure_posthog_school($1,true,'QA',1)as enabled", [context.school])).rows[0]?.enabled).toBe(true);
      let settled = false;
      const revocation = context.request('admin', '/v1/school/policies', { ...policy, expectedVersion: 1, analyticsEnabled: false }).then(response => { settled = true; return response; });
      await new Promise(done => setTimeout(done, 150)); expect(settled).toBe(false);
      await connection.query('COMMIT'); expect((await revocation).statusCode).toBe(200);
      expect((await context.client.query('select enabled from internal.posthog_school_activation where school_id=$1', [context.school])).rows[0]?.enabled).toBe(false);
      await context.command('admin', '/v1/school/policies', { ...policy, expectedVersion: 2, analyticsEnabled: true });
      expect((await context.client.query('select internal.posthog_school_allowed($1)as enabled', [context.school])).rows[0]?.enabled).toBe(false);
      await connection.query('BEGIN'); await connection.query("set local app.runtime_env='local'");
      expect((await connection.query("select internal.configure_posthog_school($1,true,'QA',1)as enabled", [context.school])).rows[0]?.enabled).toBe(true);
      await connection.query('COMMIT');
      expect((await context.client.query('select internal.posthog_school_allowed($1)as enabled', [context.school])).rows[0]?.enabled).toBe(true);
    } finally {
      await connection?.query('ROLLBACK').catch(() => undefined); connection?.release();
      await owner.end(); await context.close();
    }
  }, 60000);
});
