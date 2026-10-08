import { describe, expect, it } from 'vitest';
import { hostedSyntheticRuntime, requireHostedSyntheticDatabase } from '../src/synthetic-runtime';
import {workerReleaseGeneration} from '../src/synthetic-runtime';
describe('private worker release generation',()=>{it('retains nullable legacy configuration and exact canonical PostgreSQL bigint generation',()=>{expect(workerReleaseGeneration(undefined)).toBeNull();expect(workerReleaseGeneration('1')).toBe('1');expect(workerReleaseGeneration('9223372036854775807')).toBe('9223372036854775807');});it.each(['','0','01','-1',' 1','1.0','9223372036854775808','NaN'])('refuses malformed or out of range generation %s',value=>expect(()=>workerReleaseGeneration(value)).toThrow());});

const settings = { CUEVO_DEPLOYMENT_ENVIRONMENT: 'synthetic-staging', CUEVO_SYNTHETIC_PROJECT_REF: 'abcdefghijklmnopqrst', CUEVO_SYNTHETIC_WEB_ORIGIN: 'https://cuevo.example', SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co' };
describe('portable hosted synthetic project authority', () => {
  it('does not infer hosted approval from unrelated environment labels', () => {
    for (const CUEVO_DEPLOYMENT_ENVIRONMENT of [undefined, 'production', 'local']) expect(hostedSyntheticRuntime({ ...settings, CUEVO_DEPLOYMENT_ENVIRONMENT })).toBeUndefined();
  });
  it.each([
    { CUEVO_SYNTHETIC_PROJECT_REF: undefined }, { CUEVO_SYNTHETIC_WEB_ORIGIN: undefined }, { SUPABASE_URL: undefined },
    { CUEVO_SYNTHETIC_WEB_ORIGIN: 'https://user:credential@cuevo.example' }, { CUEVO_SYNTHETIC_WEB_ORIGIN: 'https://cuevo.example:8443' },
    { CUEVO_SYNTHETIC_WEB_ORIGIN: 'http://cuevo.example' }, { SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co/auth/v1' },
    { SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co?redirect=other' },
  ])('denies missing or unsafe source binding', fields => expect(() => hostedSyntheticRuntime({ ...settings, ...fields })).toThrow());
  it('admits documented direct and exact project pooler roles without granting arbitrary targets', () => {
    const runtime = hostedSyntheticRuntime(settings)!;
    for (const role of ['cuevo_api', 'cuevo_worker'] as const) {
      expect(() => requireHostedSyntheticDatabase(`postgresql://${role}:private@db.${runtime.projectRef}.supabase.co:5432/postgres`, runtime, role)).not.toThrow();
      for (const port of ['5432', '6543']) expect(() => requireHostedSyntheticDatabase(`postgresql://${role}.${runtime.projectRef}:private@aws-0-eu-central-1.pooler.supabase.com:${port}/postgres`, runtime, role)).not.toThrow();
      for (const url of [`postgresql://${role}:private@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`, `postgresql://${role}.different:private@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`, `postgresql://${role}.${runtime.projectRef}:private@foreign.pooler.supabase.com:5432/postgres`, `postgresql://${role}:private@db.${runtime.projectRef}.supabase.co:5432/other`]) expect(() => requireHostedSyntheticDatabase(url, runtime, role)).toThrow();
    }
  });
});
