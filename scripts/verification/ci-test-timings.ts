import { createHash } from 'node:crypto';
import { isAbsolute, relative, resolve } from 'node:path';
import { types } from 'node:util';

const MAX_DURATION_MS = 86_400_000;
const MAX_UNITS = 10_000;
const MAX_EVENTS = 200_000;
const fixedError = () => Error('CI test timing input requires review; private contents withheld.');
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const digest = /^[a-f0-9]{64}$/;
const sha = /^[a-f0-9]{40}$/;
const safePath = /^(?:scripts|apps|packages|tests)\/[A-Za-z0-9_./-]+\.test\.ts$/;
type RecordValue = Record<string, unknown>;

/** Inspect data properties only. Node error objects and log contents are never read. */
function record(value: unknown): RecordValue | null {
  if (typeof value !== 'object' || value === null || types.isProxy(value) || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.values(descriptors).some(descriptor => !('value' in descriptor))) return null;
  return Object.fromEntries(Object.entries(descriptors).map(([key, descriptor]) => [key, descriptor.value]));
}
function exact(value: RecordValue, keys: readonly string[]) {
  return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
const integer = (value: unknown, max = Number.MAX_SAFE_INTEGER): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= max;
const duration = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX_DURATION_MS;
const marked = (value: unknown) => value !== undefined && value !== false;

export type CiTestTimingIdentity = {
  sourceSha: string; treeSha: string; sourceLockSha256: string; nodeVersion: string;
  runId: string | null; runAttempt: number | null; scope: string; partitionSha256: string;
};
export type CiTestTimingOptions = {
  repoRoot: string; files: { path: string; sha256: string }[];
  identity: CiTestTimingIdentity; now: () => number;
};
export type CiTestTimingReason =
  | 'EVENT_INVALID' | 'EVENT_UNSUPPORTED' | 'FILE_UNREGISTERED' | 'DUPLICATE_EVENT'
  | 'LIFECYCLE_UNCONFIRMED' | 'PARENT_UNCONFIRMED' | 'CLOCK_INVALID' | 'LIMIT_EXCEEDED'
  | 'CASE_FAILED' | 'CASE_SKIPPED' | 'CASE_TODO' | 'RERUN_UNSUPPORTED'
  | 'FILE_FAILED' | 'FILE_COVERAGE_MISSING' | 'SUMMARY_MISSING' | 'SUMMARY_INCONSISTENT';
type Outcome = 'PASSED' | 'FAILED' | 'SKIPPED' | 'TODO';
type SummaryCounts = { tests: number; passed: number; failed: number; cancelled: number; skipped: number; todo: number; suites: number; topLevel: number };
type Summary = { counts: SummaryCounts; durationMs: number; success: boolean };
type TimingCase = {
  titleSha256: string; suiteSha256: string | null; line: number; column: number;
  nesting: number; testNumber: number; startedAtMs: number; completedAtMs: number;
  durationMs: number; outcome: Outcome;
};
export type CiTestTimingEvidence = {
  version: 1; purpose: 'CUEVO_CI_TEST_TIMINGS'; status: 'PASSED' | 'FAILED';
  effectAuthority: false; timeTargetAchieved: false; fileBytesConfirmed: boolean;
  observationBasis: 'SUPPLIED_NODE_EVENT_STREAM';
  identity: CiTestTimingIdentity; startedAtMs: number; completedAtMs: number;
  reasons: CiTestTimingReason[]; summary: Summary | null;
  files: {
    path: string; sha256: string; startedAtMs: number | null; completedAtMs: number | null;
    durationMs: number | null; summary: Summary | null; cases: TimingCase[]; suites: TimingCase[];
  }[];
};
type Unit = {
  key: string; titleSha256: string; line: number; column: number; nesting: number;
  type: 'test' | 'suite'; wrapper: boolean; startedAtMs: number | null; complete: TimingCase | null;
  parent: Unit | null; ancestrySha256: string; resultSeen: boolean;
};
type FileState = { row: CiTestTimingEvidence['files'][number]; units: Unit[]; wrapperCompleted: boolean };

/**
 * Observe a process-isolated Node TestsStream without producing release authority.
 * Clock fields are receipt times at dequeue/complete, not reconstructed test starts.
 * The native file-wrapper duration is kept separately from tests and suites.
 */
export function createCiTestTimingCollector(input: CiTestTimingOptions) {
  const options = record(input);
  if (!options || !exact(options, ['repoRoot', 'files', 'identity', 'now']) ||
      typeof options.repoRoot !== 'string' || !isAbsolute(options.repoRoot) || resolve(options.repoRoot) !== options.repoRoot ||
      typeof options.now !== 'function' || types.isProxy(options.now) ||
      !Array.isArray(options.files) || types.isProxy(options.files) || options.files.length < 1 || options.files.length > 200) throw fixedError();
  const repoRoot = options.repoRoot;
  const rawIdentity = record(options.identity);
  if (!rawIdentity || !exact(rawIdentity, ['sourceSha', 'treeSha', 'sourceLockSha256', 'nodeVersion', 'runId', 'runAttempt', 'scope', 'partitionSha256']) ||
      typeof rawIdentity.sourceSha !== 'string' || !sha.test(rawIdentity.sourceSha) || typeof rawIdentity.treeSha !== 'string' || !sha.test(rawIdentity.treeSha) ||
      typeof rawIdentity.sourceLockSha256 !== 'string' || !digest.test(rawIdentity.sourceLockSha256) ||
      typeof rawIdentity.partitionSha256 !== 'string' || !digest.test(rawIdentity.partitionSha256) ||
      typeof rawIdentity.nodeVersion !== 'string' || !/^v[0-9]+\.[0-9]+\.[0-9]+$/.test(rawIdentity.nodeVersion) ||
      typeof rawIdentity.scope !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(rawIdentity.scope) ||
      (rawIdentity.runId === null) !== (rawIdentity.runAttempt === null) ||
      rawIdentity.runId !== null && (typeof rawIdentity.runId !== 'string' || !/^[1-9][0-9]{0,18}$/.test(rawIdentity.runId) || !integer(rawIdentity.runAttempt) || rawIdentity.runAttempt < 1)) throw fixedError();
  const identity: CiTestTimingIdentity = {
    sourceSha: rawIdentity.sourceSha, treeSha: rawIdentity.treeSha, sourceLockSha256: rawIdentity.sourceLockSha256,
    nodeVersion: rawIdentity.nodeVersion, runId: rawIdentity.runId as string | null, runAttempt: rawIdentity.runAttempt as number | null,
    scope: rawIdentity.scope, partitionSha256: rawIdentity.partitionSha256,
  };
  const files = new Map<string, FileState>();
  for (let index = 0; index < options.files.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(options.files, String(index));
    const file = descriptor && 'value' in descriptor ? record(descriptor.value) : null;
    if (!file || !exact(file, ['path', 'sha256']) || typeof file.path !== 'string' || file.path.length > 512 || !safePath.test(file.path) ||
        file.path.split('/').some(piece => !piece || piece === '.' || piece === '..') || typeof file.sha256 !== 'string' || !digest.test(file.sha256) || files.has(file.path)) throw fixedError();
    files.set(file.path, { row: { path: file.path, sha256: file.sha256, startedAtMs: null, completedAtMs: null, durationMs: null, summary: null, cases: [], suites: [] }, units: [], wrapperCompleted: false });
  }
  const reasons = new Set<CiTestTimingReason>();
  let priorClock = 0;
  const now = options.now as () => number;
  const clock = () => {
    try {
      const value: unknown = now();
      if (!integer(value) || value < priorClock) { reasons.add('CLOCK_INVALID'); return priorClock; }
      priorClock = value;
      return value;
    } catch { reasons.add('CLOCK_INVALID'); return priorClock; }
  };
  const startedAtMs = clock();
  let eventCount = 0, unitCount = 0;
  let summary: Summary | null = null;
  let final: CiTestTimingEvidence | null = null;
  function fileFor(value: unknown) {
    if (typeof value !== 'string' || value.length > 4_096 || value.includes('\0')) { reasons.add('FILE_UNREGISTERED'); return null; }
    const resolved = resolve(repoRoot, value);
    const path = relative(repoRoot, resolved).replaceAll('\\', '/');
    if (value.replaceAll('\\', '/') !== path && value.replaceAll('\\', '/') !== resolved.replaceAll('\\', '/')) { reasons.add('FILE_UNREGISTERED'); return null; }
    const file = files.get(path);
    if (!file) reasons.add('FILE_UNREGISTERED');
    return file ?? null;
  }
  function location(data: RecordValue, file: FileState) {
    if (typeof data.name !== 'string' || !data.name || Buffer.byteLength(data.name) > 16_384 || !integer(data.line, 1_000_000) || data.line < 1 ||
        !integer(data.column, 1_000_000) || data.column < 1 || !integer(data.nesting, 100)) { reasons.add('EVENT_INVALID'); return null; }
    const titleSha256 = hash(data.name);
    const wrapper = data.nesting === 0 && data.line === 1 && data.column === 1 &&
      (data.name.replaceAll('\\', '/') === file.row.path || data.name.replaceAll('\\', '/') === resolve(repoRoot, file.row.path).replaceAll('\\', '/'));
    return { key: JSON.stringify([data.line, data.column, data.nesting, titleSha256]), titleSha256, line: data.line, column: data.column, nesting: data.nesting, wrapper };
  }
  function readSummary(data: RecordValue): Summary | null {
    const counts = record(data.counts);
    const keys = ['tests', 'passed', 'cancelled', 'skipped', 'todo', 'suites', 'topLevel'] as const;
    if (!counts || keys.some(key => !integer(counts[key], 1_000_000)) || !duration(data.duration_ms) || typeof data.success !== 'boolean') { reasons.add('EVENT_INVALID'); return null; }
    // Runtime Node 24 provides `failed`; @types/node 24 omits it. When absent,
    // reconstruct only this count from the documented disjoint outcome counts.
    const failed = counts.failed === undefined ? Number(counts.tests) - Number(counts.passed) - Number(counts.cancelled) - Number(counts.skipped) - Number(counts.todo) : counts.failed;
    if (!integer(failed, 1_000_000) || Number(counts.tests) !== Number(counts.passed) + failed + Number(counts.cancelled) + Number(counts.skipped) + Number(counts.todo)) { reasons.add('SUMMARY_INCONSISTENT'); return null; }
    return { counts: { tests: counts.tests as number, passed: counts.passed as number, failed, cancelled: counts.cancelled as number, skipped: counts.skipped as number, todo: counts.todo as number, suites: counts.suites as number, topLevel: counts.topLevel as number }, durationMs: data.duration_ms, success: data.success };
  }
  function consume(event: unknown) {
    if (final) throw fixedError();
    if (++eventCount > MAX_EVENTS) { reasons.add('LIMIT_EXCEEDED'); return; }
    try {
      const envelope = record(event);
      if (!envelope || !exact(envelope, ['type', 'data']) || typeof envelope.type !== 'string') { reasons.add('EVENT_INVALID'); return; }
      const type = envelope.type;
      if (['test:stdout', 'test:stderr', 'test:diagnostic', 'test:coverage', 'test:plan', 'test:start'].includes(type)) return;
      if (!['test:enqueue', 'test:dequeue', 'test:complete', 'test:pass', 'test:fail', 'test:summary'].includes(type)) { reasons.add('EVENT_UNSUPPORTED'); return; }
      const data = record(envelope.data);
      if (!data) { reasons.add('EVENT_INVALID'); return; }
      const receivedAtMs = clock();
      if (type === 'test:summary') {
        const parsed = readSummary(data);
        if (!parsed) return;
        if (data.file === undefined) {
          if (summary) reasons.add('DUPLICATE_EVENT'); else summary = parsed;
        } else {
          const file = fileFor(data.file);
          if (file) { if (file.row.summary) reasons.add('DUPLICATE_EVENT'); else file.row.summary = parsed; }
        }
        if (!parsed.success) reasons.add('CASE_FAILED');
        if (parsed.counts.skipped) reasons.add('CASE_SKIPPED');
        if (parsed.counts.todo) reasons.add('CASE_TODO');
        return;
      }
      const file = fileFor(data.file);
      if (!file) return;
      const info = location(data, file);
      if (!info) return;
      if (type === 'test:enqueue') {
        if (data.type !== 'test' && data.type !== 'suite') { reasons.add('EVENT_INVALID'); return; }
        if (++unitCount > MAX_UNITS) { reasons.add('LIMIT_EXCEEDED'); return; }
        file.units.push({ ...info, type: data.type, startedAtMs: null, complete: null, parent: null, ancestrySha256: hash(JSON.stringify([info.titleSha256, info.line, info.column])), resultSeen: false });
        return;
      }
      if (type === 'test:dequeue') {
        const candidates = file.units.filter(unit => unit.key === info.key && unit.startedAtMs === null);
        const unit = candidates[0];
        // Node 24 may label a queued nested test's dequeue hint as `suite`.
        // Its enqueue definition and completion type/counts remain the checked
        // identity; the scheduling hint cannot change the owned unit type.
        if (!unit || typeof data.type!=='string'||!['test','suite'].includes(data.type)) { reasons.add('LIFECYCLE_UNCONFIRMED'); return; }
        unit.startedAtMs = receivedAtMs;
        if (unit.wrapper) { if (file.row.startedAtMs !== null) reasons.add('DUPLICATE_EVENT'); else file.row.startedAtMs = receivedAtMs; }
        else if (unit.nesting > 0) {
          const parents = file.units.filter(parent => !parent.wrapper && parent.nesting === unit.nesting - 1 && parent.startedAtMs !== null && parent.complete === null);
          if (parents.length !== 1) reasons.add('PARENT_UNCONFIRMED');
          else { unit.parent = parents[0]; unit.ancestrySha256 = hash(JSON.stringify([parents[0].ancestrySha256, info.titleSha256, info.line, info.column])); }
        }
        return;
      }
      const details = record(data.details);
      if (!details || !duration(details.duration_ms) || details.type !== undefined && details.type !== 'test' && details.type !== 'suite' ||
          !integer(data.testNumber, 1_000_000) || data.testNumber < 1) { reasons.add('EVENT_INVALID'); return; }
      if (details.attempt !== undefined || details.passed_on_attempt !== undefined) reasons.add('RERUN_UNSUPPORTED');
      if (type === 'test:complete') {
        const candidates = file.units.filter(unit => unit.key === info.key && unit.startedAtMs !== null && unit.complete === null);
        if (candidates.length !== 1) { reasons.add(candidates.length ? 'LIFECYCLE_UNCONFIRMED' : 'DUPLICATE_EVENT'); return; }
        const unit = candidates[0];
        if (typeof details.passed !== 'boolean' || details.type !== undefined && details.type !== unit.type) { reasons.add('EVENT_INVALID'); return; }
        const outcome: Outcome = marked(data.skip) ? 'SKIPPED' : marked(data.todo) ? 'TODO' : details.passed ? 'PASSED' : 'FAILED';
        if (outcome === 'SKIPPED') reasons.add('CASE_SKIPPED');
        if (outcome === 'TODO') reasons.add('CASE_TODO');
        if (outcome === 'FAILED') reasons.add(unit.wrapper ? 'FILE_FAILED' : 'CASE_FAILED');
        unit.complete = { titleSha256: unit.titleSha256, suiteSha256: unit.parent?.ancestrySha256 ?? null, line: unit.line, column: unit.column, nesting: unit.nesting,
          testNumber: data.testNumber, startedAtMs: unit.startedAtMs!, completedAtMs: receivedAtMs, durationMs: details.duration_ms, outcome };
        if (unit.wrapper) {
          if (file.wrapperCompleted) reasons.add('DUPLICATE_EVENT');
          file.wrapperCompleted = true; file.row.completedAtMs = receivedAtMs; file.row.durationMs = details.duration_ms;
        } else (unit.type === 'suite' ? file.row.suites : file.row.cases).push(unit.complete);
        return;
      }
      // The parent process rewrites top-level terminal ordinals across files;
      // child `complete` ordinals remain local. Definition location/name is the
      // stable match, and a repeated location is rejected as ambiguous.
      const candidates = file.units.filter(unit => unit.key === info.key && unit.complete !== null);
      if (candidates.length !== 1 || !candidates[0].complete) { reasons.add('LIFECYCLE_UNCONFIRMED'); return; }
      const unit = candidates[0];
      if (unit.resultSeen) reasons.add('DUPLICATE_EVENT');
      unit.resultSeen = true;
      const complete = unit.complete!;
      if (details.duration_ms !== complete.durationMs || details.type !== undefined && details.type !== unit.type ||
          (type === 'test:fail') !== (complete.outcome === 'FAILED' || complete.outcome === 'TODO' && marked(data.todo) && type === 'test:fail')) reasons.add('SUMMARY_INCONSISTENT');
      if (marked(data.skip)) reasons.add('CASE_SKIPPED');
      if (marked(data.todo)) reasons.add('CASE_TODO');
    } catch { reasons.add('EVENT_INVALID'); }
  }
  function finish(): CiTestTimingEvidence {
    if (final) return structuredClone(final);
    const completedAtMs = clock();
    if (completedAtMs - startedAtMs > MAX_DURATION_MS) reasons.add('CLOCK_INVALID');
    const rows = [...files.values()];
    for (const file of rows) {
      if (!file.wrapperCompleted || file.row.cases.length < 1) reasons.add('FILE_COVERAGE_MISSING');
      if (file.units.some(unit => unit.startedAtMs === null || unit.complete === null || !unit.wrapper && !unit.resultSeen)) reasons.add('LIFECYCLE_UNCONFIRMED');
      if (!file.row.summary) reasons.add('SUMMARY_MISSING');
      else {
        const counts = file.row.summary.counts;
        const units = file.units.filter(unit => !unit.wrapper);
        if (counts.tests !== file.row.cases.length || counts.suites !== file.row.suites.length || counts.topLevel !== units.filter(unit => unit.nesting === 0).length ||
            counts.passed !== file.row.cases.filter(row => row.outcome === 'PASSED').length ||
            counts.skipped !== file.row.cases.filter(row => row.outcome === 'SKIPPED').length ||
            counts.todo !== file.row.cases.filter(row => row.outcome === 'TODO').length ||
            counts.failed + counts.cancelled !== file.row.cases.filter(row => row.outcome === 'FAILED').length) reasons.add('SUMMARY_INCONSISTENT');
      }
    }
    if (!summary) reasons.add('SUMMARY_MISSING');
    else {
      const expected = rows.reduce<SummaryCounts>((total, file) => {
        if (file.row.summary) for (const key of ['tests', 'passed', 'failed', 'cancelled', 'skipped', 'todo', 'suites', 'topLevel'] as const) total[key] += file.row.summary.counts[key];
        return total;
      }, { tests: 0, passed: 0, failed: 0, cancelled: 0, skipped: 0, todo: 0, suites: 0, topLevel: 0 });
      if ((Object.keys(expected) as (keyof SummaryCounts)[]).some(key => summary!.counts[key] !== expected[key]) ||
          !summary.success || summary.counts.failed + summary.counts.cancelled + summary.counts.skipped + summary.counts.todo !== 0) reasons.add('SUMMARY_INCONSISTENT');
    }
    final = { version: 1, purpose: 'CUEVO_CI_TEST_TIMINGS', status: reasons.size ? 'FAILED' : 'PASSED',
      effectAuthority: false, timeTargetAchieved: false, fileBytesConfirmed: false, observationBasis: 'SUPPLIED_NODE_EVENT_STREAM', identity, startedAtMs, completedAtMs,
      reasons: [...reasons].sort(), summary, files: rows.map(file => file.row) };
    return structuredClone(final);
  }
  return { consume, finish };
}
