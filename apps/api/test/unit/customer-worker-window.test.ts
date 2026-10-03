import { describe, expect, it } from 'vitest';
import { drainGuardedSyntheticQueue, requireSyntheticWorkerTarget, syntheticQueueGuard } from '../integration/customer-worker-window';

describe('exclusive synthetic worker claim fixture', () => {
  it('rejects foreign targets and privileged connections before worker traffic', () => {
    expect(requireSyntheticWorkerTarget('postgresql://cuevo_worker:invented@127.0.0.1:56322/postgres')).toContain('56322');
    for (const value of [undefined, 'postgresql://cuevo_worker:invented@remote:56322/postgres', 'postgresql://postgres:invented@127.0.0.1:56322/postgres', 'postgresql://cuevo_worker:invented@127.0.0.1:54322/postgres']) expect(() => requireSyntheticWorkerTarget(value)).toThrow();
  });
  it('denies unknown or real queue actors/populations before claiming', async () => {
    let claims = 0;
    await expect(drainGuardedSyntheticQueue(async () => ({ rows: [{ unsafe_count: 1 }] }), async () => { claims++; return { rows: [] }; })).rejects.toThrow('unknown or real');
    expect(claims).toBe(0);
    expect(syntheticQueueGuard).toContain('actor.synthetic is distinct from true');
    expect(syntheticQueueGuard).toContain('app.memberships');
  });
  it('drains valid backlog through the exact claimed source/lease before opening competition', async () => {
    const processed: unknown[][] = []; let claims = 0;
    await drainGuardedSyntheticQueue(async sql => ({ rows: [sql.includes('unsafe_count') ? { unsafe_count: 0 } : { count: 0 }] }), async (sql, values) => {
      if (sql.includes('claim_outbox')) return { rows: ++claims === 1 ? [{ id: 'event-a', lease_token: 'lease-a' }, { id: 'event-b', lease_token: 'lease-b' }] : [] };
      processed.push(values!); return { rows: [] };
    });
    expect(processed).toEqual([['event-a', 'lease-a'], ['event-b', 'lease-b']]);
  });
  it('refuses a nonclaimable active lease and propagates source-processing failure', async () => {
    await expect(drainGuardedSyntheticQueue(async sql => ({ rows: [sql.includes('unsafe_count') ? { unsafe_count: 0 } : { count: 1 }] }), async () => ({ rows: [] }))).rejects.toThrow('active leases');
    await expect(drainGuardedSyntheticQueue(async () => ({ rows: [{ unsafe_count: 0 }] }), async sql => { if (sql.includes('claim_outbox')) return { rows: [{ id: 'source', lease_token: 'lease' }] }; throw Error('source denied'); })).rejects.toThrow('source denied');
  });
});
