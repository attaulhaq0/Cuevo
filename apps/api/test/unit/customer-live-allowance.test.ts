import { describe, expect, it } from 'vitest';
import * as filesystem from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { withCustomerLiveAllowance as run, type LiveAllowanceFileSystem } from '../integration/customer-live-allowance';
import { withFixtureCleanup } from '../integration/fixture-cleanup';

async function temporaryCase(action: (path: string) => Promise<void>) {
  const folder = await filesystem.mkdtemp(join(tmpdir(), 'cuevo-live-allowance-'));
  await withFixtureCleanup(() => action(join(folder, 'ledger.json')), [() => filesystem.rm(folder, { recursive: true, force: true })]);
}
const options = (path: string) => ({ path, writer: 'TRANSPORT_SMOKE' as const });
const read = async (path: string) => JSON.parse(await filesystem.readFile(path, 'utf8')) as Record<string, unknown>;
const action = async () => ({ result: 42, receipt: { status: 'VERIFIED', billedCost: null } });
const fault = (code: string) => Object.assign(new Error(code), { code });

describe('shared offline live allowance', () => {
  it('durably reserves a fresh missing ledger before the action and retains only the new receipt', async () => temporaryCase(async path => {
    let invoked = 0;
    const completed = await run(options(path), async reservation => {
      invoked++;
      expect(await read(path)).toMatchObject({ calls: 1, status: 'ATTEMPT_RESERVED', reservationId: reservation.reservationId });
      expect(await filesystem.readFile(`${path}.lock`, 'utf8')).toContain(reservation.reservationId);
      return action();
    });
    expect(invoked).toBe(1); expect(completed.result).toBe(42);
    expect(await read(path)).toEqual(completed.record);
    expect(completed.record).toMatchObject({ calls: 1, writer: 'TRANSPORT_SMOKE', status: 'VERIFIED', billedCost: null });
    await expect(filesystem.stat(`${path}.lock`)).rejects.toMatchObject({ code: 'ENOENT' });
  }));

  it('reserves the final allowed call without copying old receipt fields', async () => temporaryCase(async path => {
    await filesystem.writeFile(path, JSON.stringify({ calls: 2, oldPrivateField: 'must not propagate' }));
    const result = await run(options(path), action);
    expect(result.record.calls).toBe(3); expect(result.record).not.toHaveProperty('oldPrivateField');
    let invoked = false;
    await expect(run(options(path), async () => { invoked = true; return action(); })).rejects.toThrow('exhausted');
    expect(invoked).toBe(false); expect(await read(path)).toEqual(result.record);
  }));

  it.each(['{', 'null', '[]', '{}', '{"calls":"1"}', '{"calls":-1}', '{"calls":0.5}', '{"calls":4}', '{"calls":9007199254740992}', '{"calls":1e400}', '{"calls":null}'])(
    'rejects malformed or invalid ledger %s without resetting allowance', async bytes => temporaryCase(async path => {
      await filesystem.writeFile(path, bytes); let invoked = false;
      await expect(run(options(path), async () => { invoked = true; return action(); })).rejects.toThrow('ledger');
      expect(invoked).toBe(false); expect(await filesystem.readFile(path, 'utf8')).toBe(bytes);
      await expect(filesystem.stat(`${path}.lock`)).rejects.toMatchObject({ code: 'ENOENT' });
    }));

  it('rejects invalid UTF-8 bytes rather than decoding them as replacement text', async () => temporaryCase(async path => {
    const bytes = Buffer.from([0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xff, 0x22, 0x2c, 0x22, 0x63, 0x61, 0x6c, 0x6c, 0x73, 0x22, 0x3a, 0x30, 0x7d]);
    await filesystem.writeFile(path, bytes); let invoked = false;
    await expect(run(options(path), async () => { invoked = true; return action(); })).rejects.toThrow('ledger');
    expect(invoked).toBe(false); expect(await filesystem.readFile(path)).toEqual(bytes);
  }));

  it('fails closed on a non-ENOENT ledger read error', async () => temporaryCase(async path => {
    const original = fault('EACCES'); let invoked = false;
    const io: LiveAllowanceFileSystem = { ...filesystem, readFile: async file => {
      if (file === path) throw original;
      return filesystem.readFile(file);
    } };
    await expect(run(options(path), async () => { invoked = true; return action(); }, io)).rejects.toBe(original);
    expect(invoked).toBe(false);
    await expect(filesystem.stat(path)).rejects.toMatchObject({ code: 'ENOENT' });
  }));

  it('does not reclaim or remove a pre-existing lock', async () => temporaryCase(async path => {
    await filesystem.writeFile(`${path}.lock`, 'another invocation'); let invoked = false;
    await expect(run(options(path), async () => { invoked = true; return action(); })).rejects.toMatchObject({ code: 'EEXIST' });
    expect(invoked).toBe(false); expect(await filesystem.readFile(`${path}.lock`, 'utf8')).toBe('another invocation');
  }));

  it('holds the lock across a settled callback and prevents concurrent writers from sharing one reservation', async () => temporaryCase(async path => {
    let release!: () => void; let started!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; }); const entered = new Promise<void>(resolve => { started = resolve; });
    const first = run(options(path), async () => { started(); await held; return action(); });
    const firstResult = first.catch(error => error);
    await Promise.race([entered, first]); let secondInvoked = false;
    await expect(run({ path, writer: 'AUTH_API_JOURNEY' }, async () => { secondInvoked = true; return action(); })).rejects.toMatchObject({ code: 'EEXIST' });
    expect(secondInvoked).toBe(false); expect((await read(path)).calls).toBe(1);
    release(); expect(await firstResult).toMatchObject({ result: 42, record: { calls: 1 } });
    expect((await run({ path, writer: 'AUTH_API_JOURNEY' }, action)).record.calls).toBe(2);
  }));

  it('preserves a consumed reservation and original callback error without retry or refund', async () => temporaryCase(async path => {
    const original = new Error('provider failed'); let invoked = 0;
    await expect(run(options(path), async () => { invoked++; throw original; })).rejects.toBe(original);
    expect(invoked).toBe(1); expect(await read(path)).toMatchObject({ calls: 1, status: 'FAILED_REQUIRES_REVIEW', billedCost: null });
    expect((await run(options(path), action)).record.calls).toBe(2);
  }));

  it.each(['calls', 'reservationId', 'writer', 'version'])('rejects receipt replacement of %s while preserving its consumed reservation', async field => temporaryCase(async path => {
    await expect(run(options(path), async () => ({ result: 42, receipt: { status: 'VERIFIED', [field]: 'forged' } }))).rejects.toThrow('identity');
    expect(await read(path)).toMatchObject({ calls: 1, writer: 'TRANSPORT_SMOKE', status: 'FAILED_REQUIRES_REVIEW' });
  }));

  it('refuses a stale final overwrite when the reservation identity changes during the action', async () => temporaryCase(async path => {
    await expect(run(options(path), async () => {
      await filesystem.writeFile(path, JSON.stringify({ calls: 2, reservationId: 'another reservation', writer: 'AUTH_API_JOURNEY' }));
      return action();
    })).rejects.toThrow('identity');
    expect(await read(path)).toEqual({ calls: 2, reservationId: 'another reservation', writer: 'AUTH_API_JOURNEY' });
  }));

  it.each(['write', 'sync', 'rename'])('does not invoke an action after reservation %s failure and cleans owned temporary files', async stage => temporaryCase(async path => {
    await filesystem.writeFile(path, '{"calls":1}'); const original = fault('ENOSPC'); let invoked = false;
    const io: LiveAllowanceFileSystem = { ...filesystem,
      open: async (...args: Parameters<typeof filesystem.open>) => {
        const handle = await filesystem.open(...args);
        if (String(args[0]).endsWith('.tmp')) {
          if (stage === 'write') handle.writeFile = async () => { throw original; };
          if (stage === 'sync') handle.sync = async () => { throw original; };
        }
        return handle;
      },
      rename: async (...args: Parameters<typeof filesystem.rename>) => { if (stage === 'rename') throw original; return filesystem.rename(...args); },
    };
    await expect(run(options(path), async () => { invoked = true; return action(); }, io)).rejects.toBe(original);
    expect(invoked).toBe(false); expect(await read(path)).toEqual({ calls: 1 });
    expect(await filesystem.readdir(join(path, '..'))).toEqual(['ledger.json']);
  }));

  it('retains the durable reservation after final-write failure', async () => temporaryCase(async path => {
    const original = fault('ENOSPC'); let renames = 0; let invoked = 0;
    const io: LiveAllowanceFileSystem = { ...filesystem, rename: async (...args: Parameters<typeof filesystem.rename>) => {
      if (++renames === 2) throw original; return filesystem.rename(...args);
    } };
    await expect(run(options(path), async () => { invoked++; return action(); }, io)).rejects.toBe(original);
    expect(invoked).toBe(1); expect(await read(path)).toMatchObject({ calls: 1, status: 'ATTEMPT_RESERVED' });
    expect(await filesystem.readdir(join(path, '..'))).toEqual(['ledger.json']);
  }));

  it('fails lock acquisition without removing another owner or starting a reservation', async () => temporaryCase(async path => {
    const original = fault('EACCES'); let invoked = false;
    const io: LiveAllowanceFileSystem = { ...filesystem, open: async (...args: Parameters<typeof filesystem.open>) => {
      if (String(args[0]).endsWith('.lock')) throw original; return filesystem.open(...args);
    } };
    await expect(run(options(path), async () => { invoked = true; return action(); }, io)).rejects.toBe(original);
    expect(invoked).toBe(false); expect(await filesystem.readdir(join(path, '..'))).toEqual([]);
  }));

  it('does not remove a lock replaced by another identity during the action', async () => temporaryCase(async path => {
    await expect(run(options(path), async () => {
      await filesystem.writeFile(`${path}.lock`, '{"reservationId":"another owner"}'); return action();
    })).rejects.toBeInstanceOf(AggregateError);
    expect(await filesystem.readFile(`${path}.lock`, 'utf8')).toBe('{"reservationId":"another owner"}');
    expect(await read(path)).toMatchObject({ calls: 1, status: 'ATTEMPT_RESERVED' });
  }));

  it('preserves the callback error alongside final receipt failure and still releases its lock', async () => temporaryCase(async path => {
    const primary = new Error('action failed'); const final = fault('ENOSPC'); let renames = 0;
    const io: LiveAllowanceFileSystem = { ...filesystem, rename: async (...args: Parameters<typeof filesystem.rename>) => {
      if (++renames === 2) throw final; return filesystem.rename(...args);
    } };
    let caught: unknown;
    try { await run(options(path), async () => { throw primary; }, io); } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(AggregateError); expect((caught as AggregateError).errors).toEqual([primary, final]);
    expect((caught as AggregateError).cause).toBe(primary);
    expect(await read(path)).toMatchObject({ calls: 1, status: 'ATTEMPT_RESERVED' });
    await expect(filesystem.stat(`${path}.lock`)).rejects.toMatchObject({ code: 'ENOENT' });
  }));
});
