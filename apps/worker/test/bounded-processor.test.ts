import { describe, expect, it, vi } from 'vitest';
import { OutboxProcessor } from '../src/jobs/outbox/processor';

describe('bounded outbox execution', () => {
  it('does not claim when insufficient time remains for claim, process and failure statements', async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const result = await new OutboxProcessor({ query }).process({ maxEvents: 10, deadline: 20_000, now: () => 6_000 });
    expect(query).not.toHaveBeenCalled(); expect(result).toMatchObject({ processed: 0, deadlineReached: true });
  });
  it('claims one at a time and stops at the event cap without a leftover batch lease', async () => {
    let count = 0;
    const query = vi.fn(async (sql: string) => sql.includes('claim_outbox') ? { rows: [{ id: `event${++count}`, lease_token: 'lease' }] } : { rows: [{ process_learner_event: { status: 'ACKNOWLEDGED' } }] });
    const result = await new OutboxProcessor({ query }).process({ maxEvents: 2, deadline: 20_000, now: () => 0 });
    expect(result).toMatchObject({ processed: 2, attempted: 2, reviewRequired: false });
    expect(count).toBe(2); expect(query.mock.calls.filter(([sql]) => sql.includes('process_learner_event'))).toHaveLength(2);
  });
  it('failure receipt uncertainty is explicit and source error content is never persisted', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('claim_outbox')) return { rows: [{ id: 'event', lease_token: 'lease' }] };
      if (sql.includes('process_learner_event')) throw new Error('sensitive note');
      return { rows: [{ acknowledged: false }] };
    });
    const result = await new OutboxProcessor({ query }).process({ maxEvents: 1, deadline: 20_000, now: () => 0 });
    expect(result).toMatchObject({ processed: 0, attempted: 1, reviewRequired: true, failureReceiptUnknown: true });
    expect(JSON.stringify(query.mock.calls)).not.toContain('sensitive note');
  });
  it('rechecks remaining time after processing and never claims a stranded next lease', async () => {
    let now = 0; let claims = 0;
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('claim_outbox')) { claims++; return { rows: [{ id: 'event', lease_token: 'lease' }] }; }
      now = 6_000; return { rows: [{ process_learner_event: { status: 'ACKNOWLEDGED' } }] };
    });
    const result = await new OutboxProcessor({ query }).process({ maxEvents: 10, deadline: 20_000, now: () => now });
    expect(claims).toBe(1); expect(result).toMatchObject({ processed: 1, attempted: 1, deadlineReached: true });
  });
  it('empty authorized queue exits without manufacturing processing or failure', async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const result = await new OutboxProcessor({ query }).process({ maxEvents: 10, deadline: 20_000, now: () => 0 });
    expect(query).toHaveBeenCalledOnce(); expect(result).toMatchObject({ processed: 0, attempted: 0, reviewRequired: false, deadlineReached: false });
  });
});
