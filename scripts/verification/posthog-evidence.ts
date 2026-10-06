import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isGeneratedPath, isSecretPath } from '../repository/rules';
import { sameSourceManifest } from './rules';
import { verificationSteps } from './steps';

type Source = { path: string; sha256: string };
type EvidenceRow = { name: string; exitCode: number | null; required: true; durationMs: number };
type Evidence = { status: 'VERIFIED' | 'FAILED' | 'NOT_VERIFIED'; rows: EvidenceRow[] };
type Scalar = string | number | boolean | null;
export type VerificationEvent = {
  event: 'cuevo_verification_completed'; timestamp: string;
  properties: Record<string, Scalar> & {
    distinct_id: string; $insert_id: string; $process_person_profile: false; $ip: null;
    schema_version: 2; cuevo_source: 'cuevo-repository'; data_class: 'SYNTHETIC'; synthetic_environment: true;
    environment: 'QA'; reporting_kind: 'TECHNICAL_VERIFICATION';
    technical_status: 'VERIFIED' | 'NOT_VERIFIED'; required_rows: number; passed_rows: number; failed_rows: number; unexecuted_rows: number;
    source_freeze_unchanged: boolean; runtime_source_unchanged: boolean;
    source_relation: 'EXACT_SOURCE' | 'DOCUMENTATION_CHANGED' | 'HISTORICAL_SOURCE';
    verified_source_snapshot_sha256: string | null; current_source_snapshot_sha256: string;
    evidence_sha256: string; source_snapshot_sha256: string; source_final_snapshot_sha256: string | null;
    verification_sequence_version: 1; verification_sequence_sha256: string;
    run_correlation: string; run_started_at: string; completion_timestamp_state: 'NOT_RECORDED'; exported_at: string;
  };
};
export type EvidenceConfig = { host: 'https://us.i.posthog.com'; projectId: 393668; projectKey: string };
export type EvidenceReceipt = { capture_outcome: 'ACCEPTED' | 'RETRY_REQUIRED' | 'OUTCOME_UNKNOWN'; attempts: number; readback_status: 'NOT_VERIFIED'; insert_id: string };

const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const expectedNames = [...verificationSteps.map(step => step.name), 'source-freeze'];
const sequenceSha = '66766c60f895b4f1dbb023a0825ff43d7251748d340d13a3d489499aad88e4fd';
const names = new Set<string>(expectedNames);
const sha256 = /^[a-f0-9]{64}$/;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const keys = (value: Record<string, unknown>, expected: string[]) => Object.keys(value).sort().join('|') === [...expected].sort().join('|');
const safePath = (path: string) => !!path && !isAbsolute(path) && !/[:\\]/.test(path) && [...path].every(character => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127) && path.split('/').every(part => !!part && part !== '.' && part !== '..') && !isSecretPath(path) && !isGeneratedPath(path);

function assertSequence(): void {
  if (expectedNames.length !== 37 || hash(JSON.stringify(expectedNames)) !== sequenceSha) throw Error('Verification sequence changed; evidence export requires an explicitly reviewed version.');
}

function runTimestamp(value: string): string {
  const match = /^\.local\/verification\/(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)$/.exec(value);
  if (!match) throw Error('Evidence must be a physical ignored verification directory.');
  const stamp = match[1]!.replace(/T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/, 'T$1:$2:$3.$4Z');
  if (!Number.isFinite(Date.parse(stamp)) || new Date(stamp).toISOString() !== stamp) throw Error('Invalid verification run timestamp.');
  return stamp;
}

/** Only an explicit operator can send local synthetic QA evidence; CI never inherits export authority. */
export function parseEvidenceArguments(args: string[], env: Record<string, string | undefined>): string {
  if (env.CI) throw Error('Operator-only evidence export refuses CI.');
  if (args.length !== 2 || args[0] !== '--evidence-directory') throw Error('Provide only --evidence-directory .local/verification/<run>.');
  runTimestamp(args[1]!);
  return args[1]!;
}

