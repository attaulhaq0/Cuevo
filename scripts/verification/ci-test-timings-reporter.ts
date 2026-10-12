import { createHash,randomUUID } from 'node:crypto';
import{types}from'node:util';
import { lstat, readFile, realpath,writeFile,rename } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { createCiTestTimingCollector } from './ci-test-timings';
import type { CiTestTimingOptions } from './ci-test-timings';

async function confirmFileBytes(options: Omit<CiTestTimingOptions, 'now'>) {
  for (const file of options.files) {
    let current = options.repoRoot;
    for (const piece of [...file.path.split('/'), '']) {
      const stat = await lstat(current);
      if (stat.isSymbolicLink() || await realpath(current) !== current ||
          (piece ? !stat.isDirectory() : !stat.isFile() || stat.nlink !== 1 || stat.size > 16 * 1024 * 1024)) return false;
      if (piece) current = join(current, piece);
    }
    if (createHash('sha256').update(await readFile(current)).digest('hex') !== file.sha256) return false;
  }
  return options.identity.nodeVersion === process.version;
}

/** Structured Node reporter selected by the fixed source CI producer. */
export default async function* ciTestTimingsReporter(events: AsyncIterable<unknown>): AsyncGenerator<string, void> {
  let collector: ReturnType<typeof createCiTestTimingCollector> | null = null;
  let options: Omit<CiTestTimingOptions, 'now'> | null = null;
  try {
    const raw = process.env.CUEVO_CI_TEST_TIMING_INPUT;
    if (!raw || Buffer.byteLength(raw) > 256 * 1024) throw Error();
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed) ||
        Object.keys(parsed).sort().join(',') !== 'files,identity,repoRoot') throw Error();
    options = parsed as Omit<CiTestTimingOptions, 'now'>;
    const owner = await import(pathToFileURL(resolve(import.meta.dirname, 'ci-test-timings.ts')).href) as typeof import('./ci-test-timings');
    collector = owner.createCiTestTimingCollector({ ...options, now: Date.now });
  } catch {
    // Drain privately even when input is invalid; child logs and errors stay out
    // of the reporter's safe output and original Node exit behavior remains.
    let streamFailed = false;
    try { for await (const event of events) { void event; } }
    catch { streamFailed = true; }
    process.exitCode = 1;
    yield JSON.stringify({ version: 1, purpose: 'CUEVO_CI_TEST_TIMINGS', status: 'FAILED', effectAuthority: false, timeTargetAchieved: false, fileBytesConfirmed: false,
      reasons: streamFailed ? ['INPUT_REQUIRES_REVIEW', 'EVENT_STREAM_FAILED'] : ['INPUT_REQUIRES_REVIEW'] }) + '\n';
    return;
  }
  const before = await confirmFileBytes(options!).catch(() => false);
  let streamFailed = false;
  const progress=async()=>{const id=process.env.GITHUB_JOB?.replace(/^source-cohort-/,''),ids=['continuation-1','continuation-2','continuation-3','continuation-4','continuation-5','reconciliation-1','reconciliation-2'];if(!id||!ids.includes(id)||!options||process.env.GITHUB_WORKSPACE!==options.repoRoot||process.env.CI!=='true'||process.env.GITHUB_ACTIONS!=='true'||options.identity.scope!=='source-contracts'||options.identity.runId!==process.env.GITHUB_RUN_ID||options.identity.runAttempt!==Number(process.env.GITHUB_RUN_ATTEMPT)||options.files.length!==1||options.files[0].path!==(id.startsWith('continuation-')?'scripts/database/hosted-schema-continuation-executor.test.ts':'scripts/database/hosted-schema-reconciliation-executor.test.ts'))return;let parent=options.repoRoot;for(const piece of ['.local','verification','source-cohort-producers',id]){parent=join(parent,piece);const stat=await lstat(parent);if(!stat.isDirectory()||stat.isSymbolicLink()||await realpath(parent)!==parent)return;}const folder=parent;const path=join(folder,'progress.json'),bytes=JSON.stringify(collector!.progress());if(Buffer.byteLength(bytes)>256*1024)return;const temporary=path+'.'+randomUUID()+'.tmp';await writeFile(temporary,bytes,{flag:'wx',mode:0o600});await rename(temporary,path);};
  try { for await (const event of events){collector.consume(event);const type=typeof event==='object'&&event!==null&&!types.isProxy(event)?Object.getOwnPropertyDescriptor(event,'type')?.value:null;if(type==='test:complete'||type==='test:dequeue')await progress().catch(()=>undefined);} }
  catch { streamFailed = true; }
  const report = collector.finish();
  const after = await confirmFileBytes(options!).catch(() => false);
  report.fileBytesConfirmed = before && after;
  if (!report.fileBytesConfirmed) {
    report.status = 'FAILED';
    report.reasons.push('FILE_FAILED');
    report.reasons = [...new Set(report.reasons)].sort();
  }
  // Keep the collector's completed cases and its incomplete-coverage reasons.
  // Stream failures belong to this transport adapter; the thrown value is
  // deliberately neither inspected, serialized nor passed back to Node.
  const output = streamFailed ? { ...report, status: 'FAILED', reasons: [...report.reasons, 'EVENT_STREAM_FAILED'] } : report;
  const bytes = JSON.stringify(output);
  if (Buffer.byteLength(bytes) > 4 * 1024 * 1024) {
    process.exitCode = 1;
    yield JSON.stringify({ version: 1, purpose: 'CUEVO_CI_TEST_TIMINGS', status: 'FAILED', effectAuthority: false, timeTargetAchieved: false, fileBytesConfirmed: false, reasons: ['LIMIT_EXCEEDED'] }) + '\n';
    return;
  }
  if (output.status !== 'PASSED') process.exitCode = 1;
  yield bytes + '\n';
}
