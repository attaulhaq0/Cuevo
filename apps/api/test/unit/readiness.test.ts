import { describe, expect, it } from 'vitest';
import { ReadinessProbe } from '../../src/platform/health/readiness';

describe('bounded dependency readiness', () => {
  it('shares one concurrent probe and briefly caches the actual result', async () => {
    let release!: () => void;
    let calls = 0;
    let now = 0;
    const barrier = new Promise<void>(resolve => { release = resolve; });
    const probe = new ReadinessProbe(async () => { calls++; await barrier; return { database: true, authentication: true }; }, () => now);
    const requests = Array.from({ length: 25 }, () => probe.check());
    release();
    expect(await Promise.all(requests)).toEqual(Array.from({ length: 25 }, () => ({ database: true, authentication: true })));
    expect(calls).toBe(1);
    await probe.check(); expect(calls).toBe(1);
    now = 2000; await probe.check(); expect(calls).toBe(2);
  });
  it('returns unavailable on failed probe and retries after the bounded cache expires', async () => {
    let now = 0; let attempts = 0;
    const probe = new ReadinessProbe(async () => { attempts++; if (attempts === 1) throw Error('private dependency error'); return { database: true, authentication: true }; }, () => now);
    expect(await probe.check()).toEqual({ database: false, authentication: false });
    now = 2000;
    expect(await probe.check()).toEqual({ database: true, authentication: true });
  });
});
