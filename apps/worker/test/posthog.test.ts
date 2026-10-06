import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { createPosthogEvent, parseWorkerAnalyticsConfig } from '../src/platform/posthog';
import { capturePosthogEvent } from '../src/platform/posthog-http';
import { PosthogDelivery } from '../src/jobs/analytics/posthog-delivery';
import type { WorkerQueryPort } from '../src/platform/query-port';

const live = { mode: 'LIVE_SYNTHETIC' as const, projectId: 393668 as const, host: 'https://us.i.posthog.com' as const, projectKey: 'project-test-only', pseudonymKey: 'a'.repeat(64), keyVersion: 1, environment: 'QA' as const };
const row = { id: '71000000-0000-4000-8000-000000000001', school_id: '10000000-0000-4000-8000-000000000001', actor_id: '20000000-0000-4000-8000-000000000012', type: 'activity.complete', occurred_at: '2026-10-02T18:30:00Z', lease_token: '71000000-0000-4000-8000-000000000002', environment: 'QA', key_version: 1, actor_role: 'student', diagnostics: null };

describe('portable minimized PostHog capture', () => {
  it('admits only explicit exact-source hosted STAGING analytics with production Node settings', () => {
    const projectRef = 'abcdefghijklmnopqrst';
    const settings = { NODE_ENV: 'production', CUEVO_DEPLOYMENT_ENVIRONMENT: 'synthetic-staging', CUEVO_SYNTHETIC_PROJECT_REF: projectRef, CUEVO_SYNTHETIC_WEB_ORIGIN: 'https://cuevo.example', SUPABASE_URL: `https://${projectRef}.supabase.co`, POSTHOG_CAPTURE_MODE: 'LIVE_SYNTHETIC', POSTHOG_PROJECT_ID: '393668', POSTHOG_HOST: 'https://us.i.posthog.com', POSTHOG_PROJECT_KEY: 'phc_test_only', POSTHOG_PSEUDONYM_KEY: 'a'.repeat(64), POSTHOG_PSEUDONYM_KEY_VERSION: '1', POSTHOG_ENVIRONMENT: 'STAGING' };
    expect(parseWorkerAnalyticsConfig(settings)).toMatchObject({ environment: 'STAGING' });
    for (const fields of [{ CUEVO_SYNTHETIC_PROJECT_REF: undefined }, { SUPABASE_URL: 'https://foreign.supabase.co' }, { CUEVO_DEPLOYMENT_ENVIRONMENT: 'production' }, { POSTHOG_ENVIRONMENT: 'QA' }]) expect(() => parseWorkerAnalyticsConfig({ ...settings, ...fields })).toThrow();
    expect(() => parseWorkerAnalyticsConfig({ ...settings, NODE_ENV: 'test', CUEVO_DEPLOYMENT_ENVIRONMENT: undefined })).toThrow();
  });
  it('drops all raw metadata and emits deterministic tenant-bound identity and current repository classification', async () => {
    const event = await createPosthogEvent({ ...row, metadata: { answer: 'private', score: 12, email: 'child@private.test' } }, live);
    expect(event?.event).toBe('learning_activity_completed');
    expect(event?.properties.distinct_id).toBe(createHmac('sha256', live.pseudonymKey).update(`${row.school_id}:${row.actor_id}`).digest('hex'));
    expect(event?.properties.$insert_id).toBe(createHmac('sha256', live.pseudonymKey).update(`posthog:393668:v1:${row.id}`).digest('hex'));
    expect(event?.properties).toMatchObject({ synthetic_environment: true, environment: 'QA', cuevo_source: 'cuevo-repository', schema_version: 2, data_class: 'SYNTHETIC', $process_person_profile: false, $ip: null, actor_role: 'student' });
    expect(JSON.stringify(event)).not.toMatch(/private|score|20000000|10000000|answer|metadata/);
    expect(await createPosthogEvent(row, live)).toEqual(event);
  });
  it('allows only known source types and trusted decision/native representation', async () => {
    expect(await createPosthogEvent({ ...row, type: 'pastoral.recorded' }, live)).toBeNull();
    expect((await createPosthogEvent({ ...row, type: 'recommendation.rejected' }, live))?.properties.decision).toBe('REJECTED');
    expect((await createPosthogEvent({ ...row, type: 'rubric.result.released' }, live))?.properties.native_kind).toBe('RUBRIC');
    expect((await createPosthogEvent({ ...row, type: 'result.released' }, live))?.properties.native_kind).toBe('NUMERIC');
    expect(await createPosthogEvent({ ...row, actor_role: 'private text' }, live)).toBeNull();
  });
  it.each([
    ['activity.complete', 'learning_activity_completed'], ['submission.create', 'assessment_submitted'], ['submission.resubmitted', 'assessment_resubmitted'], ['quiz.submitted', 'quiz_submitted'], ['result.released', 'assessment_marked'], ['rubric.result.released', 'assessment_marked'], ['recommendation.approved', 'recommendation_reviewed'], ['recommendation.rejected', 'recommendation_reviewed'], ['intervention.created', 'intervention_created'], ['intervention.completed', 'intervention_completed'], ['reassessment.linked', 'reassessment_linked'], ['outcome.measured', 'outcome_measured'], ['community.post_created', 'community_post_created'],
  ])('maps persisted source %s without asserting unrecorded educational facts', async (type, name) => {
    expect((await createPosthogEvent({ ...row, type }, live))?.event).toBe(name);
  });
  it('rejects environment and key-version drift before capture', async () => {
    expect(await createPosthogEvent({ ...row, environment: 'DEMO' }, live)).toBeNull();
    expect(await createPosthogEvent({ ...row, key_version: 2 }, live)).toBeNull();
    expect(() => parseWorkerAnalyticsConfig({ POSTHOG_CAPTURE_MODE: 'LIVE_SYNTHETIC' })).toThrow();
    expect(parseWorkerAnalyticsConfig({})).toEqual({ mode: 'DISABLED' });
  });
  it('portable configuration keeps the server parser credential and version policy', () => {
    const settings = { POSTHOG_CAPTURE_MODE: 'LIVE_SYNTHETIC', POSTHOG_PROJECT_ID: '393668', POSTHOG_HOST: 'https://us.i.posthog.com', POSTHOG_PROJECT_KEY: 'phc_test_only', POSTHOG_PSEUDONYM_KEY: 'A'.repeat(64), POSTHOG_PSEUDONYM_KEY_VERSION: '1', POSTHOG_ENVIRONMENT: 'QA' };
    expect(parseWorkerAnalyticsConfig(settings)).toMatchObject({ mode: 'LIVE_SYNTHETIC', pseudonymKey: 'A'.repeat(64), keyVersion: 1 });
    for (const projectKey of ['private whitespace', 'private\ncredential', 'private\u007fcredential', 'p'.repeat(201)]) expect(() => parseWorkerAnalyticsConfig({ ...settings, POSTHOG_PROJECT_KEY: projectKey })).toThrow('Invalid synthetic PostHog configuration.');
    for (const version of ['0', '1.5', '9007199254740992', 'unknown']) expect(() => parseWorkerAnalyticsConfig({ ...settings, POSTHOG_PSEUDONYM_KEY_VERSION: version })).toThrow('Invalid synthetic PostHog configuration.');
    expect(() => parseWorkerAnalyticsConfig({ ...settings, NODE_ENV: 'production' })).toThrow();
    expect(() => parseWorkerAnalyticsConfig({ ...settings, POSTHOG_CAPTURE_MODE: 'UNKNOWN' })).toThrow();
  });
  it.each(['unknown', 'http://us.i.posthog.com', 'https://foreign.test', 'https://us.i.posthog.com/'])('rejects unreviewed capture host %s without including credentials in the error', host => {
    const settings = { POSTHOG_CAPTURE_MODE: 'LIVE_SYNTHETIC', POSTHOG_PROJECT_ID: '393668', POSTHOG_HOST: host, POSTHOG_PROJECT_KEY: 'private-never-log', POSTHOG_PSEUDONYM_KEY: 'a'.repeat(64), POSTHOG_PSEUDONYM_KEY_VERSION: '1', POSTHOG_ENVIRONMENT: 'QA' };
    expect(() => parseWorkerAnalyticsConfig(settings)).toThrow('Invalid synthetic PostHog configuration.');
  });
  it('projects only six schema-validated browser diagnostic fields', async () => {
    const diagnostics = { category: 'hydration_error', feature: 'session', status: 'unknown', timing: 'unknown', locale: 'ar', viewport: 'mobile' };
    const event = await createPosthogEvent({ ...row, type: 'diagnostic.browser', diagnostics }, live);
    expect(event?.event).toBe('cuevo_browser_diagnostic'); expect(event?.properties).toMatchObject(diagnostics);
    expect(await createPosthogEvent({ ...row, type: 'diagnostic.browser', diagnostics: { ...diagnostics, message: 'private' } }, live)).toBeNull();
  });
});

