import { describe, expect, it } from 'vitest';
import { OutboxProcessor } from '../src/jobs/outbox/processor';
import type { WorkerQueryPort, WorkerRow } from '../src/platform/query-port';
import type { DeliveryMetric } from '../src/platform/telemetry';

const event = { id: '30000000-0000-4000-8000-000000000001', lease_token: '40000000-0000-4000-8000-000000000001' };
const learnerId = '20000000-0000-4000-8000-000000000012';
const validReceipts = [
  { name: 'ACKNOWLEDGED', receipt: { status: 'ACKNOWLEDGED' }, processed: 1, deferred: 0, reviewRequired: false, outcome: 'COMPLETED' },
  { name: 'DUPLICATE', receipt: { status: 'DUPLICATE' }, processed: 1, deferred: 0, reviewRequired: false, outcome: 'COMPLETED' },
  { name: 'DUPLICATE_SOURCE', receipt: { status: 'DUPLICATE_SOURCE' }, processed: 1, deferred: 0, reviewRequired: false, outcome: 'COMPLETED' },
  { name: 'PROCESSED', receipt: { status: 'PROCESSED', learnerId }, processed: 1, deferred: 0, reviewRequired: false, outcome: 'COMPLETED' },
  { name: 'COMPLETED', receipt: { status: 'COMPLETED' }, processed: 1, deferred: 0, reviewRequired: false, outcome: 'COMPLETED' },
  { name: 'AWARDED', receipt: { status: 'AWARDED', awards: 2 }, processed: 1, deferred: 0, reviewRequired: false, outcome: 'COMPLETED' },
  { name: 'AWARDED with no applicable period', receipt: { status: 'AWARDED', awards: 0 }, processed: 1, deferred: 0, reviewRequired: false, outcome: 'COMPLETED' },
  { name: 'ACKNOWLEDGED_DISABLED', receipt: { status: 'ACKNOWLEDGED_DISABLED', awards: 0 }, processed: 1, deferred: 0, reviewRequired: false, outcome: 'COMPLETED' },
  { name: 'PLANNED', receipt: { status: 'PLANNED' }, processed: 1, deferred: 0, reviewRequired: false, outcome: 'COMPLETED' },
  { name: 'REFRESHED', receipt: { status: 'REFRESHED' }, processed: 1, deferred: 0, reviewRequired: false, outcome: 'COMPLETED' },
  { name: 'NO_SOURCE', receipt: { status: 'NO_SOURCE' }, processed: 1, deferred: 0, reviewRequired: false, outcome: 'COMPLETED' },
  { name: 'SUPERSEDED', receipt: { status: 'SUPERSEDED' }, processed: 1, deferred: 0, reviewRequired: false, outcome: 'COMPLETED' },
  { name: 'WAITING', receipt: { status: 'WAITING' }, processed: 0, deferred: 1, reviewRequired: false, outcome: 'WAITING' },
  { name: 'REQUIRES_REVIEW', receipt: { status: 'REQUIRES_REVIEW' }, processed: 0, deferred: 0, reviewRequired: true, outcome: 'REQUIRES_REVIEW' },
];
const malformedRows: { name: string; rows: WorkerRow[] }[] = [
  { name: 'no row', rows: [] },
  { name: 'null row', rows: [null] as unknown as WorkerRow[] },
  { name: 'array row', rows: [[]] as unknown as WorkerRow[] },
  { name: 'two rows', rows: [{ process_learner_event: { status: 'ACKNOWLEDGED' } }, { process_learner_event: { status: 'ACKNOWLEDGED' } }] },
  { name: 'missing column', rows: [{}] },
  { name: 'wrong column', rows: [{ receipt: true }] },
  { name: 'extra row column', rows: [{ process_learner_event: { status: 'ACKNOWLEDGED' }, privateContent: 'sensitive fixture sentinel' }] },
  ...[
    ['null', null], ['boolean', true], ['array', []], ['string', 'PROCESSED'], ['empty object', {}],
    ['unknown status', { status: 'NOT_CONFIRMED' }], ['non-string status', { status: 1 }],
    ['missing learner', { status: 'PROCESSED' }], ['null learner', { status: 'PROCESSED', learnerId: null }],
    ['invalid learner UUID', { status: 'PROCESSED', learnerId: 'not-a-uuid' }],
    ['missing awards', { status: 'AWARDED' }], ['negative awards', { status: 'AWARDED', awards: -1 }],
    ['fractional awards', { status: 'AWARDED', awards: 1.5 }], ['string awards', { status: 'AWARDED', awards: '1' }],
    ['null awards', { status: 'AWARDED', awards: null }], ['nonfinite awards', { status: 'AWARDED', awards: Infinity }],
    ['unsafe awards', { status: 'AWARDED', awards: Number.MAX_SAFE_INTEGER + 1 }],
    ['disabled without awards', { status: 'ACKNOWLEDGED_DISABLED' }], ['disabled nonzero awards', { status: 'ACKNOWLEDGED_DISABLED', awards: 1 }],
    ['extra receipt content', { status: 'ACKNOWLEDGED', privateContent: 'sensitive fixture sentinel' }],
    ['extra learner field', { status: 'PROCESSED', learnerId, awards: 1 }],
    ['extra award field', { status: 'AWARDED', awards: 1, learnerId }],
    ['extra waiting field', { status: 'WAITING', awards: 0 }],
    ['extra review field', { status: 'REQUIRES_REVIEW', privateContent: 'sensitive fixture sentinel' }],
  ].map(([name, receipt]) => ({ name: String(name), rows: [{ process_learner_event: receipt }] })),
];

