import { z } from 'zod';

export type PilotWindow = 'performance' | 'volume';
export const pilotPhaseNames = ['context', 'canonical-ci', 'source-start', 'clean-bootstrap', 'clean-reference', 'build', 'performance-ownership', 'performance-browser', 'performance-stop', 'performance-journal', 'performance-private-cleanup', 'performance-restore', 'performance-reference', 'volume-ownership', 'volume-setup', 'volume-browser', 'volume-stop', 'volume-journal', 'volume-private-cleanup', 'volume-restore', 'volume-reference', 'source-freeze'] as const;
export type PilotPhaseName = typeof pilotPhaseNames[number];
const sha = z.string().regex(/^[a-f0-9]{40}$/);
const decimalId = z.string().regex(/^[1-9][0-9]*$/);
const allowedRef = z.enum(['refs/heads/main', 'refs/heads/codex/cuevo-integrated-review']);
const identitySchema = z.object({ repository: z.literal('attaulhaq0/Cuevo'), commitSha: sha, ref: allowedRef, runId: decimalId, runAttempt: z.number().int().positive(), ciRunId: decimalId }).strict();
export type PilotRunIdentity = z.infer<typeof identitySchema>;
const contextSchema = z.object({ platform: z.literal('linux'), ci: z.literal('true'), githubActions: z.literal('true'), runnerEnvironment: z.literal('github-hosted'), event: z.literal('workflow_dispatch'), repository: z.literal('attaulhaq0/Cuevo'), sha, expectedSha: sha, headSha: sha, ref: allowedRef, clean: z.literal(true), runId: decimalId, runAttempt: z.number().int().positive(), ciRunId: decimalId }).strict();
export type PilotRunContext = z.infer<typeof contextSchema>;
export function validatePilotWindowContext(raw: unknown): PilotRunContext {
  const context = contextSchema.parse(raw);
  if (context.sha !== context.expectedSha || context.sha !== context.headSha) throw Error('Pilot window source identity is not confirmed.');
  return context;
}
/** Pilot-only exact branch proof. It does not relax the main-push release gate. */
export function validatePilotCiRun(raw: unknown, context: PilotRunContext) {
  const current = validatePilotWindowContext(context);
  const value = z.object({ id: z.number().int().positive(), head_sha: sha, head_branch: z.string(), event: z.literal('push'), status: z.literal('completed'), conclusion: z.literal('success'), path: z.literal('.github/workflows/ci.yml'), repository: z.object({ full_name: z.literal('attaulhaq0/Cuevo') }) }).parse(raw);
  if (String(value.id) !== current.ciRunId || value.head_sha !== current.sha || value.head_branch !== current.ref.slice('refs/heads/'.length)) throw Error('Pilot CI must belong to the exact reviewed source and branch.');
  return value;
}
const cases = {
  performance: { file: 'customer-performance.spec.ts', title: 'customer performance: production browser navigation, private bytes, fixture analysis and private updates' },
  volume: { file: 'customer-pilot-volume.spec.ts', title: 'pilot browser volume: current class/state, source learning, large community and parent-approved portfolios' },
} as const;
function object(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
export function validatePilotBrowserReport(raw: unknown, options: { window: PilotWindow; startedAt: number; finishedAt: number }): 1 {
  const invalid = () => Error('Exact pilot browser execution is not confirmed.');
  const expected = cases[options.window];
  if (!expected || !Number.isFinite(options.startedAt) || !Number.isFinite(options.finishedAt) || options.finishedAt < options.startedAt || !object(raw) || !object(raw.stats) || !Array.isArray(raw.errors) || raw.errors.length || !Array.isArray(raw.suites)) throw invalid();
  const reportTime = Date.parse(String(raw.stats.startTime));
  if (!Number.isFinite(reportTime) || reportTime < options.startedAt || reportTime > options.finishedAt || raw.stats.expected !== 1 || raw.stats.unexpected !== 0 || raw.stats.flaky !== 0 || raw.stats.skipped !== 0 || typeof raw.stats.duration !== 'number' || !Number.isFinite(raw.stats.duration) || raw.stats.duration < 0 || reportTime + raw.stats.duration > options.finishedAt) throw invalid();
  let count = 0;
  const visit = (suites: unknown[], depth = 0) => {
    if (depth > 10 || suites.length > 20) throw invalid();
    for (const suite of suites) {
      if (!object(suite)) throw invalid();
      if (suite.suites !== undefined) { if (!Array.isArray(suite.suites)) throw invalid(); visit(suite.suites, depth + 1); }
      if (suite.specs === undefined) continue;
      if (!Array.isArray(suite.specs)) throw invalid();
      for (const spec of suite.specs) {
        if (++count !== 1 || !object(spec) || spec.file !== expected.file || spec.title !== expected.title || spec.ok !== true || !Array.isArray(spec.tests) || spec.tests.length !== 1) throw invalid();
        const row = spec.tests[0];
        if (!object(row) || row.expectedStatus !== 'passed' || row.status !== 'expected' || row.projectName !== 'production-chromium' || !Array.isArray(row.results) || row.results.length !== 1) throw invalid();
        const result = row.results[0], time = object(result) ? Date.parse(String(result.startTime)) : Number.NaN;
        if (!object(result) || result.status !== 'passed' || result.retry !== 0 || !Array.isArray(result.errors) || result.errors.length || !Number.isFinite(time) || time < reportTime || time > options.finishedAt || typeof result.duration !== 'number' || !Number.isFinite(result.duration) || result.duration < 0 || time + result.duration > options.finishedAt) throw invalid();
      }
    }
  };
  visit(raw.suites); if (count !== 1) throw invalid(); return 1;
}
export type PilotPhaseStatus = 'PASSED' | 'FAILED' | 'NOT_EXECUTED' | 'UNKNOWN';
export type PilotPhase = { name: PilotPhaseName; status: PilotPhaseStatus; actionConfirmed: boolean | null; restorationAllowed: boolean | null; exitCode: number | null; durationMs: number | null; sequence: number | null };
export type PilotWindowEvidence = { schemaVersion: 1; identity: PilotRunIdentity; status: 'VERIFIED' | 'FAILED' | 'NOT_VERIFIED'; recordFailed: boolean; rows: PilotPhase[] };
const phaseSchema = z.object({ name: z.enum(pilotPhaseNames), status: z.enum(['PASSED', 'FAILED', 'NOT_EXECUTED', 'UNKNOWN']), actionConfirmed: z.boolean().nullable(), restorationAllowed: z.boolean().nullable(), exitCode: z.number().int().nonnegative().nullable(), durationMs: z.number().finite().nonnegative().nullable(), sequence: z.number().int().positive().nullable() }).strict().superRefine((row, context) => {
  if (row.status === 'PASSED' && (row.actionConfirmed !== true || row.exitCode !== 0 || row.durationMs === null || row.sequence === null) || row.status === 'FAILED' && (row.actionConfirmed !== false || !row.exitCode || row.sequence === null) || row.status === 'NOT_EXECUTED' && (row.actionConfirmed !== null || row.exitCode !== null || row.durationMs !== null || row.sequence !== null) || row.status === 'UNKNOWN' && (row.actionConfirmed === null || row.exitCode !== null || row.sequence === null || row.durationMs !== null)) context.addIssue({ code: 'custom', message: 'Pilot phase status and execution receipt differ.' });
  if (!row.name.endsWith('-private-cleanup') && row.restorationAllowed !== null || row.name.endsWith('-private-cleanup') && row.status === 'PASSED' && row.restorationAllowed !== true || row.status === 'NOT_EXECUTED' && row.restorationAllowed !== null) context.addIssue({ code: 'custom', message: 'Restoration authority belongs only to an executed private cleanup receipt.' });
  if (row.name.endsWith('-private-cleanup') && row.status === 'UNKNOWN' && row.restorationAllowed !== false) context.addIssue({ code: 'custom', message: 'Unknown private cleanup cannot authorize restoration.' });
});
const evidenceSchema = z.object({ schemaVersion: z.literal(1), identity: identitySchema, status: z.enum(['VERIFIED', 'FAILED', 'NOT_VERIFIED']), recordFailed: z.boolean(), rows: z.array(phaseSchema).length(pilotPhaseNames.length) }).strict();
export function validatePilotWindowEvidence(raw: unknown): PilotWindowEvidence {
  const value = evidenceSchema.parse(raw);
  if (value.rows.some((row, index) => row.name !== pilotPhaseNames[index])) throw Error('Pilot evidence requires the exact ordered phase identities.');
  const executed = value.rows.filter(row => row.sequence !== null);
  if (executed.some((row, index) => row.sequence !== index + 1)) throw Error('Pilot evidence execution sequence is unconfirmed.');
  const row = (name: PilotPhaseName) => value.rows.find(item => item.name === name)!;
  const ran = (name: PilotPhaseName) => row(name).sequence !== null;
  const passed = (name: PilotPhaseName) => row(name).status === 'PASSED';
  for (const window of ['performance', 'volume'] as const) {
    const phase = (suffix: string) => `${window}-${suffix}` as PilotPhaseName;
    if (ran(phase('ownership')) && !['context', 'canonical-ci', 'source-start', 'clean-bootstrap', 'clean-reference', 'build'].every(name => passed(name as PilotPhaseName)) || ran(phase('browser')) && !passed(phase('ownership')) || window === 'volume' && ran('volume-browser') && !passed('volume-setup') || ran(phase('stop')) && row(phase('ownership')).actionConfirmed !== true || ran(phase('journal')) && row(phase('stop')).actionConfirmed !== true || ran(phase('private-cleanup')) && (row(phase('stop')).actionConfirmed !== true || row(phase('journal')).actionConfirmed !== true) || ran(phase('restore')) && (row(phase('private-cleanup')).restorationAllowed !== true || !['PASSED', 'FAILED'].includes(row(phase('private-cleanup')).status)) || ran(phase('reference')) && !ran(phase('restore'))) throw Error('Pilot evidence violates ownership or restoration ordering.');
  }
  if (ran('volume-ownership') && !value.rows.slice(0, 13).every(item => item.status === 'PASSED')) throw Error('Volume cannot follow unconfirmed performance restoration.');
  const failed = value.recordFailed || value.rows.some(row => row.status === 'FAILED');
  const allPassed = value.rows.every(row => row.status === 'PASSED');
  const expectedStatus = failed ? 'FAILED' : allPassed ? 'VERIFIED' : 'NOT_VERIFIED';
  if (value.status !== expectedStatus) throw Error('Pilot evidence cannot promote failed or unknown work.');
  return value;
}
export type PilotPrivateCleanupResult = { status: 'PASSED' | 'FAILED' | 'UNKNOWN'; restorationAllowed: boolean };
const cleanupSchema = z.object({ status: z.enum(['PASSED', 'FAILED', 'UNKNOWN']), restorationAllowed: z.boolean() }).strict();
export type PilotPorts = {
  identity: PilotRunIdentity; now(): number;
  context(): Promise<void>; canonicalCi(): Promise<void>; sourceStart(): Promise<void>;
  bootstrap(): Promise<void>; reference(window?: PilotWindow): Promise<void>; build(): Promise<void>;
  ownership(window: PilotWindow): Promise<void>; setupVolume(): Promise<void>; browser(window: PilotWindow): Promise<void>;
  stop(window: PilotWindow): Promise<void>; journal(window: PilotWindow): Promise<void>;
  cleanupPrivate(window: PilotWindow): Promise<PilotPrivateCleanupResult>;
  restore(window: PilotWindow): Promise<void>; sourceFreeze(): Promise<void>;
  record(evidence: PilotWindowEvidence): Promise<void>;
};
/** Sequencing is pure; caller owns concrete native guards, process bounds and journals. */
export async function verifyPilotWindows(ports: PilotPorts): Promise<number> {
  const identity = identitySchema.parse(ports.identity);
  const evidence: PilotWindowEvidence = { schemaVersion: 1, identity, status: 'NOT_VERIFIED', recordFailed: false, rows: pilotPhaseNames.map(name => ({ name, status: 'NOT_EXECUTED', actionConfirmed: null, restorationAllowed: null, exitCode: null, durationMs: null, sequence: null })) };
  let sequence = 0;
  const persist = async () => { try { await ports.record(structuredClone(evidence)); return true; } catch { evidence.recordFailed = true; return false; } };
  const status = () => { evidence.status = evidence.recordFailed || evidence.rows.some(row => row.status === 'FAILED') ? 'FAILED' : evidence.rows.every(row => row.status === 'PASSED') ? 'VERIFIED' : 'NOT_VERIFIED'; };
  const observeTime = () => { try { const value = ports.now(); return Number.isFinite(value) && value >= 0 ? value : null; } catch { return null; } };
  const execute = async (name: PilotPhaseName, action: () => Promise<unknown>) => {
    const row = evidence.rows.find(row => row.name === name)!; row.sequence = ++sequence;
    const start = observeTime(); let actionConfirmed = false;
    try { await action(); actionConfirmed = true; row.status = 'PASSED'; row.exitCode = 0; }
    catch { row.status = 'FAILED'; row.exitCode = 1; }
    row.actionConfirmed = actionConfirmed;
    const finish = observeTime();
    if (start !== null && finish !== null && finish >= start) row.durationMs = finish - start;
    else { row.status = 'UNKNOWN'; row.exitCode = null; }
    status(); const recorded = await persist(); return { passed: row.status === 'PASSED', actionConfirmed, recorded };
  };
  const freeze = async () => { if (evidence.rows.find(row => row.name === 'source-start')!.status === 'PASSED') await execute('source-freeze', ports.sourceFreeze); };
  for (const [name, action] of [['context', ports.context], ['canonical-ci', ports.canonicalCi], ['source-start', ports.sourceStart], ['clean-bootstrap', ports.bootstrap], ['clean-reference', () => ports.reference()], ['build', ports.build]] as const) {
    const result = await execute(name, action); if (!result.passed || !result.recorded) { await freeze(); status(); await persist(); return 1; }
  }
  for (const window of ['performance', 'volume'] as const) {
    const phase = (suffix: string) => `${window}-${suffix}` as PilotPhaseName;
    const ownership = await execute(phase('ownership'), () => ports.ownership(window));
    if (!ownership.actionConfirmed) break;
    let measured = ownership.passed && ownership.recorded;
    if (window === 'volume' && measured) { const setup = await execute('volume-setup', ports.setupVolume); measured = setup.passed && setup.recorded; }
    if (measured) { const browser = await execute(phase('browser'), () => ports.browser(window)); measured = browser.passed && browser.recorded; }
    const stop = await execute(phase('stop'), () => ports.stop(window));
    if (!stop.actionConfirmed) break;
    const journal = await execute(phase('journal'), () => ports.journal(window));
    if (!journal.actionConfirmed || !journal.recorded) break;
    let restorationAllowed = false;
    const cleanup = await execute(phase('private-cleanup'), async () => {
      const result = cleanupSchema.parse(await ports.cleanupPrivate(window));
      evidence.rows.find(row => row.name === phase('private-cleanup'))!.restorationAllowed = result.status !== 'UNKNOWN' && result.restorationAllowed;
      if (result.status === 'PASSED' && result.restorationAllowed === true) { restorationAllowed = true; return; }
      restorationAllowed = result.status === 'FAILED' && result.restorationAllowed === true;
      throw Error('Pilot private cleanup requires review.');
    });
    if (!restorationAllowed) break;
    const restore = await execute(phase('restore'), () => ports.restore(window));
    const restored = await execute(phase('reference'), () => ports.reference(window));
    if (!measured || !stop.recorded || !cleanup.passed || !cleanup.recorded || !restore.passed || !restore.recorded || !restored.passed || !restored.recorded || evidence.recordFailed) break;
  }
  await freeze(); status(); await persist(); status();
  return evidence.status === 'VERIFIED' ? 0 : 1;
}
