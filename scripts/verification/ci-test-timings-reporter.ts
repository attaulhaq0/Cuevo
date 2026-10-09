import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
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
  try { for await (const event of events) collector.consume(event); }
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
