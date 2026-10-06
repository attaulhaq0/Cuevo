import { describe, expect, it } from 'vitest';
import { collectScaleRequest, finalizeScaleFixture, settleScaleCase, type RequestMeasurement, type ScaleResponse } from '../integration/customer-scale-measurement';

const validBody = '{"items":[{},{}]}';
function response(statusCode = 200, body = validBody): ScaleResponse { return { statusCode, body, json: () => JSON.parse(body) }; }
function workload(failure?: { sample: number; response?: ScaleResponse; error?: unknown }, durationMs = 100) {
  let clock = 0; let calls = 0; const records: RequestMeasurement[] = [];
  const run = () => collectScaleRequest({ operation: 'bounded_page', now: () => clock, record: value => { records.push(value); }, request: async () => {
    calls++; clock += durationMs;
    if (calls === failure?.sample) { if ('error' in failure) throw failure.error; return failure.response!; }
    return response();
  } });
  return { run, records, calls: () => calls };
}

describe('actual scale request collector', () => {
  it.each([
    { name: 'HTTP 503', failed: response(503, 'failed'), statusCode: 503, payloadBytes: 6 },
    { name: 'malformed JSON', failed: response(200, '{'), statusCode: 200, payloadBytes: 1 },
    { name: 'oversized payload', failed: response(200, JSON.stringify({ items: [], padding: 'x'.repeat(500000) })), statusCode: 200, payloadBytes: 500025 },
  ])('does not count a seventh $name response as successfully asserted', async ({ failed, statusCode, payloadBytes }) => {
    const test = workload({ sample: 7, response: failed });
    await expect(test.run()).rejects.toBeDefined();
    expect(test.calls()).toBe(7); expect(test.records).toHaveLength(1);
    expect(test.records[0]).toMatchObject({ attemptedSamples: 7, responseSamples: 7, completedAndAsserted: 6, samples: 6, complete: false,
      medianMs: 100, p95Ms: 100, maxPayloadBytes: 17, rows: 2,
      lastFailedSample: { sampleNumber: 7, elapsedMs: 100, stage: 'RESPONSE_ASSERTIONS', statusCode, payloadBytes } });
  });

  it('retains the seventh collector invocation and timing when its request rejects', async () => {
    const original = new Error('request refused'); const test = workload({ sample: 7, error: original });
    await expect(test.run()).rejects.toBe(original);
    expect(test.records[0]).toMatchObject({ attemptedSamples: 7, responseSamples: 6, completedAndAsserted: 6, samples: 6, complete: false,
      lastFailedSample: { sampleNumber: 7, elapsedMs: 100, stage: 'REQUEST', statusCode: null, payloadBytes: null } });
  });

  it('preserves an original JSON parser error alongside the failed response metadata', async () => {
    const original = new Error('invalid JSON'); const failed = { statusCode: 200, body: '{', json: () => { throw original; } };
    const test = workload({ sample: 7, response: failed });
    await expect(test.run()).rejects.toBe(original);
    expect(test.records[0].lastFailedSample).toEqual({ sampleNumber: 7, elapsedMs: 100, stage: 'RESPONSE_ASSERTIONS', statusCode: 200, payloadBytes: 1 });
  });

  it('keeps successful percentiles, payload and row count unknown when the first request rejects', async () => {
    const original = new Error('first request refused'); const test = workload({ sample: 1, error: original });
    await expect(test.run()).rejects.toBe(original);
    expect(test.records[0]).toMatchObject({ attemptedSamples: 1, responseSamples: 0, completedAndAsserted: 0, samples: 0, complete: false,
      medianMs: null, p95Ms: null, maxPayloadBytes: null, rows: null, budgetPassed: null,
      lastFailedSample: { sampleNumber: 1, elapsedMs: 100, stage: 'REQUEST', statusCode: null, payloadBytes: null } });
  });

  it.each([5000, 6000])('separates all-valid completion from a failed %ims p95 budget', async durationMs => {
    const test = workload(undefined, durationMs); const value = await test.run();
    expect(value).toMatchObject({ kind: 'REQUEST', attemptedSamples: 7, responseSamples: 7, completedAndAsserted: 7,
      samples: 7, complete: true, budgetPassed: false, medianMs: durationMs, p95Ms: durationMs, lastFailedSample: null });
    expect(test.records).toEqual([value]);
  });

  it('records a complete valid request workload separately from setup or worker timing', async () => {
    const test = workload(); const value = await test.run();
    expect(value).toMatchObject({ kind: 'REQUEST', attemptedSamples: 7, responseSamples: 7, completedAndAsserted: 7,
      complete: true, budgetPassed: true, maxPayloadBytes: 17, rows: 2, lastFailedSample: null });
  });
});

