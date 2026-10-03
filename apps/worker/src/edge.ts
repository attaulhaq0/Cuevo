import { createWorkerHandler } from './jobs/outbox/edge-handler';
import { createEdgeWorkerConnection } from './platform/edge-database';
import { parseWorkerAnalyticsConfig } from './platform/posthog';
import { hostedSyntheticRuntime, requireHostedSyntheticDatabase } from '@cuevo/config/synthetic-runtime';

const deno = (globalThis as typeof globalThis & { Deno?: { env: { get(name: string): string | undefined }; serve(handler: (request: Request) => Promise<Response>): void } }).Deno;
if (!deno) throw new Error('Deno worker entrypoint required.');
const environment = Object.fromEntries(['NODE_ENV', 'CUEVO_DEPLOYMENT_ENVIRONMENT', 'CUEVO_SYNTHETIC_PROJECT_REF', 'CUEVO_SYNTHETIC_WEB_ORIGIN', 'SUPABASE_URL', 'POSTHOG_CAPTURE_MODE', 'POSTHOG_PROJECT_ID', 'POSTHOG_HOST', 'POSTHOG_PROJECT_KEY', 'POSTHOG_PSEUDONYM_KEY', 'POSTHOG_PSEUDONYM_KEY_VERSION', 'POSTHOG_ENVIRONMENT'].map(name => [name, deno.env.get(name)]));
const hosted = hostedSyntheticRuntime(environment);
const mode = deno.env.get('CUEVO_WORKER_EXECUTION_MODE') ?? 'production';
if (hosted && mode !== 'synthetic-staging' || !hosted && mode === 'synthetic-staging') throw new Error('Hosted synthetic worker requires matching explicit deployment and execution modes.');
const databaseUrl = deno.env.get('CUEVO_WORKER_DATABASE_URL') ?? '';
if (hosted) requireHostedSyntheticDatabase(databaseUrl, hosted, 'cuevo_worker');
const analytics = parseWorkerAnalyticsConfig(environment);
if (analytics.mode === 'LIVE_SYNTHETIC' && mode !== 'local-synthetic' && !hosted) throw new Error('Synthetic analytics requires explicit local or hosted synthetic worker execution.');
deno.serve(createWorkerHandler({ purposeKey: deno.env.get('CUEVO_WORKER_WAKE_KEY') ?? '', databaseUrl, analytics }, config => createEdgeWorkerConnection(config, {
  mode, ca: deno.env.get('CUEVO_WORKER_TLS_CA'), syntheticProjectRef: hosted?.projectRef, syntheticWebOrigin: hosted?.webOrigin, supabaseUrl: hosted?.supabaseUrl,
})));
