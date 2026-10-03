import { describe, expect, it } from 'vitest';
import { withFixtureCleanup as run } from '../integration/fixture-cleanup';
import { CooperativeFixtureScope } from '../integration/cooperative-fixture-scope';

describe('test fixture cleanup guarantees', () => {
  it.each(['wait', 'reset', 'metrics'])('closes after %s rejects and preserves that original error', async failed => {
    const original = new Error(failed); const order: string[] = [];
    const result = run(async () => {
      for (const step of ['wait', 'reset', 'metrics']) { order.push(step); if (step === failed) throw original; }
    }, [() => { order.push('close'); }]);
    await expect(result).rejects.toBe(original);
    expect(order).toEqual([...['wait', 'reset', 'metrics'].slice(0, ['wait', 'reset', 'metrics'].indexOf(failed) + 1), 'close']);
  });

  it('does not invent metric success after a reset rejection', async () => {
    const metricWrites: { expectedSamples: number; samples: number; complete: boolean }[] = [];
    const resetError = new Error('reset'); const order: string[] = [];
    const writeMetrics = async (reset: () => Promise<void>) => run(async () => {
      await reset();
      const measured = { expectedSamples: 7, samples: 3, complete: false };
      metricWrites.push(measured); return measured;
    }, [() => { order.push('close'); }]);
    await expect(writeMetrics(async () => { throw resetError; })).rejects.toBe(resetError);
    expect(metricWrites).toEqual([]); expect(order).toEqual(['close']);
    await expect(writeMetrics(async () => undefined)).resolves.toEqual({ expectedSamples: 7, samples: 3, complete: false });
    expect(metricWrites).toEqual([{ expectedSamples: 7, samples: 3, complete: false }]);
    expect(order).toEqual(['close', 'close']);
  });

  it.each(['runtime pool', 'rollback', 'tenant cleanup', 'release', 'owner end'])('attempts every resource after %s fails', async failed => {
    const original = new Error(failed); const order: string[] = [];
    const names = ['runtime pool', 'rollback', 'tenant cleanup', 'release', 'owner end'];
    await expect(run(async () => { order.push('app close'); }, names.map(name => async () => {
      order.push(name); if (name === failed) throw original;
    }))).rejects.toBe(original);
    expect(order).toEqual(['app close', ...names]);
  });

  it('still rolls back, cleans the committed tenant and releases both pools after app close fails', async () => {
    const original = new Error('app close'); const order: string[] = [];
    await expect(run(async () => { order.push('app close'); throw original; },
      ['runtime pool', 'rollback', 'tenant cleanup', 'release', 'owner end'].map(name => () => { order.push(name); })))
      .rejects.toBe(original);
    expect(order).toEqual(['app close', 'runtime pool', 'rollback', 'tenant cleanup', 'release', 'owner end']);
  });

  it('retains primary and ordered cleanup errors when both fail', async () => {
    const primary = new Error('source action'); const close = new Error('close'); const end = new Error('end');
    let caught: unknown;
    try { await run(async () => { throw primary; }, [() => { throw close; }, () => { throw end; }]); } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(AggregateError);
    expect((caught as AggregateError).errors).toEqual([primary, close, end]);
    expect((caught as AggregateError).cause).toBe(primary);
  });

  it('attempts both scope waits before close when the first wait rejects', async () => {
    const original = new Error('setup wait'); const order: string[] = [];
    await expect(run(async () => {
      await run(async () => undefined, [() => { order.push('setup wait'); throw original; }, () => { order.push('case wait'); }]);
      order.push('metrics');
    }, [() => { order.push('close'); }])).rejects.toBe(original);
    expect(order).toEqual(['setup wait', 'case wait', 'close']);
  });

  it('waits for the remaining original body before close after another scope join rejects', async () => {
    let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; });
    const scope = new CooperativeFixtureScope(60000); const order: string[] = [];
    const body = scope.run(async () => {
      await scope.operation(async () => { order.push('request started'); await held; order.push('role reset'); });
      order.push('unsafe next request');
    });
    const bodyResult = body.catch(error => error); await Promise.resolve();
    const original = new Error('setup join');
    const teardown = run(async () => {
      await run(async () => undefined, [() => { throw original; }, () => scope.cancelAndWait()]);
      order.push('metrics');
    }, [() => { order.push('close'); }]);
    const teardownResult = teardown.catch(error => error); await Promise.resolve();
    expect(order).toEqual(['request started']);
    release(); expect(await bodyResult).toBeInstanceOf(Error);
    expect(await teardownResult).toBe(original); expect(order).toEqual(['request started', 'role reset', 'close']);
  });

  it.each([undefined, null, 'fixture failure'])('preserves a non-Error thrown value %s and still cleans up', async original => {
    let closed = false; let rejected = false; let caught: unknown;
    try { await run(async () => { throw original; }, [() => { closed = true; }]); } catch (error) { rejected = true; caught = error; }
    expect(rejected).toBe(true); expect(caught).toBe(original); expect(closed).toBe(true);
  });

  it('preserves a successful result and runs cleanup once in order', async () => {
    const order: string[] = [];
    const result = await run(async () => { order.push('action'); return 42; }, [() => { order.push('close'); }, () => { order.push('end'); }]);
    expect(result).toBe(42); expect(order).toEqual(['action', 'close', 'end']);
  });
});
