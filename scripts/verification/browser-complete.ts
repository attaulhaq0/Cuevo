import { readFile, mkdir, open, rename, unlink } from 'node:fs/promises';
import { resolve, isAbsolute, relative } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { browserVerificationMetadata, parseBrowserInventory, validateBrowserRunReport, validateBrowserPhaseReceipt, accountBrowserFiles, ordinaryBrowserFiles, reviewedBrowserExclusions, type BrowserPhaseReceipt } from './browser-runtime-scope';
import { createConnection } from 'node:net';
import { parseEnv } from 'node:util';
import { verifyBrowserAccountPhases, validateAccountBrowserReport, restoreAccountBrowserState, requireStoppedBrowserPorts, type BrowserPortState } from './browser-account-phase';
import { configureLocalSchoolAccounts } from '../runtime/local-school-accounts';
import { cleanupAccountPhaseCaptures, snapshotAccountPhaseRequests, accountPhaseRequestDelta, verifyRestoredAccountReference, type AccountPhaseRequest } from './account-capture-cleanup';
import { spawnOwnedProcess, stopOwnedProcesses } from '../runtime/process';

let interrupted = false;
const ownedChildren = new Set<ReturnType<typeof spawnOwnedProcess>>();
const stop = () => { interrupted = true; void stopOwnedProcesses([...ownedChildren]).catch(() => { process.exitCode = 1; }); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
async function run(args: string[], env: NodeJS.ProcessEnv = process.env): Promise<number> {
  if (interrupted) throw Error('Browser verification was interrupted.');
  const child = spawnOwnedProcess(process.execPath, args, { env, stdio: 'inherit' });
  ownedChildren.add(child);
  try { return await new Promise<number>(done => { child.once('error', () => done(1)); child.once('close', code => done(code ?? 1)); }); }
  finally { await stopOwnedProcesses([child]); ownedChildren.delete(child); }
}
const probe = (port: number) => new Promise<BrowserPortState>(done => {
  const socket = createConnection({ host: '127.0.0.1', port }); let settled = false;
  const finish = (state: BrowserPortState) => { if (settled) return; settled = true; socket.destroy(); done(state); };
  socket.setTimeout(1000); socket.once('connect', () => finish('OPEN')); socket.once('timeout', () => finish('UNKNOWN'));
  socket.once('error', error => finish((error as NodeJS.ErrnoException).code === 'ECONNREFUSED' ? 'REFUSED' : 'UNKNOWN'));
});
async function stopped() {
  const deadline = Date.now() + 10000;
  for (;;) { try { await requireStoppedBrowserPorts(probe); return; } catch { if (Date.now() >= deadline) throw Error('Browser runtime shutdown is not confirmed.'); } await new Promise(done => setTimeout(done, 100)); }
}
async function save(path: string, value: unknown) {
  const pending = path + '.' + randomUUID() + '.pending'; let created = false;
  try { const handle = await open(pending, 'wx', 0o600); created = true; try { await handle.writeFile(JSON.stringify(value, null, 2) + '\n'); await handle.sync(); } finally { await handle.close(); } await rename(pending, path); }
  finally { if (created) await unlink(pending).catch(() => undefined); }
}
const accountConfig = 'scripts/verification/playwright.accounts.config.ts';
process.loadEnvFile(resolve('.env.local'));
const phaseStartedAt = Date.now();
const snapshot = async () => {
  const paths = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
  const manifest: { path: string; sha256: string }[] = [];
  for (const path of new Set(paths)) { try { manifest.push({ path, sha256: createHash('sha256').update(await readFile(path)).digest('hex') }); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; } }
  return createHash('sha256').update(JSON.stringify(manifest.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0))).digest('hex');
};
const initialSource = await snapshot(), sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const suppliedIdentity = browserVerificationMetadata().cuevoBrowserVerification;
const identity = suppliedIdentity ?? { runId: randomUUID(), sourceSha, sourceDigest: initialSource, scope: 'browser' };
if (identity.scope !== 'browser' || identity.sourceSha !== sourceSha || identity.sourceDigest !== initialSource) throw Error('Browser source and original verification identity are not confirmed.');
const receiptPath = process.env.CUEVO_VERIFICATION_BROWSER_RECEIPT_FILE;
if (receiptPath && (!isAbsolute(receiptPath) || relative(resolve('.local/verification'), receiptPath).startsWith('..') || isAbsolute(relative(resolve('.local/verification'), receiptPath)))) throw Error('Browser receipt must belong to the current local verification directory.');
const runId = randomUUID(); const directory = resolve('.local/customer-readiness/account-phase', runId); await mkdir(directory, { recursive: true });
const journal = { runId, startedAt: new Date().toISOString(), baseline: null as AccountPhaseRequest[] | null, owned: null as AccountPhaseRequest[] | null, ownership: 'PENDING', cleanup: 'PENDING' };
const journalPath = resolve(directory, 'recovery-journal.json'); await save(journalPath, journal);
const phaseEvidence: Partial<Pick<BrowserPhaseReceipt, 'account' | 'ordinary'>> = {};
async function verifyPhase(name: 'account' | 'ordinary', config: string, files: readonly string[], env: NodeJS.ProcessEnv) {
  const childIdentity = { ...identity, scope: name + '-browser' };
  const bound = { ...env, CUEVO_VERIFICATION_RUN_ID: identity.runId, CUEVO_VERIFICATION_SOURCE_SHA: identity.sourceSha, CUEVO_VERIFICATION_SOURCE_DIGEST: identity.sourceDigest, CUEVO_VERIFICATION_SCOPE: childIdentity.scope };
  const inventoryPath = resolve(directory, name + '-browser-inventory.json'), reportPath = resolve(directory, name + '-browser-results.json');
  const base = ['node_modules/@playwright/test/cli.js', 'test', '--config', config, '--forbid-only'];
  const listedAt = Date.now();
  if (await run([...base, '--list', '--reporter=json'], { ...bound, PLAYWRIGHT_JSON_OUTPUT_FILE: inventoryPath }) !== 0) return 1;
  const inventoryBytes = await readFile(inventoryPath, 'utf8');
  const inventory = parseBrowserInventory(JSON.parse(inventoryBytes), files, { ...childIdentity, startedAt: listedAt, finishedAt: Date.now() });
  const startedAt = Date.now();
  const code = await run([...base, '--reporter=list,json'], { ...bound, PLAYWRIGHT_JSON_OUTPUT_FILE: reportPath });
  await stopped();
  if (code !== 0) return code;
  const finishedAt = Date.now(), reportBytes = await readFile(reportPath, 'utf8'), report = JSON.parse(reportBytes);
  const completedTests = validateBrowserRunReport(report, inventory, { ...childIdentity, startedAt, finishedAt });
  if (name === 'account') validateAccountBrowserReport(report, startedAt, finishedAt);
  phaseEvidence[name] = { completedTests, inventorySha256: createHash('sha256').update(inventoryBytes).digest('hex'), reportSha256: createHash('sha256').update(reportBytes).digest('hex') };
  return 0;
}
const result = await verifyBrowserAccountPhases({
  account: async () => {
    await stopped(); journal.baseline = await snapshotAccountPhaseRequests(); journal.ownership = 'BASELINE_RECORDED'; await save(journalPath, journal);
    await configureLocalSchoolAccounts({ enabled: true, operatorId: '20000000-0000-4000-8000-000000000001', reason: 'Required guarded synthetic account browser acceptance' });
    const overlay = parseEnv(await readFile('.local/school-account.env', 'utf8'));
    return verifyPhase('account', accountConfig, accountBrowserFiles, { ...process.env, ...overlay });
  },
  restore: async () => restoreAccountBrowserState({
    stopped,
    journal: async () => {
      if (!journal.baseline) throw Error('Account phase baseline is unavailable.');
      try { journal.owned = accountPhaseRequestDelta(journal.baseline, await snapshotAccountPhaseRequests()); journal.ownership = 'CONFIRMED'; }
      catch { journal.ownership = 'REQUIRES_REVIEW'; await save(journalPath, journal); throw Error('Account capture ownership is not confirmed.'); }
      await save(journalPath, journal);
    },
    cleanup: async () => {
      if (!journal.owned) throw Error('Account capture ownership is unavailable.');
      try { await cleanupAccountPhaseCaptures(journal.owned); journal.cleanup = 'CONFIRMED_ABSENT'; }
      catch { journal.cleanup = 'REQUIRES_REVIEW'; throw Error('Account capture cleanup is not confirmed.'); }
      finally { await save(journalPath, journal); }
    },
    bootstrap: async () => {
      await stopped();
      const clean = { ...process.env }; for (const key of Object.keys(clean)) if (key.startsWith('CUEVO_AUTH_PROVISIONING_')) delete clean[key];
      return run(['--import', 'tsx', 'scripts/bootstrap-local.ts'], clean);
    },
    verify: async () => { if (interrupted) throw Error('Browser verification was interrupted.'); await verifyRestoredAccountReference(); },
    record: value => save(resolve(directory, 'restore.json'), value),
  }),
  ordinary: async () => {
    if (interrupted) throw Error('Browser verification was interrupted.'); await stopped();
    const clean = { ...process.env }; for (const key of Object.keys(clean)) if (key.startsWith('CUEVO_AUTH_PROVISIONING_')) delete clean[key];
    return verifyPhase('ordinary', 'scripts/verification/playwright.ordinary.config.ts', ordinaryBrowserFiles(), clean);
  },
  record: async value => { await save(resolve(directory, 'browser-phases.json'), { runId, ...value }); await save(resolve('.local/customer-readiness/browser-phases.json'), { runId, ...value }); },
});
if (result === 0) {
  if (await snapshot() !== initialSource || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() !== sourceSha || !phaseEvidence.account || !phaseEvidence.ordinary) throw Error('Browser source freeze or complete phase evidence is not confirmed.');
  const finishedAt = Date.now();
  const receipt: BrowserPhaseReceipt = { version: 1, identity, phaseRunId: runId, status: 'VERIFIED', startedAt: phaseStartedAt, finishedAt, account: phaseEvidence.account, ordinary: phaseEvidence.ordinary, excludedBrowserFiles: reviewedBrowserExclusions.map(({ file, reason }) => ({ file, reason })) };
  validateBrowserPhaseReceipt(receipt, identity, phaseStartedAt, finishedAt);
  await save(resolve(directory, 'receipt.json'), receipt);
  if (receiptPath) await save(receiptPath, receipt);
}
process.exitCode = result;
process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
