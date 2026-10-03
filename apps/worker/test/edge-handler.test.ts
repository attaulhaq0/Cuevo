import { describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { createWorkerHandler } from '../src/jobs/outbox/edge-handler';
import type { WorkerConnection } from '../src/jobs/outbox/edge-handler';

const secret = 'a'.repeat(64);
const wakeId = '10000000-0000-4000-8000-000000000001';
const config = { purposeKey: secret, databaseUrl: 'postgresql://cuevo_worker:synthetic@localhost:56322/postgres' };
const signature = (timestamp: string, id = wakeId, key = secret) => createHmac('sha256', key).update(`cuevo.worker.wake.v1\n${timestamp}\n${id}`).digest('hex');
const signedHeaders = (timestamp = String(Math.floor(Date.now() / 1000)), id = wakeId, key = secret) => ({ 'Content-Type': 'application/json', 'X-Cuevo-Wake-Time': timestamp, 'X-Cuevo-Wake-Signature': signature(timestamp, id, key) });
const request = (body: unknown = { version: 1, wakeId }, key = secret) => new Request('https://worker.test', { method: 'POST', headers: signedHeaders(undefined, wakeId, key), body: typeof body === 'string' ? body : JSON.stringify(body) });
function connection(options: { admitted?: boolean; health?: boolean; processingFailure?: boolean; finishFailure?: boolean; finishDenied?: boolean; claimFailure?: boolean; retryUnknown?: boolean; closeFailure?: boolean } = {}) {
  let claimed = false;
  const query = vi.fn(async (sql: string): Promise<{ rows: Record<string, unknown>[] }> => {
    if (sql.includes('worker_health')) return { rows: [{ health: { ready: options.health ?? true } }] };
    if (sql.includes('begin_worker_wake')) return { rows: [{ wake: options.admitted ?? true }] };
    if (sql.includes('claim_outbox')) { if (options.claimFailure) throw new Error('private database password'); if (claimed) return { rows: [] }; claimed = true; return { rows: [{ id: 'event', lease_token: 'lease' }] }; }
    if (sql.includes('process_learner_event') && options.processingFailure) throw new Error('private pupil answer');
    if (sql.includes('fail_outbox')) return { rows: [{ acknowledged: !options.retryUnknown }] };
    if (sql.includes('finish_worker_wake') && options.finishFailure) throw new Error('private wake credential');
    return { rows: [{ receipt: !options.finishDenied }] };
  });
  const close = vi.fn(async () => { if (options.closeFailure) throw new Error('private connection'); });
  return { query, close } as unknown as WorkerConnection & { query: typeof query; close: typeof close };
}

describe('authenticated bounded Edge worker', () => {
  it('analytics-only work records confirmed acceptance in the wake receipt after domain drain', async () => {
    const live = { mode: 'LIVE_SYNTHETIC' as const, projectId: 393668 as const, host: 'https://us.i.posthog.com' as const, projectKey: 'capture-test-only', pseudonymKey: secret, keyVersion: 1, environment: 'QA' as const };
    const db = connection(); let analyticsClaimed = false; const normal = db.query.getMockImplementation()!;
    db.query.mockImplementation(async sql => {
      if (sql.includes('claim_outbox')) return { rows: [] };
      if (sql.includes('claim_posthog_delivery')) { if (analyticsClaimed) return { rows: [] }; analyticsClaimed = true; return { rows: [{ id: wakeId, school_id: wakeId, actor_id: wakeId, type: 'activity.complete', occurred_at: '2026-10-02T18:30:00Z', lease_token: wakeId, environment: 'QA', key_version: 1, actor_role: 'student', diagnostics: null }] }; }
      if (sql.includes('posthog_delivery_allowed')) return { rows: [{ allowed: true }] };
      if (sql.includes('accept_posthog_delivery')) return { rows: [{ acknowledged: true }] };
      return normal(sql);
    });
    const response = await createWorkerHandler({ ...config, analytics: live }, async () => db, Date.now, async () => 'ACCEPTED')(request());
    expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ processed: 0, analyticsAccepted: 1 });
    const calls = db.query.mock.calls as unknown as [string, unknown[]][];
    expect(calls.find(([sql]) => sql.includes('finish_worker_wake'))?.[1]).toEqual([wakeId, 'COMPLETED', 1]);
  });
  it('domain work consuming the bounded reserve leaves analytics for durable continuation', async () => {
    const live = { mode: 'LIVE_SYNTHETIC' as const, projectId: 393668 as const, host: 'https://us.i.posthog.com' as const, projectKey: 'capture-test-only', pseudonymKey: secret, keyVersion: 1, environment: 'QA' as const };
    const db = connection(); let time = Date.now(); const normal = db.query.getMockImplementation()!;
    db.query.mockImplementation(async sql => { if (sql.includes('process_learner_event')) time += 8000; return normal(sql); });
    const response = await createWorkerHandler({ ...config, analytics: live }, async () => db, () => time, async () => 'ACCEPTED')(request());
    expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ processed: 1, analyticsAccepted: 0 });
    expect(db.query.mock.calls.some(([sql]) => sql.includes('claim_posthog_delivery'))).toBe(false);
  });
  it('disabled capture keeps the existing handler response and executes no analytics SQL', async () => {
    const db = connection(); const response = await createWorkerHandler({ ...config, analytics: { mode: 'DISABLED' } }, async () => db)(request());
    expect(await response.json()).toEqual({ status: 'COMPLETED', processed: 1 });
    expect(db.query.mock.calls.some(([sql]) => sql.includes('posthog'))).toBe(false);
  });
  it('domain-bearing wake delivers at most one analytics source before returning deterministic continuation', async () => {
    const live = { mode: 'LIVE_SYNTHETIC' as const, projectId: 393668 as const, host: 'https://us.i.posthog.com' as const, projectKey: 'capture-test-only', pseudonymKey: secret, keyVersion: 1, environment: 'QA' as const };
    const db = connection(); const normal = db.query.getMockImplementation()!; let claims = 0; let captures = 0;
    db.query.mockImplementation(async sql => {
      if (sql.includes('claim_posthog_delivery')) { claims++; return { rows: [{ id: wakeId, school_id: wakeId, actor_id: wakeId, type: 'activity.complete', occurred_at: '2026-10-02T18:30:00Z', lease_token: wakeId, environment: 'QA', key_version: 1, actor_role: 'student', diagnostics: null }] }; }
      if (sql.includes('posthog_delivery_allowed')) return { rows: [{ allowed: true }] };
      if (sql.includes('accept_posthog_delivery')) return { rows: [{ acknowledged: true }] };
      return normal(sql);
    });
    const response = await createWorkerHandler({ ...config, analytics: live }, async () => db, Date.now, async () => { captures++; return 'ACCEPTED'; })(request());
    expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ processed: 1, analyticsAccepted: 1 }); expect(claims).toBe(1); expect(captures).toBe(1);
  });
  it.each([
    [{ health: false }, 'HEALTH'], [{ claimFailure: true }, 'DOMAIN'], [{ finishFailure: true }, 'FINISH'], [{ finishDenied: true }, 'FINISH'], [{ closeFailure: true }, 'CLOSE'],
  ] as const)('machine failure identifies a fixed phase without exposing private context', async (options, failurePhase) => {
    const response = await createWorkerHandler(config, async () => connection(options))(request());
    expect(response.status).toBe(503); expect(await response.json()).toEqual({ code: 'WORKER_UNAVAILABLE', failurePhase });
  });
  it('connection failure exposes only the fixed connection phase', async () => {
    const response = await createWorkerHandler(config, async () => { throw new Error('private postgres credential'); })(request());
    expect(await response.json()).toEqual({ code: 'WORKER_UNAVAILABLE', failurePhase: 'CONNECTION' });
  });
  it('missing admission receipt exposes only the fixed admission phase', async () => {
    const db = connection(); const normal = db.query.getMockImplementation()!;
    db.query.mockImplementation(async sql => sql.includes('begin_worker_wake') ? { rows: [] } : normal(sql));
    const response = await createWorkerHandler(config, async () => db)(request());
    expect(await response.json()).toEqual({ code: 'WORKER_UNAVAILABLE', failurePhase: 'ADMISSION' });
  });
  it.each([
    [new Request('https://worker.test', { method: 'GET' }), 405],
    [request(undefined, 'b'.repeat(64)), 401],
    [request({ version: 1, wakeId, learnerId: wakeId }), 400],
    [request({ version: 1, wakeId: 'unknown' }), 400],
    [request('x'.repeat(513)), 400],
    [request({ version: 2, wakeId }), 400],
    [new Request('https://worker.test', { method: 'POST', headers: { ...signedHeaders(), 'Content-Type': 'text/plain' }, body: JSON.stringify({ version: 1, wakeId }) }), 400],
    [new Request('https://worker.test', { method: 'POST', headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ version: 1, wakeId }) }), 401],
  ])('rejects unsafe invocation before opening a database connection', async (input, status) => {
    const factory = vi.fn(async () => connection());
    const response = await createWorkerHandler(config, factory)(input as Request);
    expect(response.status).toBe(status); expect(factory).not.toHaveBeenCalled();
  });
  it('duplicate or inactive wake returns accepted without claims or processing and closes the connection', async () => {
    const db = connection({ admitted: false }); const factory = vi.fn(async () => db);
    const response = await createWorkerHandler(config, factory)(request());
    expect(response.status).toBe(202); expect(await response.json()).toMatchObject({ status: 'NOT_ADMITTED' });
    expect(db.query.mock.calls.some(([sql]) => sql.includes('claim_outbox') || sql.includes('finish_worker_wake'))).toBe(false);
    expect(db.close).toHaveBeenCalledOnce();
  });
  it('requires actual restricted worker health before wake admission', async () => {
    const db = connection({ health: false }); const response = await createWorkerHandler(config, async () => db)(request());
    expect(response.status).toBe(503); expect(db.query.mock.calls.some(([sql]) => sql.includes('begin_worker_wake'))).toBe(false); expect(db.close).toHaveBeenCalledOnce();
  });
  it('processes admitted source leases one at a time and records completion before closing', async () => {
    const db = connection(); const response = await createWorkerHandler(config, async () => db)(request());
    expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ status: 'COMPLETED', processed: 1 });
    const calls = db.query.mock.calls as unknown as [string, unknown[]][];
    expect(calls.filter(([sql]) => sql.includes('claim_outbox')).every(([, values]) => values[0] === 1 && values[1] === 30)).toBe(true);
    expect(calls.find(([sql]) => sql.includes('finish_worker_wake'))?.[1]).toEqual([wakeId, 'COMPLETED', 1]);
    expect(db.close).toHaveBeenCalledOnce();
  });
  it('sanitizes process failure, records retry and finishes review without raw data', async () => {
    const db = connection({ processingFailure: true }); const response = await createWorkerHandler(config, async () => db)(request());
    expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ status: 'REQUIRES_REVIEW', processed: 0 });
    const calls = db.query.mock.calls as unknown as [string, unknown[]][];
    expect(calls.find(([sql]) => sql.includes('fail_outbox'))?.[1]).toEqual(['event', 'lease', 'PROCESSING_REQUIRES_REVIEW', 30]);
    expect(calls.find(([sql]) => sql.includes('finish_worker_wake'))?.[1]).toEqual([wakeId, 'REQUIRES_REVIEW', 0]);
    expect(JSON.stringify(calls)).not.toContain('private pupil answer'); expect(db.close).toHaveBeenCalledOnce();
  });
  it('admitted claim failure still attempts wake finish and cleanup', async () => {
    const db = connection({ claimFailure: true }); const response = await createWorkerHandler(config, async () => db)(request());
    expect(response.status).toBe(503); expect(await response.text()).not.toContain('password');
    expect(db.query.mock.calls.some(([sql]) => sql.includes('finish_worker_wake'))).toBe(true); expect(db.close).toHaveBeenCalledOnce();
  });
  it('unknown finish outcome returns unavailable and cleanup still runs once', async () => {
    const db = connection({ finishFailure: true }); const response = await createWorkerHandler(config, async () => db)(request());
    expect(response.status).toBe(503); expect(await response.text()).not.toContain('credential'); expect(db.close).toHaveBeenCalledOnce();
  });
  it('false finish acknowledgement cannot be presented as a completed wake', async () => {
    const db = connection({ finishDenied: true }); const response = await createWorkerHandler(config, async () => db)(request());
    expect(response.status).toBe(503); expect(db.close).toHaveBeenCalledOnce();
  });
  it('unknown retry acknowledgement is preserved in the wake result', async () => {
    const db = connection({ processingFailure: true, retryUnknown: true }); const response = await createWorkerHandler(config, async () => db)(request());
    expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ status: 'FAILURE_RECEIPT_UNKNOWN', processed: 0 });
    const calls = db.query.mock.calls as unknown as [string, unknown[]][];
    expect(calls.find(([sql]) => sql.includes('finish_worker_wake'))?.[1]).toEqual([wakeId, 'FAILURE_RECEIPT_UNKNOWN', 0]);
  });
  it('factory failure is sanitized and never exposes its connection credential', async () => {
    const response = await createWorkerHandler(config, async () => { throw new Error('private connection password'); })(request());
    expect(response.status).toBe(503); expect(await response.text()).not.toContain('password');
  });
  it('close failure remains unavailable after a durable finish attempt', async () => {
    const db = connection({ closeFailure: true }); const response = await createWorkerHandler(config, async () => db)(request());
    expect(response.status).toBe(503); expect(db.query.mock.calls.some(([sql]) => sql.includes('finish_worker_wake'))).toBe(true); expect(db.close).toHaveBeenCalledOnce();
  });
  it('an interrupted request body returns invalid without connecting or exposing stream failure', async () => {
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.error(new Error('private network details')); } });
    const input = new Request('https://worker.test', { method: 'POST', headers: signedHeaders(), body, duplex: 'half' } as RequestInit);
    const factory = vi.fn(async () => connection()); const response = await createWorkerHandler(config, factory)(input);
    expect(response.status).toBe(400); expect(factory).not.toHaveBeenCalled(); expect(await response.text()).not.toContain('private');
  });
  it('a failed next claim retains the already processed count in the final receipt', async () => {
    const db = connection(); let claims = 0;
    const normal = db.query.getMockImplementation()!;
    db.query.mockImplementation(async sql => {
      if (sql.includes('claim_outbox') && ++claims === 2) throw new Error('private transport detail');
      return normal(sql);
    });
    const response = await createWorkerHandler(config, async () => db)(request());
    expect(response.status).toBe(503);
    const calls = db.query.mock.calls as unknown as [string, unknown[]][];
    expect(calls.find(([sql]) => sql.includes('finish_worker_wake'))?.[1]).toEqual([wakeId, 'REQUIRES_REVIEW', 1]);
    expect(db.close).toHaveBeenCalledOnce();
  });
  it('missing wake admission receipt is unavailable rather than a duplicate success', async () => {
    const db = connection(); const normal = db.query.getMockImplementation()!;
    db.query.mockImplementation(async sql => sql.includes('begin_worker_wake') ? { rows: [] } : normal(sql));
    const response = await createWorkerHandler(config, async () => db)(request());
    expect(response.status).toBe(503); expect(db.close).toHaveBeenCalledOnce();
  });
  it.each([
    [String(1790950000 - 61), wakeId, undefined],
    [String(1790950000 + 61), wakeId, undefined],
    [String(1790950000), '10000000-0000-4000-8000-000000000002', undefined],
    ['001790000000', wakeId, undefined],
    [String(1790950000), wakeId, 'f'.repeat(64)],
  ])('denies expired, future or changed signed wake content before connecting', async (timestamp, signedId, forged) => {
    const input = new Request('https://worker.test', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Cuevo-Wake-Time': timestamp, 'X-Cuevo-Wake-Signature': forged ?? signature(timestamp, signedId) }, body: JSON.stringify({ version: 1, wakeId }) });
    const factory = vi.fn(async () => connection()); const response = await createWorkerHandler(config, factory, () => 1790950000000)(input);
    expect(response.status).toBe(401); expect(factory).not.toHaveBeenCalled();
  });
  it('signature is single-wake and carries no reusable purpose credential', async () => {
    const input = request(); expect(input.headers.get('authorization')).toBeNull(); expect(JSON.stringify([...input.headers])).not.toContain(secret);
    const response = await createWorkerHandler(config, async () => connection())(input); expect(response.status).toBe(200);
  });
  it('times out an unfinished bounded body before connecting', async () => {
    vi.useFakeTimers();
    try {
      let cancelled = false;
      const stream = new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } });
      const input = new Request('https://worker.test', { method: 'POST', headers: signedHeaders(), body: stream, duplex: 'half' } as RequestInit);
      const factory = vi.fn(async () => connection()); const pending = createWorkerHandler(config, factory)(input);
      await vi.advanceTimersByTimeAsync(3001); const response = await pending;
      expect(response.status).toBe(400); expect(factory).not.toHaveBeenCalled(); expect(cancelled).toBe(true);
    } finally { vi.useRealTimers(); }
  });
});