describe('bounded PostHog HTTP acceptance', () => {
  it('sends the exact fixed endpoint with capture key and minimized payload without reading remote response content', async () => {
    const event = (await createPosthogEvent(row, live))!; let sent: RequestInit | undefined;
    const result = await capturePosthogEvent(live, event, async (url, options) => { expect(String(url)).toBe('https://us.i.posthog.com/i/v0/e/'); sent = options; return new Response('private remote content', { status: 200 }); });
    expect(result).toBe('ACCEPTED'); expect(JSON.parse(String(sent?.body))).toEqual({ api_key: live.projectKey, ...event });
    expect(sent?.redirect).toBe('error'); expect(sent?.signal).toBeDefined();
  });
  it.each([400, 401, 429, 500])('never marks HTTP %i as accepted', async status => {
    expect(await capturePosthogEvent(live, (await createPosthogEvent(row, live))!, async () => new Response('private', { status }))).toBe('RETRY_REQUIRED');
  });
  it('treats transport exceptions as unknown rather than success', async () => {
    expect(await capturePosthogEvent(live, (await createPosthogEvent(row, live))!, async () => { throw new Error('private secret'); })).toBe('OUTCOME_UNKNOWN');
  });
  it('bounds a stalled capture request to three seconds', async () => {
    const { vi } = await import('vitest'); vi.useFakeTimers();
    try {
      const event = (await createPosthogEvent(row, live))!;
      const pending = capturePosthogEvent(live, event, async (_url, options) => new Promise((_resolve, reject) => { options!.signal!.addEventListener('abort', () => reject(new Error('private request timeout'))); }));
      await vi.advanceTimersByTimeAsync(3001); expect(await pending).toBe('OUTCOME_UNKNOWN');
    } finally { vi.useRealTimers(); }
  });
});

