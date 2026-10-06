import { assertCuevoLocalTarget } from '../configure-local';

export const pilotSchool = '10000000-0000-4000-8000-000000000001';
export const pilotClass = '30000000-0000-4000-8000-000000000001';
export const pilotCourse = '96010000-0000-4000-8000-000000000001';
export const pilotLearner = '20000000-0000-4000-8000-000000000012';
export const pilotCounts = { students: 500, classes: 30, assessments: 101, portfolios: 101, messages: 1000, announcements: 1000 } as const;
export type Admission = { exactPopulation: boolean; originalPeople: number; originalStudents: number; originalClasses: number; originalAuth: number; schoolName: string; countryCode: string; active: boolean; queuePending: number; queueProcessing: number; queueFailed: number; dispatchDisabled: boolean; transportPrivate: boolean; existingPilotSources: number };
export function requirePilotTarget(status: { API_URL: string; DB_URL: string }, environment: Record<string, string | undefined>) {
  assertCuevoLocalTarget(status);
  if (environment.CUEVO_REQUIRE_BROWSER_PILOT_VOLUME !== '1' || environment.CUEVO_DEPLOYMENT_ENVIRONMENT && environment.CUEVO_DEPLOYMENT_ENVIRONMENT !== 'local' || environment.AI_GENERATION_MODE !== 'FIXTURE' || environment.AI_FIXTURE_ENABLED !== 'true' || environment.POSTHOG_CAPTURE_MODE && environment.POSTHOG_CAPTURE_MODE !== 'DISABLED') throw Error('Explicit local synthetic browser-volume window required.');
}
export function requirePilotAdmission(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('Confirmed pilot admission metadata required.');
  const value = input as Admission;
  if (value.exactPopulation !== true || value.originalPeople !== 133 || value.originalStudents !== 60 || value.originalClasses !== 6 || value.originalAuth !== 133 || value.schoolName !== 'Cuevo Reference Academy – Doha' || value.countryCode !== 'QA' || value.active !== true || value.queuePending !== 0 || value.queueProcessing !== 0 || value.queueFailed !== 0 || value.dispatchDisabled !== true || value.transportPrivate !== true || value.existingPilotSources !== 0) throw Error('Pilot volume requires intact reference data, stopped work and private disabled transport.');
}
export function requirePilotReceipt(setup: unknown, scope: unknown) {
  const parsed = (value: unknown) => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const left = parsed(setup); const right = parsed(scope);
  if (left.status !== 'READY' || right.status !== 'READY' || typeof left.runId !== 'string' || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(left.runId) || left.runId !== right.runId) throw Error('Current same-run committed pilot receipts required.');
}
export function requirePilotCounts(value: Record<string, number>) {
  for (const [key, expected] of Object.entries(pilotCounts)) if (value[key] !== expected) throw Error('Committed pilot volume is incomplete; synthetic restoration required.');
}
