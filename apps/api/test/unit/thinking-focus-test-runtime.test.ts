import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { isolatedThinkingFocusRuntime, standardThinkingFocusRuntime, thinkingFocusTestMode, readThinkingFocusJson } from '../integration/thinking-focus-test-runtime';

const actors = { teacher: '20000000-0000-4000-8000-000000000004', student: '20000000-0000-4000-8000-000000000012' };
const env = { DATABASE_URL: 'postgresql://cuevo_api:private-fixture@127.0.0.1:56322/postgres', SUPABASE_URL: 'http://127.0.0.1:56321', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture' };
const manifest = { synthetic: true, actors: [{ actorId: actors.teacher, email: 'synthetic-004@cuevo.test', role: 'teacher' }, { actorId: actors.student, email: 'synthetic-012@cuevo.test', role: 'student' }] };
const secrets = { syntheticPassword: 'private-fixture-password' };
const isolated = { config: { ...env, DATABASE_URL: env.DATABASE_URL.replace('56322', '57422'), SUPABASE_URL: env.SUPABASE_URL.replace('56321', '57421') }, accounts: manifest.actors.map(actor => ({ actorId: actor.actorId, email: actor.email, password: secrets.syntheticPassword })) };
const absoluteRuntime = fileURLToPath(new URL('../../../.local/isolated-thinking.json', import.meta.url));

describe('test-only thinking-focus runtime admission', () => {
  it('runtime JSON read and parse errors never expose credentials or filesystem error content', async () => {
    for (const read of [async () => '{"password":"private-fixture-secret",invalid}', async (): Promise<string> => { throw Error('ENOENT private-fixture-path-and-secret'); }]) {
      await expect(readThinkingFocusJson(read)).rejects.toThrow('Thinking-focus synthetic runtime data cannot be read or parsed; contents withheld.');
      await readThinkingFocusJson(read).catch(error => { expect(String(error)).not.toContain('private-fixture'); });
    }
    expect(await readThinkingFocusJson(async () => '{"synthetic":true}')).toEqual({ synthetic: true });
  });
  it('runs ordinary integration and preserves explicit isolated opt-in selection', () => {
    expect(thinkingFocusTestMode({})).toBeNull();
    expect(thinkingFocusTestMode({ CUEVO_REQUIRE_INTEGRATION: '1' })).toBe('STANDARD');
    expect(thinkingFocusTestMode({ CUEVO_REQUIRE_THINKING_FOCUS_INTEGRATION: '1' })).toBe('ISOLATED');
    expect(thinkingFocusTestMode({ CUEVO_REQUIRE_INTEGRATION: '1', CUEVO_REQUIRE_THINKING_FOCUS_INTEGRATION: '1' })).toBe('ISOLATED');
  });
  it('admits exact standard synthetic identities and disables provider execution regardless of inherited flags', () => {
    const admitted = standardThinkingFocusRuntime({ ...env, AI_GENERATION_MODE: 'LIVE', POSTHOG_CAPTURE_MODE: 'LIVE_SYNTHETIC' }, manifest, secrets, actors);
    expect(admitted.config).toMatchObject({ nodeEnv: 'test', databaseUrl: env.DATABASE_URL, supabaseUrl: env.SUPABASE_URL, aiEnabled: false, analytics: { mode: 'DISABLED' } });
    expect(new URL(admitted.ownerDatabaseUrl)).toMatchObject({ username: 'postgres', hostname: '127.0.0.1', port: '56322', pathname: '/postgres' });
    expect(admitted.accounts.map(account => account.actorId)).toEqual(Object.values(actors));
  });
  it('refuses remote, other-stack, owner-role and noncanonical standard targets before credential use', () => {
    for (const changed of [{ DATABASE_URL: env.DATABASE_URL.replace('127.0.0.1', 'remote.example') }, { DATABASE_URL: env.DATABASE_URL.replace('56322', '57422') }, { DATABASE_URL: env.DATABASE_URL.replace('cuevo_api:', 'postgres:') }, { DATABASE_URL: env.DATABASE_URL.replace('/postgres', '/other') }, { SUPABASE_URL: 'http://127.0.0.1:57421' }, { SUPABASE_URL: 'https://remote.example' }, { SUPABASE_URL: 'http://private-fixture@127.0.0.1:56321' }]) expect(() => standardThinkingFocusRuntime({ ...env, ...changed }, manifest, secrets, actors)).toThrow(/guarded|runtime/);
  });
  it('standard authentication and database targets cannot mix the isolated and ordinary environments', () => {
    expect(() => standardThinkingFocusRuntime({ ...env, SUPABASE_URL: isolated.config.SUPABASE_URL }, manifest, secrets, actors)).toThrow(/guarded/);
    expect(() => standardThinkingFocusRuntime({ ...env, DATABASE_URL: isolated.config.DATABASE_URL }, manifest, secrets, actors)).toThrow(/guarded/);
    expect(() => isolatedThinkingFocusRuntime(absoluteRuntime, { ...isolated, config: { ...isolated.config, SUPABASE_URL: env.SUPABASE_URL } }, actors)).toThrow(/guarded/);
  });
  it('refuses non-synthetic, missing, duplicate and mismatched-role identity manifests', () => {
    for (const invalid of [{ ...manifest, synthetic: false }, { ...manifest, actors: manifest.actors.slice(0, 1) }, { ...manifest, actors: [...manifest.actors, manifest.actors[0]] }, { ...manifest, actors: [{ ...manifest.actors[0], role: 'admin' }, manifest.actors[1]] }, { ...manifest, actors: [{ ...manifest.actors[0], email: 'teacher@customer.example' }, manifest.actors[1]] }]) expect(() => standardThinkingFocusRuntime(env, invalid, secrets, actors)).toThrow(/synthetic|identity/);
    expect(() => standardThinkingFocusRuntime(env, manifest, {}, actors)).toThrow(/synthetic|credential/);
  });
  it('isolated admission requires its absolute path and dedicated targets, never falls back to standard', () => {
    expect(isolatedThinkingFocusRuntime(absoluteRuntime, isolated, actors).config.supabaseUrl).toBe('http://127.0.0.1:57421');
    for (const path of [undefined, '', 'relative.json']) expect(() => isolatedThinkingFocusRuntime(path, isolated, actors)).toThrow(/absolute/);
    expect(() => isolatedThinkingFocusRuntime(absoluteRuntime, { ...isolated, config: env }, actors)).toThrow(/guarded|isolated/);
    expect(() => isolatedThinkingFocusRuntime(absoluteRuntime, { ...isolated, accounts: isolated.accounts.slice(0, 1) }, actors)).toThrow(/identity/);
  });
  it('only explicit isolated admission permits this task’s exact integration scratch database', () => {
    const scratch = { ...isolated, config: { ...isolated.config, DATABASE_URL: isolated.config.DATABASE_URL.replace('/postgres', '/cuevo_integration_20261004') } };
    expect(new URL(isolatedThinkingFocusRuntime(absoluteRuntime, scratch, actors).ownerDatabaseUrl).pathname).toBe('/cuevo_integration_20261004');
    expect(() => isolatedThinkingFocusRuntime(absoluteRuntime, { ...scratch, config: { ...scratch.config, DATABASE_URL: scratch.config.DATABASE_URL.replace('20261004', '20261005') } }, actors)).toThrow(/guarded/);
    expect(() => standardThinkingFocusRuntime({ ...env, DATABASE_URL: env.DATABASE_URL.replace('/postgres', '/cuevo_integration_20261004') }, manifest, secrets, actors)).toThrow(/guarded/);
  });
  it('admission failures never expose supplied database passwords, keys or identity content', () => {
    const foreign = () => standardThinkingFocusRuntime({ ...env, DATABASE_URL: env.DATABASE_URL.replace('127.0.0.1', 'private-fixture-host') }, manifest, secrets, actors);
    expect(foreign).toThrow(/guarded/);
    try { foreign(); }
    catch (error) { expect(String(error)).not.toContain('private-fixture'); }
    const missing = () => isolatedThinkingFocusRuntime(absoluteRuntime, { ...isolated, accounts: [{ actorId: actors.teacher, email: 'private-fixture-email', password: 'private-fixture-password' }] }, actors);
    expect(missing).toThrow(/identity/);
    try { missing(); }
    catch (error) { expect(String(error)).not.toContain('private-fixture'); }
  });
});