describe('actual scale case cleanup accounting', () => {
  it('counts a pass only after scope settlement and savepoint release', async () => {
    const order: string[] = [];
    await settleScaleCase({ passed: true, cleanup: [() => { order.push('settle'); }, () => { order.push('release'); }],
      recordPassed: () => { order.push('passed'); }, recordFailed: () => { order.push('failed'); } });
    expect(order).toEqual(['settle', 'release', 'passed']);
  });

  it('never counts a pass when savepoint release fails', async () => {
    const original = new Error('release failed'); let passed = 0; let failed = 0;
    await expect(settleScaleCase({ passed: true, cleanup: [() => { throw original; }],
      recordPassed: () => { passed++; }, recordFailed: () => { failed++; } })).rejects.toBe(original);
    expect({ passed, failed }).toEqual({ passed: 0, failed: 1 });
  });

  it('attempts rollback and release after settlement fails and retains every cleanup error', async () => {
    const settle = new Error('settle'); const rollback = new Error('rollback'); const order: string[] = []; let failed = 0;
    const result = settleScaleCase({ passed: false, cleanup: [() => { order.push('settle'); throw settle; },
      () => { order.push('rollback'); throw rollback; }, () => { order.push('release'); }],
      recordPassed: () => { order.push('passed'); }, recordFailed: () => { failed++; } });
    await expect(result).rejects.toMatchObject({ errors: [settle, rollback], cause: settle });
    expect(order).toEqual(['settle', 'rollback', 'release']); expect(failed).toBe(1);
  });
});

describe('actual scale artifact finalization', () => {
  async function validMeasurements() { const test = workload(); await test.run(); return test.records; }

  it('captures fixture counts before closing and publishes VERIFIED only after successful teardown', async () => {
    const order: string[] = []; const measurements = await validMeasurements();
    const receipt = await finalizeScaleFixture({ setupComplete: true, passedCases: 4, failedCases: 0, measurements,
      prepare: [() => { order.push('settle'); }, () => { order.push('reset'); }],
      captureFixture: async () => { order.push('counts'); return { students: 500 }; }, cleanup: [() => { order.push('close'); }],
      writeArtifact: async value => { order.push('write'); expect(value).toMatchObject({ status: 'VERIFIED', fixtureCaptured: true, teardownComplete: true }); } });
    expect(order).toEqual(['settle', 'reset', 'counts', 'close', 'write']); expect(receipt.actualFixture).toEqual({ students: 500 });
  });

  it('publishes FAILED after a close error and preserves the original failure', async () => {
    const original = new Error('close'); const receipts: unknown[] = [];
    await expect(finalizeScaleFixture({ setupComplete: true, passedCases: 4, failedCases: 0, measurements: await validMeasurements(),
      prepare: [], captureFixture: async () => ({ students: 500 }), cleanup: [() => { throw original; }],
      writeArtifact: async value => { receipts.push(value); } })).rejects.toBe(original);
    expect(receipts).toEqual([{ status: 'FAILED', actualFixture: { students: 500 }, fixtureCaptured: true, teardownComplete: false }]);
  });

  it('attempts all preparation and cleanup steps before recording failed capture', async () => {
    const original = new Error('setup wait'); const order: string[] = [];
    await expect(finalizeScaleFixture({ setupComplete: true, passedCases: 4, failedCases: 0, measurements: await validMeasurements(),
      prepare: [() => { order.push('setup wait'); throw original; }, () => { order.push('case wait'); }, () => { order.push('reset'); }],
      captureFixture: async () => { order.push('counts'); return {}; }, cleanup: [() => { order.push('close'); }, () => { order.push('owner end'); }],
      writeArtifact: async value => { order.push('write'); expect(value).toMatchObject({ status: 'FAILED', fixtureCaptured: false, actualFixture: null, teardownComplete: true }); } })).rejects.toBe(original);
    expect(order).toEqual(['setup wait', 'case wait', 'reset', 'close', 'owner end', 'write']);
  });

  it('retains capture, cleanup and final-write errors rather than replacing the source failure', async () => {
    const primary = new Error('counts'); const close = new Error('close'); const write = new Error('write'); const order: string[] = [];
    let caught: unknown;
    try { await finalizeScaleFixture({ setupComplete: true, passedCases: 4, failedCases: 0, measurements: await validMeasurements(),
      prepare: [], captureFixture: async () => { throw primary; }, cleanup: [() => { order.push('close'); throw close; }, () => { order.push('end'); }],
      writeArtifact: async value => { order.push('write'); expect(value.status).toBe('FAILED'); throw write; } }); } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(AggregateError);
    const errors = (caught as AggregateError).errors.flatMap(error => error instanceof AggregateError ? error.errors : [error]);
    expect(errors).toEqual([primary, close, write]); expect(order).toEqual(['close', 'end', 'write']);
  });

  it.each(['setup', 'cases', 'measurement', 'budget', 'fixture'] as const)('refuses VERIFIED when %s evidence is incomplete', async missing => {
    const measurements = missing === 'measurement' ? [] : await validMeasurements();
    if (missing === 'budget') { const slow = workload(undefined, 6000); await slow.run(); measurements.splice(0, measurements.length, ...slow.records); }
    const receipt = await finalizeScaleFixture({ setupComplete: missing !== 'setup', passedCases: missing === 'cases' ? 3 : 4, failedCases: 0,
      measurements, prepare: [], captureFixture: async () => missing === 'fixture' ? null : { students: 500 }, cleanup: [], writeArtifact: async () => undefined });
    expect(receipt.status).not.toBe('VERIFIED'); expect(receipt.teardownComplete).toBe(true);
  });
});