function sourcePort(rows: WorkerRow[]) {
  const calls: { sql: string; values?: unknown[] }[] = [];
  const query: WorkerQueryPort['query'] = async (sql, values) => {
    calls.push({ sql, values });
    if (sql.includes('claim_outbox')) return { rows: [event] };
    if (sql.includes('process_learner_event')) return { rows };
    throw new Error('Unexpected source mutation.');
  };
  return { query, calls };
}

describe('canonical private processing receipt boundary', () => {
  it.each([
    { status: 'PROCESSED', learnerId: '00000000-0000-0000-0000-000000000000' },
    { status: 'PROCESSED', learnerId: 'ABCDEF12-1234-1234-1234-ABCDEF123456' },
  ])('accepts canonical PostgreSQL UUID text without imposing an unsupported UUID version rule', async receipt => {
    const result = await new OutboxProcessor(sourcePort([{ process_learner_event: receipt }])).process({ maxEvents: 1, deadline: 20_000, now: () => 0 });
    expect(result).toMatchObject({ processed: 1, processingReceiptUnknown: false });
  });
  it.each(validReceipts)('preserves the canonical $name receipt without rewriting source state', async ({ receipt, processed, deferred, reviewRequired, outcome }) => {
    const port = sourcePort([{ process_learner_event: receipt }]); const metrics: DeliveryMetric[] = [];
    const result = await new OutboxProcessor(port, metric => metrics.push(metric)).process({ maxEvents: 1, deadline: 20_000, now: () => 0 });
    expect(result).toMatchObject({ processed, attempted: 1, deferred, reviewRequired, failureReceiptUnknown: false, processingReceiptUnknown: false });
    expect(metrics).toEqual([{ outcome, durationMs: 0 }]);
    expect(port.calls.map(call => call.values)).toEqual([[1, 30], [event.id, event.lease_token]]);
  });
  it.each(malformedRows)('stops at a resolved $name receipt without claiming another source or blindly failing a possibly committed event', async ({ rows }) => {
    const port = sourcePort(rows); const metrics: DeliveryMetric[] = [];
    const result = await new OutboxProcessor(port, metric => metrics.push(metric)).process({ maxEvents: 10, deadline: 20_000, now: () => 0 });
    expect(result).toMatchObject({ processed: 0, attempted: 1, deferred: 0, reviewRequired: true, processingReceiptUnknown: true, failureReceiptUnknown: false, executionUnavailable: false });
    expect(metrics).toEqual([{ outcome: 'PROCESSING_RECEIPT_UNKNOWN', durationMs: 0 }]);
    expect(port.calls.map(call => call.values)).toEqual([[1, 30], [event.id, event.lease_token]]);
    expect(JSON.stringify({ result, metrics, calls: port.calls })).not.toContain('sensitive fixture sentinel');
  });
  it.each(validReceipts)('tick preserves the canonical $name outcome through the same boundary', async ({ receipt, outcome }) => {
    const port = sourcePort([{ process_learner_event: receipt }]); const metrics: DeliveryMetric[] = [];
    await new OutboxProcessor(port, metric => metrics.push(metric)).tick();
    expect(metrics.map(metric => metric.outcome)).toEqual([outcome]);
    expect(port.calls.map(call => call.values)).toEqual([[10, 30], [event.id, event.lease_token]]);
  });
  it.each(malformedRows)('tick leaves the already claimed tail untouched after a resolved $name receipt', async ({ rows }) => {
    const calls: { sql: string; values?: unknown[] }[] = []; const metrics: DeliveryMetric[] = [];
    const query: WorkerQueryPort['query'] = async (sql, values) => {
      calls.push({ sql, values });
      if (sql.includes('claim_outbox')) return { rows: [event, { id: 'tail-event', lease_token: 'tail-lease' }] };
      if (sql.includes('process_learner_event')) return { rows };
      throw new Error('Unexpected source mutation.');
    };
    await new OutboxProcessor({ query }, metric => metrics.push(metric)).tick();
    expect(metrics.map(metric => metric.outcome)).toEqual(['PROCESSING_RECEIPT_UNKNOWN']);
    expect(calls.map(call => call.values)).toEqual([[10, 30], [event.id, event.lease_token]]);
  });
  it('retains confirmed earlier processing while stopping at the next unknown receipt', async () => {
    let claims = 0; let processing = 0; const calls: string[] = [];
    const query: WorkerQueryPort['query'] = async sql => {
      calls.push(sql);
      if (sql.includes('claim_outbox')) { claims++; return { rows: [event] }; }
      if (sql.includes('process_learner_event')) return { rows: ++processing === 1 ? [{ process_learner_event: { status: 'ACKNOWLEDGED' } }] : [] };
      throw new Error('Unexpected source mutation.');
    };
    const result = await new OutboxProcessor({ query }).process({ maxEvents: 10, deadline: 20_000, now: () => 0 });
    expect(result).toMatchObject({ processed: 1, attempted: 2, processingReceiptUnknown: true, reviewRequired: true });
    expect(claims).toBe(2); expect(calls).toHaveLength(4);
  });
  it.each([undefined, null, {}, { rows: null }, { rows: {} }])('a resolved malformed query envelope preserves unknown commitment without invoking failure SQL', async reply => {
    for (const mode of ['process', 'tick'] as const) {
      const calls: { sql: string; values?: unknown[] }[] = []; const metrics: DeliveryMetric[] = [];
      const query: WorkerQueryPort['query'] = async (sql, values) => {
        calls.push({ sql, values });
        if (sql.includes('claim_outbox')) return { rows: [event] };
        if (sql.includes('process_learner_event')) return reply as Awaited<ReturnType<WorkerQueryPort['query']>>;
        throw new Error('Unexpected source mutation.');
      };
      const processor = new OutboxProcessor({ query }, metric => metrics.push(metric));
      if (mode === 'process') expect(await processor.process({ maxEvents: 10, deadline: 20_000, now: () => 0 })).toMatchObject({ processingReceiptUnknown: true, failureReceiptUnknown: false, processed: 0, attempted: 1 });
      else await processor.tick();
      expect(metrics.map(metric => metric.outcome)).toEqual(['PROCESSING_RECEIPT_UNKNOWN']);
      expect(calls).toHaveLength(2); expect(calls[1].values).toEqual([event.id, event.lease_token]);
    }
  });
  it('a rejected processing query keeps the original event/lease and fixed failure backoff', async () => {
    const calls: { sql: string; values?: unknown[] }[] = []; const metrics: DeliveryMetric[] = [];
    const query: WorkerQueryPort['query'] = async (sql, values) => {
      calls.push({ sql, values });
      if (sql.includes('claim_outbox')) return { rows: [event] };
      if (sql.includes('process_learner_event')) throw new Error('sensitive fixture sentinel');
      if (sql.includes('fail_outbox')) return { rows: [{ acknowledged: true }] };
      throw new Error('Unexpected query.');
    };
    const result = await new OutboxProcessor({ query }, metric => metrics.push(metric)).process({ maxEvents: 1, deadline: 20_000, now: () => 0 });
    expect(result).toMatchObject({ processed: 0, attempted: 1, reviewRequired: true, failureReceiptUnknown: false, processingReceiptUnknown: false });
    expect(calls.map(call => call.values)).toEqual([[1, 30], [event.id, event.lease_token], [event.id, event.lease_token, 'PROCESSING_REQUIRES_REVIEW', 30]]);
    expect(metrics).toEqual([{ outcome: 'REQUIRES_REVIEW', durationMs: 0 }]);
    expect(JSON.stringify({ result, metrics, calls })).not.toContain('sensitive fixture sentinel');
  });
});
