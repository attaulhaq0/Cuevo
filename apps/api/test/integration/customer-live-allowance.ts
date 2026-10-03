import * as filesystem from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { withFixtureCleanup } from './fixture-cleanup';

export type LiveAllowanceFileSystem = Pick<typeof filesystem, 'open' | 'rename' | 'unlink' | 'mkdir' | 'stat'> & {
  readFile(path: string): Promise<Buffer>;
};
export type LiveAllowanceWriter = 'TRANSPORT_SMOKE' | 'AUTH_API_JOURNEY';
export type LiveAllowanceReservation = Readonly<{ version: 1; calls: number; reservationId: string; writer: LiveAllowanceWriter; status: 'ATTEMPT_RESERVED'; billedCost: null }>;

function hasCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

async function readLedger(path: string, io: LiveAllowanceFileSystem, fresh: boolean): Promise<Record<string, unknown>> {
  let bytes: Buffer;
  try { bytes = await io.readFile(path); }
  catch (error) { if (fresh && hasCode(error, 'ENOENT')) return { calls: 0 }; throw error; }
  let value: unknown;
  try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new Error('Live allowance ledger contains invalid JSON or UTF-8.'); }
  if (typeof value !== 'object' || value === null || Array.isArray(value)
    || !('calls' in value) || typeof value.calls !== 'number' || !Number.isSafeInteger(value.calls) || value.calls < 0 || value.calls > 3) {
    throw new Error('Live allowance ledger requires a safe integer call count from zero through three.');
  }
  return value as Record<string, unknown>;
}

async function atomicRecord(path: string, record: Record<string, unknown>, io: LiveAllowanceFileSystem): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`;
  const handle = await io.open(temporary, 'wx', 0o600);
  let renamed = false;
  await withFixtureCleanup(async () => {
    await withFixtureCleanup(async () => {
      await handle.writeFile(JSON.stringify(record, null, 2) + '\n', 'utf8');
      await handle.sync();
    }, [() => handle.close()]);
    await io.rename(temporary, path); renamed = true;
  }, [async () => { if (!renamed) await io.unlink(temporary); }]);
}

/** Test/operator-only allowance. Stale locks require review; failed attempts are never refunded. */
export async function withCustomerLiveAllowance<T>(
  options: { path: string; writer: LiveAllowanceWriter },
  action: (reservation: LiveAllowanceReservation) => Promise<{ result: T; receipt: Record<string, unknown> }>,
  io: LiveAllowanceFileSystem = filesystem,
): Promise<{ result: T; record: Record<string, unknown> }> {
  const path = resolve(options.path); const lockPath = `${path}.lock`;
  await io.mkdir(dirname(path), { recursive: true });
  const lock = await io.open(lockPath, 'wx', 0o600);
  const reservationId = randomUUID(); const lockBytes = JSON.stringify({ reservationId });
  let identity: Awaited<ReturnType<typeof lock.stat>> | undefined; let lockWritten = false;
  async function assertOwnedLock() {
    if (!identity) throw new Error('Live allowance lock identity is unavailable; requires review.');
    const current = await io.stat(lockPath);
    if (current.dev !== identity.dev || current.ino !== identity.ino
      || (lockWritten && (await io.readFile(lockPath)).toString('utf8') !== lockBytes)) {
      throw new Error('Live allowance lock identity changed; requires review.');
    }
  }
  return withFixtureCleanup(async () => {
    identity = await lock.stat();
    await lock.writeFile(lockBytes, 'utf8'); await lock.sync(); lockWritten = true;
    const prior = await readLedger(path, io, true);
    if (prior.calls === 3) throw new Error('Authorized model-call allowance exhausted.');
    const reservation: LiveAllowanceReservation = Object.freeze({ version: 1, calls: Number(prior.calls) + 1, reservationId,
      writer: options.writer, status: 'ATTEMPT_RESERVED', billedCost: null });
    await assertOwnedLock(); await atomicRecord(path, reservation, io);
    let record: Record<string, unknown> = { ...reservation, status: 'FAILED_REQUIRES_REVIEW' };
    return withFixtureCleanup(async () => {
      const completed = await action(reservation);
      if (typeof completed.receipt !== 'object' || completed.receipt === null || Array.isArray(completed.receipt)
        || ['version', 'calls', 'reservationId', 'writer'].some(key => Object.hasOwn(completed.receipt, key))) {
        throw new Error('Live allowance receipt cannot replace reservation identity.');
      }
      record = { ...reservation, ...completed.receipt, billedCost: null };
      return { result: completed.result, record };
    }, [async () => {
      await assertOwnedLock();
      const current = await readLedger(path, io, false);
      if (current.calls !== reservation.calls || current.reservationId !== reservationId
        || current.writer !== reservation.writer || current.version !== 1) {
        throw new Error('Live allowance reservation identity changed; refusing final overwrite.');
      }
      await atomicRecord(path, record, io);
    }]);
  }, [() => lock.close(), async () => { await assertOwnedLock(); await io.unlink(lockPath); }]);
}