describe('private delivery lease and external receipt', () => {
  function database({ allowed = true, accepted = true }: { allowed?: boolean; accepted?: boolean } = {}) {
    let claimed = false; const calls: { sql: string; values?: unknown[] }[] = [];
    const db: WorkerQueryPort = { async query(sql, values) { calls.push({ sql, values }); if (sql.includes('claim_posthog_delivery')) { if (claimed) return { rows: [] }; claimed = true; return { rows: [row] }; } if (sql.includes('posthog_delivery_allowed')) return { rows: [{ allowed }] }; if (sql.includes('accept_posthog_delivery')) return { rows: [{ acknowledged: accepted }] }; return { rows: [{ acknowledged: true }] }; } };
    return { db, calls };
  }
  it('disabled delivery has no SQL or network side effects', async () => {
    const { db, calls } = database(); let captures = 0;
    await new PosthogDelivery(db, { mode: 'DISABLED' }, async () => { captures++; return 'ACCEPTED'; }).process({ deadline: Date.now() + 30000, maxEvents: 3 });
    expect(calls).toEqual([]); expect(captures).toBe(0);
  });
  it('claims one event, rechecks policy immediately before POST and only then records confirmed acceptance', async () => {
    const { db, calls } = database(); const sequence: string[] = [];
    const result = await new PosthogDelivery(db, live, async (_config, event) => { sequence.push(event.properties.$insert_id); expect(calls.at(-1)?.sql).toContain('posthog_delivery_allowed'); return 'ACCEPTED'; }).process({ deadline: Date.now() + 30000, maxEvents: 3 });
    expect(result.accepted).toBe(1); expect(sequence).toHaveLength(1);
    expect(calls[0].values).toEqual([1, 30, 1, 'QA']); expect(calls.some(call => call.sql.includes('accept_posthog_delivery'))).toBe(true);
    expect(calls.find(call => call.sql.includes('posthog_delivery_allowed'))?.values).toEqual([row.id, row.lease_token, 1, 'QA']);
  });
  it('revocation before POST blocks capture and leaves source truth unchanged', async () => {
    const { db, calls } = database({ allowed: false }); let captures = 0;
    const result = await new PosthogDelivery(db, live, async () => { captures++; return 'ACCEPTED'; }).process({ deadline: Date.now() + 30000, maxEvents: 3 });
    expect(captures).toBe(0); expect(result.accepted).toBe(0); expect(calls.some(call => call.sql.includes('accept_posthog_delivery'))).toBe(false);
  });
  it('unknown acknowledgement reports review without resending in the same iteration', async () => {
    const { db } = database({ accepted: false }); let captures = 0;
    const result = await new PosthogDelivery(db, live, async () => { captures++; return 'ACCEPTED'; }).process({ deadline: Date.now() + 30000, maxEvents: 3 });
    expect(captures).toBe(1); expect(result.accepted).toBe(0); expect(result.reviewRequired).toBe(true);
  });
  it('failed POST records a fixed retry code and never acknowledges acceptance', async () => {
    const { db, calls } = database();
    const result = await new PosthogDelivery(db, live, async () => 'OUTCOME_UNKNOWN').process({ deadline: Date.now() + 30000, maxEvents: 3 });
    expect(result.accepted).toBe(0); expect(calls.find(call => call.sql.includes('fail_posthog_delivery'))?.values).toEqual([row.id, row.lease_token, 'CAPTURE_OUTCOME_UNKNOWN']);
  });
  it('does not claim after the SQL/network reserve or beyond the event cap', async () => {
    const { db, calls } = database(); await new PosthogDelivery(db, live).process({ deadline: 10000, maxEvents: 3, now: () => 0 }); expect(calls).toEqual([]);
  });
});
