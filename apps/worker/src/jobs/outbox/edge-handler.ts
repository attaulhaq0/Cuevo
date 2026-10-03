import { OutboxProcessor } from './processor';
import { PosthogDelivery } from '../analytics/posthog-delivery';
import { capturePosthogEvent, type CaptureOutcome } from '../../platform/posthog-http';
import type { WorkerAnalyticsConfig, LiveAnalyticsConfig, PosthogEvent } from '../../platform/posthog';
import type { WorkerQueryPort } from '../../platform/query-port';

export interface WorkerConnection extends WorkerQueryPort { close(): Promise<void> }
export type WorkerEdgeConfig = { purposeKey: string; databaseUrl: string; analytics?: WorkerAnalyticsConfig };
export type WorkerConnectionFactory = (config: WorkerEdgeConfig) => Promise<WorkerConnection>;
type FailurePhase = 'CONNECTION' | 'HEALTH' | 'ADMISSION' | 'DOMAIN' | 'ANALYTICS' | 'FINISH' | 'CLOSE';
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const response = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

async function authentic(request: Request, purposeKey: string, wakeId: string, now: number) {
  const timestamp = request.headers.get('x-cuevo-wake-time');
  const signature = request.headers.get('x-cuevo-wake-signature');
  if (!/^[a-f0-9]{64}$/.test(purposeKey) || !timestamp || !/^[1-9][0-9]{0,11}$/.test(timestamp) || !signature || !/^[a-f0-9]{64}$/.test(signature)) return false;
  const seconds = Number(timestamp);
  if (!Number.isSafeInteger(seconds) || !Number.isFinite(now) || Math.abs(Math.floor(now / 1000) - seconds) > 60) return false;
  const bytes = Uint8Array.from(signature.match(/../g)!, pair => Number.parseInt(pair, 16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(purposeKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  return crypto.subtle.verify('HMAC', key, bytes, new TextEncoder().encode(`cuevo.worker.wake.v1\n${timestamp}\n${wakeId}`));
}
async function wakeBody(request: Request) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return null;
  const reader = request.body?.getReader(); if (!reader) return null;
  const chunks: Uint8Array[] = []; let length = 0;
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; void reader.cancel().catch(() => undefined); }, 3000);
  try {
    while (true) { const part = await reader.read(); if (part.done) break; length += part.value.byteLength; if (length > 512) { void reader.cancel().catch(() => undefined); return null; } chunks.push(part.value); }
    if (timedOut) return null;
  } finally { clearTimeout(timeout); reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try {
    const body: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).sort().join('|') !== 'version|wakeId' || !('version' in body) || body.version !== 1 || !('wakeId' in body) || typeof body.wakeId !== 'string' || !uuid.test(body.wakeId)) return null;
    return { version: 1, wakeId: body.wakeId };
  } catch { return null; }
}
export function createWorkerHandler(config: WorkerEdgeConfig, factory: WorkerConnectionFactory, now: () => number = Date.now, capture: (config: LiveAnalyticsConfig, event: PosthogEvent) => Promise<CaptureOutcome> = capturePosthogEvent) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') return response(405, { code: 'METHOD_NOT_ALLOWED' });
    let wake: Awaited<ReturnType<typeof wakeBody>>;
    try { wake = await wakeBody(request); } catch { return response(400, { code: 'INVALID_WAKE' }); }
    if (!wake) return response(400, { code: 'INVALID_WAKE' });
    if (!await authentic(request, config.purposeKey, wake.wakeId, now())) return response(401, { code: 'WORKER_AUTH_REQUIRED' });
    let connection: WorkerConnection | undefined; let admitted = false; let failed = false; let phase: FailurePhase = 'CONNECTION'; let failurePhase: FailurePhase | undefined;
    let state: 'COMPLETED' | 'REQUIRES_REVIEW' | 'FAILURE_RECEIPT_UNKNOWN' = 'REQUIRES_REVIEW'; let processed = 0; let analyticsAccepted = 0; let duplicate = false;
    try {
      connection = await factory(config);
      phase = 'HEALTH';
      const health = (await connection.query('select internal.worker_health()as health')).rows[0]?.health;
      if (!health || typeof health !== 'object' || !('ready' in health) || health.ready !== true) throw new Error('Worker role unavailable.');
      phase = 'ADMISSION';
      const admission = (await connection.query('select internal.begin_worker_wake($1)as wake', [wake.wakeId])).rows[0]?.wake;
      if (typeof admission !== 'boolean') throw new Error('Wake admission outcome unknown.');
      admitted = admission;
      if (!admitted) duplicate = true;
      else {
        const started = now();
        phase = 'DOMAIN';
        const result = await new OutboxProcessor(connection).process({ maxEvents: 10, deadline: started + 20_000, now });
        processed = result.processed; failed = result.executionUnavailable;
        if (result.executionUnavailable) failurePhase = 'DOMAIN';
        state = result.failureReceiptUnknown ? 'FAILURE_RECEIPT_UNKNOWN' : result.reviewRequired ? 'REQUIRES_REVIEW' : 'COMPLETED';
        if (config.analytics?.mode === 'LIVE_SYNTHETIC' && !result.executionUnavailable) {
          phase = 'ANALYTICS';
          // Domain source progression gets the first batch; network capture adds at most one
          // effect to a domain-bearing wake, while analytics-only recovery can drain up to ten.
          const analytics = await new PosthogDelivery(connection, config.analytics, capture).process({ maxEvents: result.attempted > 0 ? 1 : 10, deadline: started + 30_000, now });
          analyticsAccepted = analytics.accepted;
          if (analytics.reviewRequired && state === 'COMPLETED') state = 'REQUIRES_REVIEW';
        }
      }
    } catch { failed = true; failurePhase ??= phase; state = 'REQUIRES_REVIEW'; }
    if (connection && admitted) try {
      const finished = await connection.query('select internal.finish_worker_wake($1,$2,$3)as receipt', [wake.wakeId, state, processed + analyticsAccepted]);
      if (finished.rows[0]?.receipt !== true) { failed = true; failurePhase ??= 'FINISH'; }
    } catch { failed = true; failurePhase ??= 'FINISH'; }
    if (connection) try { await connection.close(); } catch { failed = true; failurePhase ??= 'CLOSE'; }
    if (failed) { const safePhase = failurePhase ?? phase; console.error(JSON.stringify({ service: 'cuevo-worker', event: 'wake.unavailable', failurePhase: safePhase })); return response(503, { code: 'WORKER_UNAVAILABLE', failurePhase: safePhase }); }
    if (duplicate) return response(202, { status: 'NOT_ADMITTED' });
    return response(200, { status: state, processed, ...(config.analytics?.mode === 'LIVE_SYNTHETIC' ? { analyticsAccepted } : {}) });
  };
}