/** No endpoint, project, environment or capture mode can be selected from evidence files. */
export function parseEvidenceConfig(env: Record<string, string | undefined>): EvidenceConfig {
  const key = env.POSTHOG_PROJECT_KEY;
  if (env.CI || env.NODE_ENV === 'production' || env.POSTHOG_CAPTURE_MODE !== 'LIVE_SYNTHETIC' || env.POSTHOG_HOST !== 'https://us.i.posthog.com' || env.POSTHOG_PROJECT_ID !== '393668' || env.POSTHOG_ENVIRONMENT !== 'QA' || !key || key.length > 200 || /\s/.test(key) || [...key].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) throw Error('Invalid operator PostHog configuration.');
  return { host: 'https://us.i.posthog.com', projectId: 393668, projectKey: key };
}

function parseEvidence(value: unknown): Evidence {
  if (!object(value) || !keys(value, ['status', 'rows']) || !['VERIFIED', 'FAILED', 'NOT_VERIFIED'].includes(String(value.status)) || !Array.isArray(value.rows) || value.rows.length > expectedNames.length) throw Error('Invalid technical verification evidence.');
  const seen = new Set<string>();
  for (const row of value.rows) {
    if (!object(row) || !keys(row, ['name', 'exitCode', 'required', 'durationMs']) || typeof row.name !== 'string' || !names.has(row.name) || seen.has(row.name) || row.required !== true || (row.exitCode !== null && (!Number.isSafeInteger(row.exitCode) || typeof row.exitCode !== 'number' || row.exitCode < 0 || row.exitCode > 255)) || typeof row.durationMs !== 'number' || !Number.isSafeInteger(row.durationMs) || row.durationMs < 0) throw Error('Invalid technical verification evidence.');
    seen.add(row.name);
  }
  return value as Evidence;
}

function parseSource(value: unknown): Source[] {
  if (!Array.isArray(value) || !value.length || value.length > 50000) throw Error('Invalid source manifest.');
  const seen = new Set<string>();
  for (const row of value) {
    if (!object(row) || !keys(row, ['path', 'sha256']) || typeof row.path !== 'string' || !safePath(row.path) || seen.has(row.path) || typeof row.sha256 !== 'string' || !sha256.test(row.sha256)) throw Error('Invalid source manifest.');
    seen.add(row.path);
  }
  return value as Source[];
}

async function physicalDirectory(root: string, directory: string): Promise<void> {
  const physicalRoot = await realpath(root);
  for (const path of ['.local', '.local/verification', directory]) {
    const absolute = resolve(root, path);
    const entry = await lstat(absolute);
    if (!entry.isDirectory() || entry.isSymbolicLink() || (await realpath(absolute)) !== resolve(physicalRoot, path)) throw Error('Evidence must be a physical ignored verification directory.');
  }
  try { execFileSync('git', ['check-ignore', '--quiet', directory], { cwd: root, stdio: 'ignore' }); }
  catch { throw Error('Evidence must be a physical ignored verification directory.'); }
}

async function safeEvidenceFile(directory: string, name: string, optional = false): Promise<{ bytes: Buffer; value: unknown } | null> {
  const path = resolve(directory, name);
  try {
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8 * 1024 * 1024) throw Error('Invalid technical verification evidence file.');
    const bytes = await readFile(path);
    return { bytes, value: JSON.parse(bytes.toString('utf8')) as unknown };
  } catch (error) {
    if (optional && object(error) && error.code === 'ENOENT') return null;
    throw Error('Invalid technical verification evidence file.');
  }
}

