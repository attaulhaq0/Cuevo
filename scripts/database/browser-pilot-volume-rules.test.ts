import assert from 'node:assert/strict';
import test from 'node:test';
import { requirePilotTarget, requirePilotAdmission, requirePilotCounts, requirePilotReceipt, pilotCounts, type Admission } from './browser-pilot-volume-rules';
const environment = { CUEVO_REQUIRE_BROWSER_PILOT_VOLUME: '1', AI_GENERATION_MODE: 'FIXTURE', AI_FIXTURE_ENABLED: 'true', POSTHOG_CAPTURE_MODE: 'DISABLED' };
const target = { API_URL: 'http://localhost:56321', DB_URL: 'postgresql://postgres:synthetic@localhost:56322/postgres' };
const admission: Admission = { exactPopulation: true, originalPeople: 133, originalStudents: 60, originalClasses: 6, originalAuth: 133, schoolName: 'Cuevo Reference Academy – Doha', countryCode: 'QA', active: true, queuePending: 0, queueProcessing: 0, queueFailed: 0, dispatchDisabled: true, transportPrivate: true, existingPilotSources: 0 };
test('pilot fixture refuses remote/wrong ports, live providers, capture and missing explicit window before writes', () => {
  requirePilotTarget(target, environment);
  for (const fields of [{ API_URL: 'https://customer.supabase.co' }, { DB_URL: 'postgres://postgres:synthetic@localhost:54322/postgres' }, { DB_URL: 'postgres://cuevo_api:synthetic@localhost:56322/postgres' }]) assert.throws(() => requirePilotTarget({ ...target, ...fields }, environment));
  for (const fields of [{ CUEVO_REQUIRE_BROWSER_PILOT_VOLUME: '0' }, { AI_GENERATION_MODE: 'LIVE' }, { AI_FIXTURE_ENABLED: 'false' }, { POSTHOG_CAPTURE_MODE: 'LIVE_SYNTHETIC' }, { CUEVO_DEPLOYMENT_ENVIRONMENT: 'synthetic-staging' }]) assert.throws(() => requirePilotTarget(target, { ...environment, ...fields }));
});
test('pilot setup admission requires exact synthetic/Auth population and idle private source execution', () => {
  requirePilotAdmission(admission);
  for (const value of [undefined, null, [], true, { ...admission, exactPopulation: 'true' }]) assert.throws(() => requirePilotAdmission(value));
  for (const fields of [{ exactPopulation: false }, { originalPeople: 134 }, { originalStudents: 61 }, { originalAuth: 132 }, { originalClasses: 7 }, { schoolName: 'Customer school' }, { countryCode: 'QA1' }, { active: false }, { queuePending: 1 }, { queueProcessing: 1 }, { queueFailed: 1 }, { dispatchDisabled: false }, { transportPrivate: false }, { existingPilotSources: 1 }]) assert.throws(() => requirePilotAdmission({ ...admission, ...fields }));
});
test('a failed or foreign setup cannot consume a stale ready browser scope', () => {
  const runId = '98000000-0000-4000-8000-000000000001'; const receipt = { status: 'READY', runId };
  requirePilotReceipt(receipt, receipt);
  for (const value of [{ status: 'FAILED', runId }, { status: 'READY', runId: '98000000-0000-4000-8000-000000000002' }, { status: 'READY' }, undefined]) assert.throws(() => requirePilotReceipt(value, receipt));
});
test('pilot readiness requires exact committed counts rather than partial fixture success', () => {
  requirePilotCounts(pilotCounts);
  for (const key of Object.keys(pilotCounts)) assert.throws(() => requirePilotCounts({ ...pilotCounts, [key]: pilotCounts[key as keyof typeof pilotCounts] - 1 }));
});
