import { readFile, mkdir, open, rename, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
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
const runId = randomUUID(); const directory = resolve('.local/customer-readiness/account-phase', runId); await mkdir(directory, { recursive: true });
const journal = { runId, startedAt: new Date().toISOString(), baseline: null as AccountPhaseRequest[] | null, owned: null as AccountPhaseRequest[] | null, ownership: 'PENDING', cleanup: 'PENDING' };
const journalPath = resolve(directory, 'recovery-journal.json'); await save(journalPath, journal);
const result = await verifyBrowserAccountPhases({
  account: async () => {
    await stopped(); journal.baseline = await snapshotAccountPhaseRequests(); journal.ownership = 'BASELINE_RECORDED'; await save(journalPath, journal);
    await configureLocalSchoolAccounts({ enabled: true, operatorId: '20000000-0000-4000-8000-000000000001', reason: 'Required guarded synthetic account browser acceptance' });
    const overlay = parseEnv(await readFile('.local/school-account.env', 'utf8'));
    const reportPath = resolve(directory, 'account-browser-results.json'); const startedAt = Date.now();
    const code = await run(['node_modules/@playwright/test/cli.js', 'test', '--config', accountConfig, '--reporter=list,json'], { ...process.env, ...overlay, PLAYWRIGHT_JSON_OUTPUT_FILE: reportPath });
    await stopped();
    if (code !== 0) return code;
    validateAccountBrowserReport(JSON.parse(await readFile(reportPath, 'utf8')), startedAt, Date.now()); return 0;
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
    const code = await run(['node_modules/@playwright/test/cli.js', 'test', '--config', 'scripts/verification/playwright.ordinary.config.ts'], clean); await stopped(); return code;
  },
  record: async value => { await save(resolve(directory, 'browser-phases.json'), { runId, ...value }); await save(resolve('.local/customer-readiness/browser-phases.json'), { runId, ...value }); },
});
process.exitCode = result;
process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