/** Mirrors the exit runner's authored Git inventory, while refusing credentials/generated/symlink content. */
async function currentSources(root: string): Promise<Source[]> {
  const paths = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }).split('\0').filter(Boolean);
  const physicalRoot = await realpath(root);
  const rows: Source[] = [];
  for (const path of new Set(paths)) {
    if (!safePath(path)) throw Error('Current authored source inventory contains a forbidden path.');
    try {
      const absolute = resolve(root, path);
      const stat = await lstat(absolute);
      const target = await realpath(absolute);
      const resolvedPath = relative(physicalRoot, target);
      if (!stat.isFile() || stat.isSymbolicLink() || target !== resolve(physicalRoot, path) || isAbsolute(resolvedPath) || resolvedPath === '..' || resolvedPath.startsWith(`..${sep}`)) throw Error('Current authored source inventory contains a forbidden path.');
      rows.push({ path, sha256: hash(await readFile(absolute)) });
    } catch (error) {
      if (object(error) && error.code === 'ENOENT') continue;
      throw Error('Current authored source inventory cannot be verified.');
    }
  }
  return rows.sort((a, b) => a.path.localeCompare(b.path));
}

/** Export one aggregate, never stdout, scenario bodies, paths, identities or acceptance beyond the frozen run. */
export async function loadVerificationEvent(root: string, directory: string, now: () => Date = () => new Date()): Promise<VerificationEvent> {
  assertSequence();
  const timestamp = runTimestamp(directory);
  await physicalDirectory(root, directory);
  const absolute = resolve(root, directory);
  const evidenceFile = (await safeEvidenceFile(absolute, 'evidence.json'))!;
  const sourceFile = (await safeEvidenceFile(absolute, 'source.json'))!;
  const finalFile = await safeEvidenceFile(absolute, 'source-final.json', true);
  const evidence = parseEvidence(evidenceFile.value);
  const source = parseSource(sourceFile.value);
  const final = finalFile ? parseSource(finalFile.value) : null;
  const frozen = !!final && sameSourceManifest(source, final);
  const freezeRow = evidence.rows.find(row => row.name === 'source-freeze');
  if (freezeRow?.exitCode === 0 && !frozen) throw Error('Source freeze evidence is inconsistent.');
  const counts = { passed: 0, failed: 0, unexecuted: 0 };
  for (const name of expectedNames) {
    const row = evidence.rows.find(row => row.name === name);
    if (!row || row.exitCode === null) counts.unexecuted++;
    else if (row.exitCode === 0) counts.passed++;
    else counts.failed++;
  }
  const verified = evidence.status === 'VERIFIED' && counts.failed === 0 && counts.unexecuted === 0 && frozen;
  const current = await currentSources(root);
  const baseline = final ?? source;
  const exact = sameSourceManifest(baseline, current);
  // Documentation-only means .md bytes. JSON curriculum/source artifacts remain substantive.
  const runtimeUnchanged = sameSourceManifest(baseline.filter(row => !row.path.endsWith('.md')), current.filter(row => !row.path.endsWith('.md')));
  const sourceSha = hash(sourceFile.bytes);
  const finalSha = finalFile ? hash(finalFile.bytes) : null;
  const evidenceSha = hash(evidenceFile.bytes);
  const correlation = hash(`cuevo:technical:sequence1:${timestamp}:${sourceSha}:${finalSha ?? 'missing'}:${evidenceSha}`);
  const exportedAt = now().toISOString();
  // The runner can still be persisting a failed/incomplete run. Never mix two versions of its receipt.
  const latestEvidence = (await safeEvidenceFile(absolute, 'evidence.json'))!;
  const latestSource = (await safeEvidenceFile(absolute, 'source.json'))!;
  const latestFinal = await safeEvidenceFile(absolute, 'source-final.json', true);
  if (hash(latestEvidence.bytes) !== evidenceSha || hash(latestSource.bytes) !== sourceSha || (latestFinal ? hash(latestFinal.bytes) : null) !== finalSha) throw Error('Technical evidence changed during export.');
  return {
    event: 'cuevo_verification_completed', timestamp,
    properties: {
      distinct_id: `cuevo-qa-run:${hash(`cuevo:technical:run:${timestamp}:${sourceSha}`)}`, $insert_id: correlation,
      $process_person_profile: false, $ip: null, schema_version: 2, cuevo_source: 'cuevo-repository', data_class: 'SYNTHETIC', synthetic_environment: true,
      environment: 'QA', reporting_kind: 'TECHNICAL_VERIFICATION', technical_status: verified ? 'VERIFIED' : 'NOT_VERIFIED',
      required_rows: expectedNames.length, passed_rows: counts.passed, failed_rows: counts.failed, unexecuted_rows: counts.unexecuted,
      source_freeze_unchanged: frozen, runtime_source_unchanged: runtimeUnchanged,
      source_relation: exact ? 'EXACT_SOURCE' : runtimeUnchanged ? 'DOCUMENTATION_CHANGED' : 'HISTORICAL_SOURCE',
      verified_source_snapshot_sha256: verified ? finalSha : null, current_source_snapshot_sha256: hash(JSON.stringify(current)),
      evidence_sha256: evidenceSha, source_snapshot_sha256: sourceSha, source_final_snapshot_sha256: finalSha,
      verification_sequence_version: 1, verification_sequence_sha256: sequenceSha,
      run_correlation: correlation, run_started_at: timestamp, completion_timestamp_state: 'NOT_RECORDED', exported_at: exportedAt,
    },
  };
}

