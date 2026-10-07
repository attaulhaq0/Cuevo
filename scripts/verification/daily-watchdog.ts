import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { fullRegressionJobPolicy, validateFullRegressionWorkflow } from './verification-workflows';

// Reuses the GET-only obligation owner from daily-regression source b74b2e74.
// Current workflow and successful job inventory are owned by verification-workflows.

const repository = 'attaulhaq0/Cuevo', workflowPath = '.github/workflows/full-regression.yml';
const apiBase = `https://api.github.com/repos/${repository}`;
const yaml = createRequire(import.meta.url)('js-yaml') as { load(text: string): unknown };
const day = 86400000, grace = 3 * 3600000, minute17 = 17 * 60000;
const positive = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const sha = z.string().regex(/^[a-f0-9]{40}$/), timestamp = z.iso.datetime({ offset: true });
const pending = ['queued', 'requested', 'waiting', 'pending', 'in_progress'] as const;
const conclusions = ['success', 'failure', 'timed_out', 'cancelled', 'action_required', 'stale', 'neutral', 'skipped', 'startup_failure'] as const;
const jobNames = Object.keys(fullRegressionJobPolicy);
type Row = Record<string, unknown>;
type Transport = (url: string, init: RequestInit) => Promise<Response>;
type State = 'GRACE_PENDING' | 'REGRESSION_VERIFIED' | 'MISSING' | 'OVERDUE_PENDING' | 'REGRESSION_FAILED' | 'CONFIGURATION_REVIEW' | 'UNVERIFIABLE';
const fail = () => Error('Daily regression observation requires review; contents withheld.');
const map = (value: unknown): Row => value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {};
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

/** Latest overdue obligation, preserving the prior day during the next slot's grace. */
export function planDailyRegressionSlot(now: number, firstExpectedDate: string) {
  if (!Number.isSafeInteger(now) || now < 0 || now > 8640000000000000 || typeof firstExpectedDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(firstExpectedDate)) throw fail();
  const activation = Date.parse(firstExpectedDate + 'T00:00:00Z');
  if (!Number.isFinite(activation) || new Date(activation).toISOString().slice(0, 10) !== firstExpectedDate || activation > now) throw fail();
  const firstSlot = activation + minute17, utcDay = Math.floor((now - grace - minute17) / day) * day;
  const slot = utcDay + minute17;
  if (slot < firstSlot) return { state: 'GRACE_PENDING' as const, slotUtc: new Date(firstSlot).toISOString(), deadlineUtc: new Date(firstSlot + grace).toISOString(), windowEndUtc: null };
  return { state: 'ELIGIBLE' as const, slotUtc: new Date(slot).toISOString(), deadlineUtc: new Date(slot + grace).toISOString(), windowEndUtc: new Date(Math.min(slot + day, now)).toISOString() };
}

export function readDailyWatchdogContext(env: Record<string, string | undefined>, checkoutSha: string) {
  if (env.CI !== 'true' || env.GITHUB_ACTIONS !== 'true' || env.RUNNER_ENVIRONMENT !== 'github-hosted'
    || env.GITHUB_SERVER_URL !== 'https://github.com' || env.GITHUB_API_URL !== 'https://api.github.com'
    || env.GITHUB_REPOSITORY !== repository || env.GITHUB_REF !== 'refs/heads/main' || env.GITHUB_SHA !== checkoutSha || !sha.safeParse(checkoutSha).success
    || env.GITHUB_JOB !== 'watchdog' || env.GITHUB_WORKFLOW !== 'Cuevo daily regression watchdog'
    || env.GITHUB_WORKFLOW_REF !== `${repository}/.github/workflows/daily-watchdog.yml@refs/heads/main`
    || env.GITHUB_WORKFLOW_SHA !== checkoutSha || env.NODE_OPTIONS
    || !['schedule', 'workflow_dispatch'].includes(env.GITHUB_EVENT_NAME ?? '')
    || (env.GITHUB_EVENT_NAME === 'schedule' ? env.CUEVO_WATCHDOG_SCHEDULE !== '47 * * * *' : !!env.CUEVO_WATCHDOG_SCHEDULE)) throw fail();
  return { repository, checkoutSha, firstExpectedDate: env.CUEVO_DAILY_REGRESSION_FIRST_EXPECTED_DATE,
    token: z.string().min(1).max(24576).regex(/^[\x21-\x7e]+$/).parse(env.GH_TOKEN) };
}

