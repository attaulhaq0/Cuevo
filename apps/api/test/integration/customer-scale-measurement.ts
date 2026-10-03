import { withFixtureCleanup } from './fixture-cleanup';

export type ScaleResponse = { statusCode: number; body: string; json(): unknown };
export type RequestMeasurement = {
  kind: 'REQUEST'; operation: string; expectedSamples: number; attemptedSamples: number;
  responseSamples: number; completedAndAsserted: number; samples: number; complete: boolean;
  budgetPassed: boolean | null; medianMs: number | null; p95Ms: number | null;
  maxPayloadBytes: number | null; rows: number | null;
  lastFailedSample: { sampleNumber: number; elapsedMs: number; stage: 'REQUEST' | 'RESPONSE_ASSERTIONS'; statusCode: number | null; payloadBytes: number | null } | null;
};
export type AuxiliaryMeasurement = { kind: 'SETUP' | 'WORKER_DRAIN'; operation: string; samples: number; medianMs: number | null; p95Ms: number | null; maxPayloadBytes: number; rows: number };
export type ScaleMeasurement = RequestMeasurement | AuxiliaryMeasurement;

/** Attempt counts mean collector invocations, not independent proof of network or SQL sends. */
export async function collectScaleRequest(options: {
  operation: string; repeats?: number; request: () => Promise<ScaleResponse>; now: () => number;
  record: (measurement: RequestMeasurement) => void;
}): Promise<RequestMeasurement> {
  const repeats = options.repeats ?? 7;
  const times: number[] = [];
  let attemptedSamples = 0; let responseSamples = 0;
  let maxPayloadBytes: number | null = null; let rows: number | null = null;
  let lastFailedSample: RequestMeasurement['lastFailedSample'] = null;
  let measurement!: RequestMeasurement;
  try {
    for (let index = 0; index < repeats; index++) {
      const start = options.now(); attemptedSamples++;
      let response: ScaleResponse | undefined; let elapsedMs: number | undefined; let payloadBytes: number | null = null;
      try {
        response = await options.request(); responseSamples++; elapsedMs = options.now() - start;
        payloadBytes = Buffer.byteLength(response.body);
        if (response.statusCode !== 200) throw new Error(`HTTP ${response.statusCode} ${options.operation}`);
        const value = response.json() as { items?: unknown[]; academic?: unknown[] };
        const sampleRows = Array.isArray(value.items) ? value.items.length : Array.isArray(value.academic) ? value.academic.length : 0;
        if (payloadBytes >= 500000) throw new Error('Scale response exceeds the existing payload budget.');
        times.push(elapsedMs); maxPayloadBytes = Math.max(maxPayloadBytes ?? 0, payloadBytes); rows = sampleRows;
      } catch (error) {
        lastFailedSample = { sampleNumber: index + 1, elapsedMs: elapsedMs ?? options.now() - start,
          stage: response ? 'RESPONSE_ASSERTIONS' : 'REQUEST', statusCode: response?.statusCode ?? null, payloadBytes };
        throw error;
      }
    }
  } finally {
    times.sort((a, b) => a - b);
    const p95Ms = times.length ? times[Math.ceil(times.length * .95) - 1] : null;
    measurement = { kind: 'REQUEST', operation: options.operation, samples: times.length, completedAndAsserted: times.length,
      expectedSamples: repeats, attemptedSamples, responseSamples, complete: times.length === repeats,
      medianMs: times.length ? times[Math.floor(times.length / 2)] : null, p95Ms,
      budgetPassed: p95Ms === null ? null : p95Ms < 5000, maxPayloadBytes, rows, lastFailedSample };
    options.record(measurement);
  }
  return measurement;
}

export async function settleScaleCase(options: {
  passed: boolean; cleanup: readonly (() => void | Promise<unknown>)[]; recordPassed: () => void; recordFailed: () => void;
}): Promise<void> {
  try { await withFixtureCleanup(async () => undefined, options.cleanup); }
  catch (error) { options.recordFailed(); throw error; }
  if (options.passed) options.recordPassed(); else options.recordFailed();
}

export type ScaleFinalReceipt<T> = { status: 'VERIFIED' | 'FAILED' | 'NOT_VERIFIED'; actualFixture: T | null; fixtureCaptured: boolean; teardownComplete: boolean };
export async function finalizeScaleFixture<T>(options: {
  setupComplete: boolean; passedCases: number; failedCases: number; measurements: readonly ScaleMeasurement[];
  prepare: readonly (() => void | Promise<unknown>)[]; captureFixture: () => Promise<T | null>;
  cleanup: readonly (() => void | Promise<unknown>)[]; writeArtifact: (receipt: ScaleFinalReceipt<T>) => Promise<void>;
}): Promise<ScaleFinalReceipt<T>> {
  let actualFixture: T | null = null; let fixtureCaptured = false; let teardownComplete = true; let failed = false;
  let receipt!: ScaleFinalReceipt<T>;
  await withFixtureCleanup(async () => {
    try {
      await withFixtureCleanup(async () => {
        await withFixtureCleanup(async () => undefined, options.prepare);
        actualFixture = await options.captureFixture(); fixtureCaptured = actualFixture !== null;
      }, options.cleanup.map(step => async () => {
        try { await step(); } catch (error) { teardownComplete = false; throw error; }
      }));
    } catch (error) { failed = true; throw error; }
  }, [async () => {
    const requests = options.measurements.filter((value): value is RequestMeasurement => value.kind === 'REQUEST');
    const measurementsPassed = requests.length > 0 && requests.every(value => value.complete && value.budgetPassed === true);
    receipt = { status: failed || options.failedCases > 0 ? 'FAILED' : options.setupComplete && options.passedCases === 4 && fixtureCaptured && measurementsPassed && teardownComplete ? 'VERIFIED' : 'NOT_VERIFIED',
      actualFixture, fixtureCaptured, teardownComplete };
    await options.writeArtifact(receipt);
  }]);
  return receipt;
}
