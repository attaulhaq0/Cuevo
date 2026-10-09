import { createConnection } from 'node:net';

export async function verifyBrowserAccountPhases(ports: { account(): Promise<number>; restore(): Promise<number>; ordinary(): Promise<number>; record(value: { account: number | null; restore: number | null; ordinary: number | null }): Promise<void> }) {
  const result = { account: null as number | null, restore: null as number | null, ordinary: null as number | null };
  try { result.account = await ports.account(); } catch { result.account = 1; }
  try { result.restore = await ports.restore(); } catch { result.restore = 1; }
  await ports.record(result);
  if (result.account !== 0 || result.restore !== 0) return 1;
  try { result.ordinary = await ports.ordinary(); } catch { result.ordinary = 1; }
  await ports.record(result); return result.ordinary;
}

const requiredAccountCases = new Map([
  ['account-admission-inert.spec.ts', 'account invitation landing is inert until explicit confirmation and rejects missing or malformed links'],
  ['school-account-admission.spec.ts', 'administrator invites a new learner and the recipient accepts, saves a password and opens the school workspace'],
  ['school-account-recovery.spec.ts', 'school administrator approves recovery and the member changes password, revokes old sessions and signs in again'],
]);
function object(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
/** The fresh unique report must prove each required identity actually passed once. */
export function validateAccountBrowserReport(input: unknown, startedAt: number, finishedAt: number): number {
  const invalid = () => Error('Required account browser execution is not confirmed.');
  if (!object(input) || !object(input.stats) || !Array.isArray(input.errors) || input.errors.length || !Array.isArray(input.suites) || !Number.isFinite(startedAt) || !Number.isFinite(finishedAt)) throw invalid();
  const time = Date.parse(String(input.stats.startTime));
  if (!Number.isFinite(time) || time < startedAt || time > finishedAt || input.stats.expected !== 3 || input.stats.unexpected !== 0 || input.stats.flaky !== 0 || input.stats.skipped !== 0) throw invalid();
  const seen = new Set<string>();
  const visit = (suites: unknown[]) => {
    for (const suite of suites) {
      if (!object(suite)) throw invalid();
      if (suite.suites !== undefined) { if (!Array.isArray(suite.suites)) throw invalid(); visit(suite.suites); }
      if (suite.specs === undefined) continue;
      if (!Array.isArray(suite.specs)) throw invalid();
      for (const spec of suite.specs) {
        if (!object(spec) || typeof spec.file !== 'string' || requiredAccountCases.get(spec.file) !== spec.title || seen.has(spec.file) || spec.ok !== true || !Array.isArray(spec.tests) || spec.tests.length !== 1) throw invalid();
        const test = spec.tests[0];
        if (!object(test) || test.expectedStatus !== 'passed' || test.status !== 'expected' || test.projectName !== 'production-chromium' || !Array.isArray(test.results) || test.results.length !== 1) throw invalid();
        const result = test.results[0];
        if (!object(result) || result.status !== 'passed' || result.retry !== 0 || !Array.isArray(result.errors) || result.errors.length || Date.parse(String(result.startTime)) < startedAt || Date.parse(String(result.startTime)) > finishedAt || !Number.isFinite(Date.parse(String(result.startTime)))) throw invalid();
        seen.add(spec.file);
      }
    }
  };
  visit(input.suites); if (seen.size !== requiredAccountCases.size) throw invalid(); return seen.size;
}

export type BrowserPortState = 'REFUSED' | 'OPEN' | 'UNKNOWN';
export async function requireStoppedBrowserPorts(probe: (port: number) => Promise<BrowserPortState>): Promise<void> {
  for (const port of [3000, 4000, 4001]) if (await probe(port) !== 'REFUSED') throw Error('Browser application stopped state is not confirmed.');
}
function probeStoppedBrowserPort(port:number):Promise<BrowserPortState>{return new Promise(done=>{
  const socket=createConnection({host:'127.0.0.1',port});let settled=false;
  const finish=(state:BrowserPortState)=>{if(settled)return;settled=true;socket.destroy();done(state);};
  socket.setTimeout(1000);socket.once('connect',()=>finish('OPEN'));socket.once('timeout',()=>finish('UNKNOWN'));
  socket.once('error',error=>finish((error as NodeJS.ErrnoException).code==='ECONNREFUSED'?'REFUSED':'UNKNOWN'));
});}
/** Fresh fixed application-port checks; stopped state is never cached between
 * resets, account phases or owned process launches. */
export async function waitForStoppedBrowserPorts():Promise<void>{
  const deadline=Date.now()+10000;
  for(;;){try{await requireStoppedBrowserPorts(probeStoppedBrowserPort);return;}catch{if(Date.now()>=deadline)throw Error('Browser application stopped state is not confirmed.');}await new Promise(done=>setTimeout(done,100));}
}

export type AccountRestoreEvidence = { stopped: number | null; journal: number | null; cleanup: number | null; bootstrap: number | null; verify: number | null };
/** Cleanup failure cannot suppress safe restoration or become a passing browser phase. */
export async function restoreAccountBrowserState(ports: { stopped(): Promise<void>; journal(): Promise<void>; cleanup(): Promise<void>; bootstrap(): Promise<number>; verify(): Promise<void>; record(value: AccountRestoreEvidence): Promise<void> }): Promise<number> {
  const result: AccountRestoreEvidence = { stopped: null, journal: null, cleanup: null, bootstrap: null, verify: null };
  try { await ports.stopped(); result.stopped = 0; } catch { result.stopped = 1; }
  if (result.stopped === 0) {
    try { await ports.journal(); result.journal = 0; } catch { result.journal = 1; }
    if (result.journal === 0) {
      try { await ports.cleanup(); result.cleanup = 0; } catch { result.cleanup = 1; }
      try { result.bootstrap = await ports.bootstrap(); } catch { result.bootstrap = 1; }
      try { await ports.stopped(); await ports.verify(); result.verify = 0; } catch { result.verify = 1; }
    }
  }
  await ports.record(result);
  return Object.values(result).every(value => value === 0) ? 0 : 1;
}