function sourceConfiguration(text: string) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > 48 * 1024 || validateFullRegressionWorkflow(text).length) throw fail();
}

const runSchema = z.object({ id: positive, run_attempt: positive, workflow_id: positive, head_sha: sha, head_branch: z.literal('main'), event: z.literal('schedule'),
  path: z.literal(workflowPath), status: z.enum([...pending, 'completed']), conclusion: z.enum(conclusions).nullable(),
  created_at: timestamp, updated_at: timestamp, run_started_at: timestamp.nullable(), repository: z.object({ id: positive, full_name: z.literal(repository) }),
  head_repository: z.object({ id: positive, full_name: z.literal(repository) }), pull_requests: z.array(z.unknown()).length(0), url: z.string(), html_url: z.string() });
type Run = z.infer<typeof runSchema>;
const jobSchema = z.object({ id: positive, name: z.string().min(1).max(200), run_id: positive, run_attempt: positive.optional(), head_sha: sha, workflow_name: z.literal('Cuevo full regression').optional(),
  status: z.enum(['queued', 'in_progress', 'completed', 'waiting', 'pending']), conclusion: z.enum(conclusions).nullable(), started_at: timestamp.nullable(), completed_at: timestamp.nullable(), url: z.string(), html_url: z.string() });

function parseRun(value: unknown, repositoryId: number, workflowId: number, now: number): Run {
  const run = runSchema.parse(value), created = Date.parse(run.created_at), updated = Date.parse(run.updated_at);
  if (run.repository.id !== repositoryId || run.head_repository.id !== repositoryId || run.workflow_id !== workflowId
    || run.url !== `${apiBase}/actions/runs/${run.id}` || run.html_url !== `https://github.com/${repository}/actions/runs/${run.id}`
    || created > now || updated > now || updated < created || run.run_started_at !== null && (Date.parse(run.run_started_at) < created || Date.parse(run.run_started_at) > updated)
    || (run.status === 'completed') !== (run.conclusion !== null)) throw fail();
  return run;
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((done, reject) => {
    const abort = () => { signal.removeEventListener('abort', abort); reject(fail()); };
    if (signal.aborted) return abort();
    signal.addEventListener('abort', abort, { once: true });
    void promise.then(value => { signal.removeEventListener('abort', abort); if (signal.aborted) reject(fail()); else done(value); }, () => { signal.removeEventListener('abort', abort); reject(fail()); });
  });
}
async function body(response: Response, signal: AbortSignal) {
  if (response.status !== 200 || response.redirected || !response.body || !/^application\/json(?:;|$)/i.test(response.headers.get('content-type') ?? '')) throw fail();
  const declared = response.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > 2 * 1024 * 1024)) throw fail();
  const reader = response.body.getReader(), parts: Uint8Array[] = []; let size = 0;
  try { for (;;) {
    const part = await abortable(reader.read(), signal); if (part.done) break;
    size += part.value.byteLength; if (size > 2 * 1024 * 1024) throw fail(); parts.push(part.value);
  } return JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(Buffer.concat(parts))) as unknown; }
  finally { void reader.cancel().catch(() => undefined); try { reader.releaseLock(); } catch { /* Cancelled pending reads retain their cleanup. */ } }
}

function nextPage(link: string | null, current: URL): boolean {
  if (link === null) return false;
  if (!link.length || link.length > 16384) throw fail();
  const relations = new Set<string>(); let next = false;
  for (const part of link.split(',')) {
    const match = /^\s*<([^>]+)>;\s*rel="(next|prev|first|last)"\s*$/.exec(part); if (!match) throw fail();
    const [, raw, relation] = match, url = new URL(raw), page = url.searchParams.get('page');
    if (relations.has(relation) || !page || !/^[1-9][0-9]*$/.test(page) || Number(page) > 10 || url.username || url.password || url.hash || url.origin !== current.origin || url.pathname !== current.pathname) throw fail();
    relations.add(relation); const expected = new URL(current); expected.searchParams.set('page', page);
    if (!same([...url.searchParams].sort(), [...expected.searchParams].sort())) throw fail();
    const actual = Number(current.searchParams.get('page'));
    if (relation === 'next') { if (Number(page) !== actual + 1) throw fail(); next = true; }
    if (relation === 'prev' && Number(page) !== actual - 1 || relation === 'first' && Number(page) !== 1 || relation === 'last' && Number(page) < actual) throw fail();
  }
  return next;
}