const propertyNames = ['distinct_id', '$insert_id', '$process_person_profile', '$ip', 'schema_version', 'cuevo_source', 'data_class', 'synthetic_environment', 'environment', 'reporting_kind', 'technical_status', 'required_rows', 'passed_rows', 'failed_rows', 'unexecuted_rows', 'source_freeze_unchanged', 'runtime_source_unchanged', 'source_relation', 'verified_source_snapshot_sha256', 'current_source_snapshot_sha256', 'evidence_sha256', 'source_snapshot_sha256', 'source_final_snapshot_sha256', 'verification_sequence_version', 'verification_sequence_sha256', 'run_correlation', 'run_started_at', 'completion_timestamp_state', 'exported_at'];
function validTimestamp(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
function assertMinimizedEvent(event: unknown): asserts event is VerificationEvent {
  assertSequence();
  const fail = () => { throw Error('Invalid minimized verification event.'); };
  if (!object(event) || !keys(event, ['event', 'timestamp', 'properties']) || event.event !== 'cuevo_verification_completed' || !validTimestamp(event.timestamp) || !object(event.properties) || !keys(event.properties, propertyNames)) return fail();
  const p = event.properties;
  if (p.$process_person_profile !== false || p.$ip !== null || p.schema_version !== 2 || p.cuevo_source !== 'cuevo-repository' || p.data_class !== 'SYNTHETIC' || p.synthetic_environment !== true || p.environment !== 'QA' || p.reporting_kind !== 'TECHNICAL_VERIFICATION' || !['VERIFIED', 'NOT_VERIFIED'].includes(String(p.technical_status)) || p.required_rows !== 37 || p.verification_sequence_version !== 1 || p.verification_sequence_sha256 !== sequenceSha || p.completion_timestamp_state !== 'NOT_RECORDED' || p.run_started_at !== event.timestamp || !validTimestamp(p.exported_at)) return fail();
  for (const key of ['passed_rows', 'failed_rows', 'unexecuted_rows']) if (typeof p[key] !== 'number' || !Number.isSafeInteger(p[key]) || p[key] < 0 || p[key] > 37) return fail();
  if (Number(p.passed_rows) + Number(p.failed_rows) + Number(p.unexecuted_rows) !== 37 || typeof p.source_freeze_unchanged !== 'boolean' || typeof p.runtime_source_unchanged !== 'boolean' || !['EXACT_SOURCE', 'DOCUMENTATION_CHANGED', 'HISTORICAL_SOURCE'].includes(String(p.source_relation)) || (p.source_relation === 'HISTORICAL_SOURCE') === p.runtime_source_unchanged) return fail();
  for (const key of ['$insert_id', 'run_correlation', 'source_snapshot_sha256', 'current_source_snapshot_sha256', 'evidence_sha256']) if (typeof p[key] !== 'string' || !sha256.test(p[key])) return fail();
  for (const key of ['source_final_snapshot_sha256', 'verified_source_snapshot_sha256']) if (p[key] !== null && (typeof p[key] !== 'string' || !sha256.test(p[key]))) return fail();
  const correlation = hash(`cuevo:technical:sequence1:${event.timestamp}:${p.source_snapshot_sha256}:${p.source_final_snapshot_sha256 ?? 'missing'}:${p.evidence_sha256}`);
  if (p.$insert_id !== correlation || p.run_correlation !== correlation || p.distinct_id !== `cuevo-qa-run:${hash(`cuevo:technical:run:${event.timestamp}:${p.source_snapshot_sha256}`)}` || (p.source_freeze_unchanged && p.source_final_snapshot_sha256 === null)) return fail();
  if (p.technical_status === 'VERIFIED') {
    if (p.passed_rows !== 37 || p.failed_rows !== 0 || p.unexecuted_rows !== 0 || p.source_freeze_unchanged !== true || p.verified_source_snapshot_sha256 === null || p.verified_source_snapshot_sha256 !== p.source_final_snapshot_sha256) return fail();
  } else if (p.verified_source_snapshot_sha256 !== null) return fail();
}

/** HTTP acceptance is an independent receipt; it never asserts indexed PostHog readback. */
export async function publishVerificationEvent(config: EvidenceConfig, event: VerificationEvent, request: typeof fetch = fetch, wait: (ms: number) => Promise<void> = ms => new Promise(resolveWait => setTimeout(resolveWait, ms))): Promise<EvidenceReceipt> {
  // Revalidate even when called outside the CLI. Destination and payload are fixed.
  parseEvidenceConfig({ POSTHOG_CAPTURE_MODE: 'LIVE_SYNTHETIC', POSTHOG_HOST: config.host, POSTHOG_PROJECT_ID: String(config.projectId), POSTHOG_ENVIRONMENT: 'QA', POSTHOG_PROJECT_KEY: config.projectKey });
  assertMinimizedEvent(event);
  const body = JSON.stringify({ api_key: config.projectKey, ...event });
  let outcome: EvidenceReceipt['capture_outcome'] = 'OUTCOME_UNKNOWN';
  let uncertain = false;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await request('https://us.i.posthog.com/i/v0/e/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: AbortSignal.timeout(3000), redirect: 'error', credentials: 'omit', cache: 'no-store' });
      void response.body?.cancel().catch(() => undefined);
      outcome = response.ok ? 'ACCEPTED' : 'RETRY_REQUIRED';
      if (outcome === 'ACCEPTED') return { capture_outcome: outcome, attempts: attempt, readback_status: 'NOT_VERIFIED', insert_id: event.properties.$insert_id };
    } catch { outcome = 'OUTCOME_UNKNOWN'; uncertain = true; }
    if (attempt < 3) await wait(attempt * 250);
  }
  return { capture_outcome: uncertain ? 'OUTCOME_UNKNOWN' : outcome, attempts: 3, readback_status: 'NOT_VERIFIED', insert_id: event.properties.$insert_id };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const directory = parseEvidenceArguments(process.argv.slice(2), process.env);
    const config = parseEvidenceConfig(process.env);
    const event = await loadVerificationEvent(process.cwd(), directory);
    const receipt = await publishVerificationEvent(config, event);
    console.log(JSON.stringify(receipt));
    if (receipt.capture_outcome !== 'ACCEPTED') process.exitCode = 1;
  } catch { console.error('Technical evidence export refused or could not be verified; no completion or PostHog readback claim is made.'); process.exitCode = 1; }
}
