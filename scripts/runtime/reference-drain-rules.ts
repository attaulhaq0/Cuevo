const row = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const count = (value: unknown): number => { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw Error('Reference counts require confirmed nonnegative integers.'); return value; };
const referenceSchool = '10000000-0000-4000-8000-000000000001';
const denialSchool = '10000000-0000-4000-8000-000000000002';
const actorUuid = /^20000000-0000-4000-8000-[a-f0-9]{12}$/;

export function requireReferenceWorkerTarget(value: string | undefined) {
  let url: URL; try { url = new URL(value ?? ''); } catch { throw Error('Restricted local reference worker required.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !['127.0.0.1', 'localhost'].includes(url.hostname) || url.port !== '56322' || url.pathname !== '/postgres' || url.username !== 'cuevo_worker' || !url.password || url.search || url.hash) throw Error('Restricted local reference worker required.');
  return url.toString();
}

export function referenceManifest(value: unknown) {
  const source = row(value);
  if (source.synthetic !== true || source.schoolId !== referenceSchool || source.denialSchoolId !== denialSchool || !Array.isArray(source.actors) || !source.actors.length) throw Error('Confirmed synthetic reference manifest required.');
  const actors = source.actors.map(value => {
    const actor = row(value);
    if (typeof actor.actorId !== 'string' || !actorUuid.test(actor.actorId) || ![referenceSchool, denialSchool].includes(String(actor.schoolId))) throw Error('Confirmed synthetic reference identities required.');
    return { actorId: actor.actorId, schoolId: actor.schoolId as string };
  });
  if (new Set(actors.map(actor => actor.actorId)).size !== actors.length) throw Error('Reference identities must be distinct.');
  return { schoolId: referenceSchool, actors };
}

export function requireReferenceSnapshot(value: unknown) {
  const source = row(value);
  const pendingCount = count(source.pendingCount); const processingCount = count(source.processingCount); const failedCount = count(source.failedCount); const unsafeCount = count(source.unsafeCount); const nonWorkerCount = count(source.nonWorkerCount); const nonCompletedCount = count(source.nonCompletedCount);
  if (source.database !== 'postgres' || source.port !== 5432 || source.sessionUser !== 'postgres' || source.readOnly !== true || source.referenceActive !== true || source.populationMatches !== true || source.dispatchDisabled !== true || processingCount !== 0 || failedCount !== 0 || unsafeCount !== 0 || nonWorkerCount !== 0 || nonCompletedCount !== pendingCount + processingCount + failedCount) throw Error('Reference population, dispatch or unfinished source requires review.');
  return { pendingCount, nonCompletedCount };
}

export function requireReferenceHealth(value: unknown, pendingCount: number) {
  const source = row(value);
  if (source.scope !== 'WORKER' || source.ready !== true || count(source.pendingCount) !== pendingCount || count(source.failedCount) !== 0) throw Error('Reference worker health or source counts require review.');
}

export function requireReferenceProgress(value: unknown) {
  const source = row(value); const attempted = count(source.attempted); const processed = count(source.processed);
  if (attempted < 1 || attempted > 10 || processed !== attempted || source.reviewRequired !== false || source.failureReceiptUnknown !== false || source.executionUnavailable !== false || typeof source.deadlineReached !== 'boolean') throw Error('Reference processing did not confirm every bounded receipt.');
  return processed;
}

export async function drainReference(input: { inspect: () => Promise<unknown>; health: () => Promise<unknown>; process: (value: { maxEvents: number; deadline: number; now: () => number }) => Promise<unknown>; now?: () => number }) {
  const now = input.now ?? Date.now; const start = now(); const deadline = start + 120000;
  if (!Number.isFinite(start)) throw Error('Reference execution clock required.');
  let processed = 0;
  for (let attempt = 0; attempt < 100; attempt++) {
    const snapshot = requireReferenceSnapshot(await input.inspect());
    requireReferenceHealth(await input.health(), snapshot.pendingCount);
    if (snapshot.nonCompletedCount === 0) {
      const final = requireReferenceSnapshot(await input.inspect()); requireReferenceHealth(await input.health(), final.pendingCount);
      if (final.nonCompletedCount !== 0) throw Error('Reference sources changed during final confirmation.');
      return { processed };
    }
    const current = now();
    if (!Number.isFinite(current) || deadline - current < 15000) throw Error('Reference execution deadline reached with unfinished work.');
    processed += requireReferenceProgress(await input.process({ maxEvents: 10, deadline: Math.min(deadline, current + 20000), now }));
  }
  throw Error('Reference event drain exceeded its bounded execution.');
}