/** Read-only official metadata observer. No logs/artifacts, retries or provider writes. */
export async function observeDailyRegression(value: Row, transport: Transport = fetch) {
  const now = value.now as number;
  const result = { version: 1, repository, workflowId: null as number | null, observedUtc: Number.isSafeInteger(now) && now >= 0 && now <= 8640000000000000 ? new Date(now).toISOString() : null,
    slotUtc: null as string | null, deadlineUtc: null as string | null, windowEndUtc: null as string | null,
    currentMainSha: null as string | null, testedSha: null as string | null, runId: null as number | null, runAttempt: null as number | null,
    runStatus: null as string | null, runConclusion: null as string | null, runUrl: null as string | null, deadlineMet: null as boolean | null, recoveredLate: null as boolean | null,
    state: 'UNVERIFIABLE' as State, reason: 'METADATA_UNAVAILABLE' };
  let slot: ReturnType<typeof planDailyRegressionSlot>;
  try { slot = planDailyRegressionSlot(now, value.firstExpectedDate as string); sourceConfiguration(value.fullWorkflowText as string); }
  catch { return { ...result, state: 'CONFIGURATION_REVIEW' as State, reason: 'ACTIVATION_OR_SOURCE_REVIEW' }; }
  Object.assign(result, { slotUtc: slot.slotUtc, deadlineUtc: slot.deadlineUtc, windowEndUtc: slot.windowEndUtc });
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 60000);
  try {
    const input = z.object({ repository: z.literal(repository), token: z.string().min(1).max(24576).regex(/^[\x21-\x7e]+$/), checkoutSha: sha }).parse(value);
    const get = async (url: URL | string) => {
      const raw = url.toString(), signal = AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]);
      if (!raw.startsWith(apiBase + '/') && raw !== apiBase) throw fail();
      const response = await abortable(transport(raw, { method: 'GET', redirect: 'error', credentials: 'omit', cache: 'no-store',
        headers: { Authorization: 'Bearer ' + input.token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, signal }), signal);
      if (response.url && response.url !== raw) throw fail();
      return { value: await body(response, signal), link: response.headers.get('link') };
    };
    const repo = z.object({ id: positive, full_name: z.literal(repository), default_branch: z.string(), url: z.literal(apiBase) }).parse((await get(apiBase)).value);
    const main = z.object({ ref: z.literal('refs/heads/main'), object: z.object({ type: z.literal('commit'), sha }) }).parse((await get(apiBase + '/git/ref/heads/main')).value);
    result.currentMainSha = main.object.sha;
    const workflow = z.object({ id: positive, name: z.literal('Cuevo full regression'), path: z.literal(workflowPath), state: z.string(), url: z.string() }).parse((await get(apiBase + '/actions/workflows/full-regression.yml')).value);
    result.workflowId = workflow.id;
    if (repo.default_branch !== 'main' || workflow.state !== 'active' || workflow.url !== `${apiBase}/actions/workflows/${workflow.id}`) return { ...result, state: 'CONFIGURATION_REVIEW' as State, reason: 'WORKFLOW_CONFIGURATION_REVIEW' };
    if (slot.state === 'GRACE_PENDING') return { ...result, state: 'GRACE_PENDING' as State, reason: 'FIRST_SLOT_GRACE' };
    const collection = async (path: string, field: 'workflow_runs' | 'jobs', query: Record<string, string>) => {
      const rows: unknown[] = [], ids = new Set<number>(); let total: number | undefined;
      for (let page = 1; page <= 10; page++) {
        const url = new URL(apiBase + path);
        for (const [key, item] of Object.entries({ ...query, per_page: '100', page: String(page) })) url.searchParams.set(key, item);
        const response = await get(url), data = map(response.value), count = z.number().int().nonnegative().max(1000).parse(data.total_count);
        if (total !== undefined && total !== count || !Array.isArray(data[field]) || data[field].length > 100) throw fail();
        total = count;
        for (const row of data[field]) { const id = positive.parse(map(row).id); if (ids.has(id)) throw fail(); ids.add(id); rows.push(row); }
        if (rows.length > total) throw fail(); const next = nextPage(response.link, url);
        if (!next) { if (rows.length !== total) throw fail(); return rows; }
        if (!data[field].length || rows.length >= total) throw fail();
      }
      throw fail();
    };
    const listRuns = async () => {
      const rows = await collection(`/actions/workflows/${workflow.id}/runs`, 'workflow_runs', { branch: 'main', event: 'schedule', created: slot.slotUtc + '..' + slot.windowEndUtc, exclude_pull_requests: 'true' });
      const parsed = rows.map(row => parseRun(row, repo.id, workflow.id, now));
      if (parsed.some(run => Date.parse(run.created_at) < Date.parse(slot.slotUtc) || Date.parse(run.created_at) > Date.parse(slot.windowEndUtc!))) throw fail();
      return parsed.filter(run => Date.parse(run.created_at) >= Date.parse(slot.slotUtc) && Date.parse(run.created_at) < Date.parse(slot.windowEndUtc!))
        .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at) || right.id - left.id);
    };
    const initial = await listRuns();
    if (!initial.length) {
      if (!same(initial, await listRuns())) throw fail();
      return { ...result, state: 'MISSING' as State, reason: 'NO_SCHEDULED_RUN_IN_WINDOW' };
    }
    const selected = initial[0], current = parseRun((await get(`${apiBase}/actions/runs/${selected.id}`)).value, repo.id, workflow.id, now);
    if (!same(selected, current)) throw fail();
    Object.assign(result, { testedSha: selected.head_sha, runId: selected.id, runAttempt: selected.run_attempt, runStatus: selected.status, runConclusion: selected.conclusion, runUrl: selected.html_url });
    let state: State = selected.status === 'completed' ? 'REGRESSION_FAILED' : 'OVERDUE_PENDING', reason = selected.status === 'completed' ? 'TERMINAL_' + selected.conclusion!.toUpperCase() : 'UNFINISHED_AFTER_GRACE';
    if (selected.conclusion === 'success') {
      const rows = (await collection(`/actions/runs/${selected.id}/attempts/${selected.run_attempt}/jobs`, 'jobs', {})).map(row => jobSchema.parse(row));
      const names = new Set<string>();
      for (const row of rows) {
        if (names.has(row.name) || row.run_id !== selected.id || row.run_attempt !== undefined && row.run_attempt !== selected.run_attempt || row.head_sha !== selected.head_sha || row.url !== `${apiBase}/actions/jobs/${row.id}`
          || ![`${selected.html_url}/job/${row.id}`, `https://github.com/${repository}/runs/${selected.id}/jobs/${row.id}`].includes(row.html_url)
          || row.started_at !== null && (Date.parse(row.started_at) < Date.parse(selected.created_at) || Date.parse(row.started_at) > now)
          || row.completed_at !== null && (Date.parse(row.completed_at) > now || Date.parse(row.completed_at) < Date.parse(selected.created_at)
            || Date.parse(row.completed_at) > Date.parse(selected.updated_at) || row.started_at !== null && Date.parse(row.completed_at) < Date.parse(row.started_at))
          || (row.status === 'completed') !== (row.conclusion !== null) || row.status === 'completed' && (row.completed_at === null || row.started_at === null)) throw fail();
        names.add(row.name);
      }
      const complete = same([...names].sort(), [...jobNames].sort()) && rows.every(row => row.status === 'completed' && row.conclusion === 'success');
      if (complete) {
        const completed = Math.max(...rows.map(row => Date.parse(row.completed_at!)));
        result.deadlineMet = completed <= Date.parse(slot.deadlineUtc); result.recoveredLate = !result.deadlineMet;
        state = 'REGRESSION_VERIFIED'; reason = result.deadlineMet ? 'SCHEDULED_WINDOW_VERIFIED' : 'LATE_WINDOW_RECOVERY';
      } else reason = 'MANDATORY_JOB_GATE_FAILED';
    }
    const final = parseRun((await get(`${apiBase}/actions/runs/${selected.id}`)).value, repo.id, workflow.id, now);
    if (!same(selected, final) || !same(initial, await listRuns())) throw fail();
    return { ...result, state, reason };
  } catch { return { ...result, state: 'UNVERIFIABLE' as State, reason: 'METADATA_UNAVAILABLE', deadlineMet: null, recoveredLate: null }; }
  finally { clearTimeout(timer); controller.abort(); }
}

