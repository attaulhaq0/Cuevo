import 'reflect-metadata';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { decodeJwt } from 'jose';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { config as dotenv } from 'dotenv';
import { parseServerConfig } from '@cuevo/config';
import { createApp } from '../../src/app';

dotenv({ path: '.env.local', quiet: true });
const config = parseServerConfig(process.env);
const enabled = process.env.CUEVO_REQUIRE_INTEGRATION === '1' && Boolean(config.databaseUrl && config.supabaseUrl && new URL(config.supabaseUrl).hostname === '127.0.0.1');
if (process.env.CUEVO_REQUIRE_INTEGRATION === '1' && !enabled) throw Error('Cuevo local Realtime verification requires configured synthetic services.');
describe.skipIf(!enabled)('actual private Realtime authorized joins and reconnect denial', () => {
  let runtime: Awaited<ReturnType<typeof createApp>>;
  let owner: Pool;
  const tokens: Record<string, string> = {};
  const clients: SupabaseClient[] = [];
  const school = '10000000-0000-4000-8000-000000000001';
  beforeAll(async () => {
    const actors = (JSON.parse(readFileSync('supabase/seed/identities.json', 'utf8')) as { actors: { actorId: string; email: string }[] }).actors;
    const password = (JSON.parse(readFileSync('.local/runtime-secrets.json', 'utf8')) as { syntheticPassword: string }).syntheticPassword;
    for (const [role, suffix] of Object.entries({ teacher: '004', student: '012', peer: '013', parent: '072', foreign: '133' })) {
      const actor = actors.find(item => item.actorId.endsWith(suffix))!;
      const auth = createClient(config.supabaseUrl!, config.supabasePublishableKey!, { auth: { persistSession: false, autoRefreshToken: false } });
      const signed = await auth.auth.signInWithPassword({ email: actor.email, password });
      if (!signed.data.session) throw Error('Synthetic sign-in unavailable; private details withheld.');
      tokens[role] = signed.data.session.access_token;
    }
    const url = new URL(config.databaseUrl!);
    if (url.hostname !== '127.0.0.1' || url.port !== '56322') throw Error('Cuevo local database required.');
    url.username = 'postgres'; url.password = 'postgres'; owner = new Pool({ connectionString: url.toString() });
    const privateOnly = (await owner.query('select bool_and(private_only) as enabled from _realtime.tenants')).rows[0]?.enabled;
    if (privateOnly !== true) throw Error('Private-only Realtime configuration is required.');
    runtime = await createApp(config);
  }, 30000);
  afterAll(async () => { for (const client of clients) { await client.removeAllChannels(); client.realtime.disconnect(); } await runtime?.close(); await owner?.end(); });
  async function command(path: string, payload: Record<string, unknown>) {
    const response = await runtime.app.inject({ method: 'POST', url: path, headers: { authorization: `Bearer ${tokens.teacher}`, 'x-school-id': school, 'idempotency-key': randomUUID() }, payload });
    expect(response.statusCode, response.body).toBe(200); return response.json();
  }
  async function join(role: string, topic: string, privateChannel = true) {
    const client = createClient(config.supabaseUrl!, config.supabasePublishableKey!, { auth: { persistSession: false, autoRefreshToken: false }, realtime: { timeout: 10000 } });
    clients.push(client); await client.realtime.setAuth(tokens[role]);
    const channel = client.channel(topic, { config: { private: privateChannel, presence: { enabled: false } } });
    const status = await new Promise<string>((resolveStatus, reject) => {
      const timer = setTimeout(() => reject(Error('Realtime join produced no definitive authorization result.')), 15000);
      channel.subscribe(result => { if (['SUBSCRIBED', 'CHANNEL_ERROR', 'TIMED_OUT'].includes(result)) { clearTimeout(timer); resolveStatus(result); } });
    });
    await client.removeChannel(channel); client.realtime.disconnect(); return status;
  }
  it('denies outside-group parent foreign and public joins then denies revoked reconnect', async () => {
    const room = await command('/v1/community/rooms', { classId: '30000000-0000-4000-8000-000000000001', name: `Realtime proof ${randomUUID()}`, type: 'GROUP', memberIds: ['20000000-0000-4000-8000-000000000012'] });
    const topic = `cuevo:${school}:room:${room.id}`;
    expect(await join('teacher', topic)).toBe('SUBSCRIBED');
    expect(await join('student', topic)).toBe('SUBSCRIBED');
    for (const role of ['peer', 'parent', 'foreign']) expect(await join(role, topic)).toBe('CHANNEL_ERROR');
    expect(await join('student', topic, false)).toBe('CHANNEL_ERROR');
    await command(`/v1/community/rooms/${room.id}/members`, { actorId: '20000000-0000-4000-8000-000000000012', status: 'revoked', confirmAccessChange: true });
    expect(await join('student', topic)).toBe('CHANNEL_ERROR');
    const claims = decodeJwt(tokens.teacher); const sessionId = String(claims.session_id);
    const previous = (await owner.query('select not_after from auth.sessions where id=$1', [sessionId])).rows[0]?.not_after;
    await owner.query("update auth.sessions set not_after=clock_timestamp()-interval'1 second' where id=$1", [sessionId]);
    try { expect(await join('teacher', topic)).toBe('CHANNEL_ERROR'); }
    finally { await owner.query('update auth.sessions set not_after=$2 where id=$1', [sessionId, previous]); }
  }, 90000);
});