export function dailyWatchdogExitCode(result: Row) { return ['REGRESSION_VERIFIED', 'GRACE_PENDING'].includes(String(result.state)) ? 0 : 1; }

/** Exact workflow source contract; no provider settings or notification authority. */
export function validateDailyWatchdogWorkflow(text: string): string[] {
  try {
    if (typeof text !== 'string' || Buffer.byteLength(text) > 48 * 1024) throw fail();
    const expected = { name: 'Cuevo daily regression watchdog', on: { schedule: [{ cron: '47 * * * *' }], workflow_dispatch: null }, permissions: { contents: 'read', actions: 'read' },
      concurrency: { group: 'cuevo-daily-watchdog', 'cancel-in-progress': false }, env: { CI: 'true', NEXT_TELEMETRY_DISABLED: '1', SCARF_ANALYTICS: 'false' },
      jobs: { watchdog: { if: "github.repository == 'attaulhaq0/Cuevo' && github.ref == 'refs/heads/main'", 'runs-on': 'ubuntu-latest', 'timeout-minutes': 5, steps: [
        { uses: 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1', with: { 'persist-credentials': false } },
        { uses: 'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020', with: { 'node-version': '24.16.0', cache: 'npm' } },
        { run: 'npm install --global npm@11.17.0 --ignore-scripts --no-audit --no-fund' }, { run: 'npm ci --ignore-scripts --no-audit --no-fund' }, { run: 'node node_modules/esbuild/install.js' },
        { name: 'Observe latest eligible daily regression with read-only GitHub metadata', env: { GH_TOKEN: '${{ github.token }}', CUEVO_WATCHDOG_SCHEDULE: '${{ github.event.schedule }}', CUEVO_DAILY_REGRESSION_FIRST_EXPECTED_DATE: '${{ vars.CUEVO_DAILY_REGRESSION_FIRST_EXPECTED_DATE }}' }, run: 'node --import tsx scripts/verification/daily-watchdog.ts' },
      ] } } };
    const normalize = (value: unknown): unknown => Array.isArray(value) ? value.map(normalize) : value && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, normalize(item)])) : value;
    if (!same(normalize(yaml.load(text)), normalize(expected))) return ['Daily watchdog must preserve its exact main-only hourly/manual GET-only source contract.'];
    return [];
  } catch { return ['Daily watchdog workflow source is unavailable or requires review.']; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 2) throw fail();
    const gitEnv = Object.fromEntries(['PATH', 'Path', 'SystemRoot', 'WINDIR'].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]])
      .concat([['GIT_NO_REPLACE_OBJECTS', '1'], ['GIT_CONFIG_NOSYSTEM', '1'], ['GIT_CONFIG_GLOBAL', process.platform === 'win32' ? 'NUL' : '/dev/null']]));
    const checkout = execFileSync('git', ['rev-parse', '--verify', 'HEAD^{commit}'], { env: gitEnv, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], timeout: 5000 }).toString().trim();
    const context = readDailyWatchdogContext(process.env, checkout);
    const fullWorkflowText = await readFile(resolve('.github/workflows/full-regression.yml'), 'utf8');
    const result = await observeDailyRegression({ ...context, fullWorkflowText, now: Date.now() });
    console.log(JSON.stringify(result)); process.exitCode = dailyWatchdogExitCode(result);
  } catch { console.log(JSON.stringify({ version: 1, repository, state: 'UNVERIFIABLE', reason: 'TRUSTED_CONTEXT_UNAVAILABLE' })); process.exitCode = 1; }
}
