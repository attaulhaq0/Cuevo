import assert from 'node:assert/strict';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const schoolId = '10000000-0000-4000-8000-000000000001', actorId = '20000000-0000-4000-8000-000000000004';
const roomId = '93000000-0000-4000-8000-000000000001', groupId = '93000000-0000-4000-8000-000000000002';
const eventId = '93000000-0000-4000-8000-000000000003', foreign = '93000000-0000-4000-8000-000000000004';
const topic = (room: string) => 'realtime:cuevo:' + schoolId + ':room:' + room;
const frame = (join: string | null, ref: string | null, room: string, event: string, payload: unknown) => JSON.stringify([join, ref, topic(room), event, payload]);
const join = (room = roomId, ref = '1', token = 'initial-current-token', version?: string) => frame(ref, ref, room, 'phx_join', {
  config: { broadcast: { ack: false, self: false }, presence: { key: '', enabled: false }, postgres_changes: [], private: true },
  access_token: token, ...(version ? { version } : {}),
});
const permissionReason=(room=roomId)=>'You do not have permissions to read from this Channel topic: cuevo:'+schoolId+':room:'+room;
const reply = (room = roomId, ref = '1', status = 'ok') => frame(ref, ref, room, 'phx_reply', { status, response: status === 'ok' ? { postgres_changes: [] } : { reason: permissionReason(room) } });
const invalidate = (room = roomId, joinRef: string | null = null) => frame(joinRef, null, room, 'broadcast', { type: 'broadcast', event: 'invalidate', payload: { eventId, roomId: room } });
const joined=(room=roomId,ref='1',status:'JOINED'|'DENIED'='JOINED')=>({actorId,schoolId,generation:1,roomId:room,joinRef:ref,replyRef:ref,status,observedAt:'2026-10-12T10:00:00.000Z'});
async function api() {
  let owner: Record<string, unknown> = {};
  try { owner = await import(pathToFileURL(resolve(import.meta.dirname, 'hosted-community-socket.ts')).href); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ERR_MODULE_NOT_FOUND') throw error; }
  assert.equal(typeof owner.createHostedCommunitySocketGate, 'function', 'current-session successful join evidence has an owner');
  return owner as typeof import('./hosted-community-socket');
}
async function fixture() {
  const { createHostedCommunitySocketGate } = await api();
  let current: import('./hosted-community-socket').HostedCommunitySocketCurrent | null = { actorId, schoolId, generation: 1, token: 'initial-current-token', allowedRoomIds: [roomId, groupId] };
  let failCount = 0, closeCount = 0, expired = false;
  const gate = createHostedCommunitySocketGate({ readCurrent: () => current, assertOriginalValidity: () => { if (expired) throw Error('Unavailable'); },
    fail: () => { failCount++; }, close: () => { closeCount++; }, now: () => new Date('2026-10-12T10:00:00.000Z') });
  return { gate, set: (next: typeof current) => { current = next; }, get: () => current!, expire: () => { expired = true; }, counts: () => ({ failCount, closeCount }) };
}

test('successful current join is required for minimized invalidation proof', async () => {
  const { gate } = await fixture();
  assert.equal(gate.outbound(join()), true);
  assert.deepEqual(gate.inbound(reply()), { allowed: true, invalidation: null, join: joined() });
  assert.deepEqual(gate.inbound(invalidate()), { allowed: true, invalidation: {
    eventId, roomId, schoolId, actorId, generation: 1, joinProof: { joinRef: '1', replyRef: '1' }, observedAt: '2026-10-12T10:00:00.000Z',
  },join:null });
  assert.deepEqual(gate.status(), { closed: false, failed: false });
});

test('join outcomes expose only exact actor room refs and time while current joinInfo never revives retired proof',async()=>{
 const f=await fixture();assert.equal(typeof f.gate.joinInfo,'function');assert.equal(f.gate.joinInfo(roomId),null);f.gate.outbound(join());
 assert.deepEqual(f.gate.inbound(reply()),{allowed:true,invalidation:null,join:joined()});assert.deepEqual(f.gate.joinInfo(roomId),joined());
 const value=f.gate.joinInfo(roomId)!;value.joinRef='changed';assert.deepEqual(f.gate.joinInfo(roomId),joined());
 f.set({...f.get(),token:'rotated-token'});assert.equal(f.gate.joinInfo(roomId),null);
 const denied=await fixture();denied.gate.outbound(join());const raw=reply(roomId,'1','error');
 assert.deepEqual(denied.gate.inbound(raw),{allowed:true,invalidation:null,join:joined(roomId,'1','DENIED')});assert.equal(denied.gate.joinInfo(roomId),null);assert.doesNotMatch(JSON.stringify(denied.gate.inbound(raw)),/permissions|reason/);
});

test('infrastructure or mismatched topic errors cannot be relabeled as authorization denial',async()=>{
 for(const reason of ['Unauthorized','PRIVATE RAW SERVER REASON','Database unavailable',permissionReason(groupId)]){
  const denied=await denialFixture();denied.gate.outbound(join());assert.deepEqual(denied.gate.inbound(frame('1','1',roomId,'phx_reply',{status:'error',response:{reason}})),{allowed:false,invalidation:null,join:null});
  const normal=await fixture();normal.gate.outbound(join());assert.deepEqual(normal.gate.inbound(frame('1','1',roomId,'phx_reply',{status:'error',response:{reason}})),{allowed:true,invalidation:null,join:null});assert.equal(normal.gate.joinInfo(roomId),null);
 }
});

async function denialFixture(actor='20000000-0000-4000-8000-000000000133',ownSchool='10000000-0000-4000-8000-000000000002',target:unknown={schoolId,roomIds:[roomId]}){
 const {createHostedCommunitySocketGate}=await api();let current:import('./hosted-community-socket').HostedCommunitySocketCurrent|null={actorId:actor,schoolId:ownSchool,generation:1,token:'initial-current-token',allowedRoomIds:[]},denial=target,failed=0;
 const gate=createHostedCommunitySocketGate({readCurrent:()=>current,readDenialTarget:()=>denial as never,assertOriginalValidity(){},fail(){failed++;},close(){},now:()=>new Date('2026-10-12T10:00:00.000Z')});
 return{gate,setCurrent:(value:typeof current)=>{current=value;},get:()=>current!,setTarget:(value:unknown)=>{denial=value;},failed:()=>failed};
}

test('only exact synthetic denial actors can probe fixed school targets and unexpected successful joins fail closed',async()=>{
 for(const [actor,school] of [['20000000-0000-4000-8000-000000000013',schoolId],['20000000-0000-4000-8000-000000000018',schoolId],['20000000-0000-4000-8000-000000000133','10000000-0000-4000-8000-000000000002']]){
  const f=await denialFixture(actor,school);assert.equal(f.gate.outbound(join()),true);const denied=f.gate.inbound(reply(roomId,'1','error'));assert.deepEqual(denied,{allowed:true,invalidation:null,join:{...joined(roomId,'1','DENIED'),actorId:actor}});assert.equal(f.gate.joinInfo(roomId),null);assert.equal(f.gate.outbound(frame('1','2',roomId,'phx_leave',{})),true);assert.deepEqual(f.gate.inbound(frame('1','2',roomId,'phx_reply',{status:'ok',response:{}})),{allowed:true,invalidation:null,join:null});
  const unexpected=await denialFixture(actor,school);unexpected.gate.outbound(join());assert.deepEqual(unexpected.gate.inbound(reply()),{allowed:false,invalidation:null,join:null});assert.equal(unexpected.failed(),1);
 }
});

test('denial targets refuse actor school field ref or payload drift and cannot admit content before or after error',async()=>{
 for(const [actor,school,target] of [[actorId,schoolId,{schoolId,roomIds:[roomId]}],['20000000-0000-4000-8000-000000000133',schoolId,{schoolId,roomIds:[roomId]}],['20000000-0000-4000-8000-000000000013',schoolId,{schoolId:foreign,roomIds:[roomId]}],['20000000-0000-4000-8000-000000000018',schoolId,{schoolId,roomIds:[roomId],extra:true}]]){
  const f=await denialFixture(actor as string,school as string,target);assert.equal(f.gate.outbound(join()),false);
 }
 for(const raw of [frame('2','1',roomId,'phx_reply',{status:'error',response:{reason:'Unauthorized'}}),frame('1','2',roomId,'phx_reply',{status:'error',response:{reason:'Unauthorized'}}),frame('1','1',roomId,'phx_reply',{status:'error',response:{code:'DENIED'}}),frame('1','1',roomId,'phx_reply',{status:'error',response:{reason:'Unauthorized',content:'private'}}),invalidate()]){const f=await denialFixture();f.gate.outbound(join());assert.deepEqual(f.gate.inbound(raw),{allowed:false,invalidation:null,join:null});}
 const denied=await denialFixture();denied.gate.outbound(join());denied.gate.inbound(reply(roomId,'1','error'));assert.deepEqual(denied.gate.inbound(invalidate()),{allowed:false,invalidation:null,join:null});
 const changed=await denialFixture();changed.gate.outbound(join());changed.setTarget({schoolId,roomIds:[groupId]});assert.deepEqual(changed.gate.inbound(reply(roomId,'1','error')),{allowed:false,invalidation:null,join:null});
 const rotated=await denialFixture();rotated.gate.outbound(join());rotated.setCurrent({...rotated.get(),token:'new-token'});assert.deepEqual(rotated.gate.inbound(reply(roomId,'1','error')),{allowed:false,invalidation:null,join:null});
});

test('unacknowledged and denied joins cannot contribute invalidation evidence', async () => {
  for (const denial of [false, true]) {
    const { gate, counts } = await fixture(); assert.equal(gate.outbound(join()), true);
    if (denial) assert.deepEqual(gate.inbound(reply(roomId, '1', 'error')), { allowed: true, invalidation: null, join: joined(roomId,'1','DENIED') });
    assert.deepEqual(gate.inbound(invalidate()), { allowed: false, invalidation: null, join: null });
    assert.deepEqual(counts(), { failCount: 1, closeCount: 1 });
  }
});

test('denied and errored subscriptions may leave their exact old topic ref without receiving proof', async () => {
  for (const status of ['denied', 'errored']) {
    const f = await fixture(); f.gate.outbound(join());
    if (status === 'denied') f.gate.inbound(reply(roomId, '1', 'error'));
    else { f.gate.inbound(reply()); f.gate.inbound(frame('1', null, roomId, 'phx_error', {})); }
    assert.equal(f.gate.outbound(frame('1', '2', roomId, 'phx_leave', {})), true);
    assert.deepEqual(f.gate.inbound(frame('1', '2', roomId, 'phx_reply', { status: 'ok', response: {} })), { allowed: true, invalidation: null, join: null });
    assert.deepEqual(f.counts(), { failCount: 0, closeCount: 0 });
  }
});

test('old socket cannot adopt a different actor, school or same-actor relogin generation', async () => {
  for (const change of [{ actorId: foreign }, { schoolId: foreign }, { generation: 3 }, null]) {
    const f = await fixture(); f.gate.outbound(join()); f.gate.inbound(reply());
    f.set(change === null ? null : { ...f.get(), ...change });
    assert.deepEqual(f.gate.inbound(invalidate()), { allowed: false, invalidation: null, join: null });
    assert.deepEqual(f.counts(), { failCount: 1, closeCount: 1 });
    assert.equal(f.gate.outbound(join()), false);
  }
});

test('a current refresh needs a fresh successful bound join and stale join replies refuse', async () => {
  const f = await fixture(); f.gate.outbound(join()); f.gate.inbound(reply());
  f.set({ ...f.get(), token: 'refreshed-current-token' });
  assert.equal(f.gate.outbound(frame('1', '2', roomId, 'access_token', { access_token: 'refreshed-current-token' })), true);
  assert.equal(f.gate.outbound(join(roomId, '3', 'refreshed-current-token', 'realtime-js/2.117.2')), true);
  assert.deepEqual(f.gate.inbound(reply(roomId, '3')), { allowed: true, invalidation: null, join: joined(roomId,'3') });
  assert.equal(f.gate.inbound(invalidate(roomId, '3')).invalidation?.joinProof.joinRef, '3');
  const stale = await fixture(); stale.gate.outbound(join()); stale.set({ ...stale.get(), token: 'refreshed-current-token' });
  assert.deepEqual(stale.gate.inbound(reply()), { allowed: false, invalidation: null, join: null });
  const oldToken = await fixture(); oldToken.set({ ...oldToken.get(), token: 'refreshed-current-token' });
  assert.equal(oldToken.gate.outbound(join()), false);
  const unchangedJoin = await fixture(); unchangedJoin.gate.outbound(join()); unchangedJoin.gate.inbound(reply()); unchangedJoin.set({ ...unchangedJoin.get(), token: 'refreshed-current-token' });
  assert.deepEqual(unchangedJoin.gate.inbound(invalidate()), { allowed: false, invalidation: null, join: null });
});

test('observed token reversal cannot revive old successful join proof in the same session generation', async () => {
  const f = await fixture(); f.gate.outbound(join()); f.gate.inbound(reply());
  f.set({ ...f.get(), token: 'refreshed-current-token' });
  assert.equal(f.gate.outbound(frame('1', '2', roomId, 'access_token', { access_token: 'refreshed-current-token' })), true);
  f.set({ ...f.get(), token: 'initial-current-token' });
  assert.deepEqual(f.gate.inbound(invalidate()), { allowed: false, invalidation: null, join: null });
  assert.deepEqual(f.counts(), { failCount: 1, closeCount: 1 });
});

test('exact pending heartbeat may finish across token rotation while old topic proof stays retired', async () => {
  const f = await fixture(); f.gate.outbound(join()); f.gate.inbound(reply());
  assert.equal(f.gate.outbound(JSON.stringify([null, '2', 'phoenix', 'heartbeat', {}])), true);
  f.set({ ...f.get(), token: 'refreshed-current-token' });
  assert.deepEqual(f.gate.inbound(JSON.stringify([null, '2', 'phoenix', 'phx_reply', { status: 'ok', response: {} }])), { allowed: true, invalidation: null, join: null });
  assert.deepEqual(f.counts(), { failCount: 0, closeCount: 0 });
  assert.equal(f.gate.outbound(frame('1', '3', roomId, 'phx_leave', {})), true);
  assert.deepEqual(f.gate.inbound(frame('1', '3', roomId, 'phx_reply', { status: 'ok', response: {} })), { allowed: true, invalidation: null, join: null });
  const oldProof = await fixture(); oldProof.gate.outbound(join()); oldProof.gate.inbound(reply());
  oldProof.gate.outbound(JSON.stringify([null, '2', 'phoenix', 'heartbeat', {}])); oldProof.set({ ...oldProof.get(), token: 'refreshed-current-token' });
  oldProof.gate.inbound(JSON.stringify([null, '2', 'phoenix', 'phx_reply', { status: 'ok', response: {} }]));
  assert.deepEqual(oldProof.gate.inbound(invalidate()), { allowed: false, invalidation: null, join: null });
});

test('multiple known rooms retain separate proof, while leave drains old and pending topic refs', async () => {
  const f = await fixture(); f.gate.outbound(join()); f.gate.inbound(reply());
  f.gate.outbound(join(groupId, '2')); f.gate.inbound(reply(groupId, '2'));
  assert.equal(f.gate.inbound(invalidate()).invalidation?.roomId, roomId);
  assert.equal(f.gate.inbound(invalidate(groupId)).invalidation?.roomId, groupId);
  assert.equal(f.gate.outbound(join(roomId, '3')), true);
  assert.equal(f.gate.outbound(frame('3', '4', roomId, 'phx_leave', {})), true);
  assert.deepEqual(f.gate.inbound(frame('3', '4', roomId, 'phx_reply', { status: 'ok', response: {} })), { allowed: true, invalidation: null, join: null });
  assert.equal(f.gate.inbound(invalidate(groupId)).invalidation?.joinProof.joinRef, '2');
  assert.deepEqual(f.gate.inbound(reply(roomId, '3')), { allowed: false, invalidation: null, join: null });
  const left = await fixture(); left.gate.outbound(join()); left.gate.inbound(reply()); left.gate.outbound(frame('1', '2', roomId, 'phx_leave', {}));
  assert.deepEqual(left.gate.inbound(invalidate()), { allowed: false, invalidation: null, join: null });
});

test('reply and broadcast refs must match the current topic join, including superseded joins', async () => {
  for (const incoming of [reply(groupId), frame('2', '1', roomId, 'phx_reply', { status: 'ok', response: {} }), invalidate(roomId, '999')]) {
    const f = await fixture(); f.gate.outbound(join()); if (JSON.parse(incoming)[3] === 'broadcast') f.gate.inbound(reply());
    assert.deepEqual(f.gate.inbound(incoming), { allowed: false, invalidation: null, join: null });
  }
  const f = await fixture(); f.gate.outbound(join()); f.gate.outbound(join(roomId, '2'));
  assert.deepEqual(f.gate.inbound(reply()), { allowed: false, invalidation: null, join: null });
});

test('unknown topics, publications and protocol drift close the gate without retaining payload', async () => {
  for (const outgoing of [join(foreign), join(roomId, '1', 'initial-current-token', 'realtime-js/2.118.0'), frame('1', '2', roomId, 'broadcast', { secret: 'private content' }), frame('1', '2', roomId, 'presence', {}), JSON.stringify(['1', '1', 'realtime:public', 'phx_join', {}])]) {
    const f = await fixture(); assert.equal(f.gate.outbound(outgoing), false); assert.deepEqual(f.counts(), { failCount: 1, closeCount: 1 });
  }
  for (const incoming of [frame('1', null, roomId, 'presence_state', {}), frame('1', null, roomId, 'postgres_changes', {}), invalidate(foreign), 'not-json', JSON.stringify([null, null, topic(roomId), 'broadcast', { type: 'broadcast', event: 'invalidate', payload: { eventId, roomId, body: 'private content' } }])]) {
    const f = await fixture(); f.gate.outbound(join()); f.gate.inbound(reply());
    assert.deepEqual(f.gate.inbound(incoming), { allowed: false, invalidation: null, join: null });
  }
});

test('current room removal, expiry and callback failure fail closed with contained failure promises', async () => {
  const removed = await fixture(); removed.gate.outbound(join()); removed.gate.inbound(reply()); removed.set({ ...removed.get(), allowedRoomIds: [groupId] });
  assert.deepEqual(removed.gate.inbound(invalidate()), { allowed: false, invalidation: null, join: null });
  const f = await fixture(); f.gate.outbound(join()); f.gate.inbound(reply()); f.expire();
  assert.doesNotThrow(() => assert.deepEqual(f.gate.inbound(invalidate()), { allowed: false, invalidation: null, join: null }));
  assert.deepEqual(f.counts(), { failCount: 1, closeCount: 1 });
  assert.deepEqual(f.gate.status(), { closed: true, failed: true });
  const { createHostedCommunitySocketGate } = await api(); let closed = 0;
  const broken = createHostedCommunitySocketGate({ readCurrent: () => { throw Error('Unavailable'); }, assertOriginalValidity: () => {}, fail: async () => { throw Error('Unavailable'); }, close: () => { closed++; } });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(broken.status(), { closed: true, failed: true }); assert.equal(closed, 1);
});

test('heartbeat replies and channel lifecycle are exact finite frames; normal close retires proof', async () => {
  const f = await fixture();
  assert.equal(f.gate.outbound(JSON.stringify([null, '1', 'phoenix', 'heartbeat', {}])), true);
  assert.deepEqual(f.gate.inbound(JSON.stringify([null, '1', 'phoenix', 'phx_reply', { status: 'ok', response: {} }])), { allowed: true, invalidation: null, join: null });
  f.gate.outbound(join(roomId, '2')); f.gate.inbound(reply(roomId, '2'));
  assert.deepEqual(f.gate.inbound(frame('2', null, roomId, 'phx_error', {})), { allowed: true, invalidation: null, join: null });
  f.gate.outbound(join(roomId, '3')); f.gate.inbound(reply(roomId, '3'));
  assert.equal(f.gate.inbound(invalidate()).invalidation?.joinProof.joinRef, '3');
  f.gate.close(); assert.deepEqual(f.gate.inbound(invalidate()), { allowed: false, invalidation: null, join: null });
  assert.deepEqual(f.gate.status(), { closed: true, failed: false }); assert.deepEqual(f.counts(), { failCount: 0, closeCount: 0 });
});

test('pinned binary invalidation uses only current successful topic proof and refuses unsafe metadata', async () => {
  const binary = (metadata: string) => { const t = Buffer.from(topic(roomId)), e = Buffer.from('invalidate'), m = Buffer.from(metadata), p = Buffer.from(JSON.stringify({ eventId, roomId }));
    return Buffer.concat([Buffer.from([4, t.length, e.length, m.length, 1]), t, e, m, p]); };
  const f = await fixture(); f.gate.outbound(join()); f.gate.inbound(reply());
  assert.equal(f.gate.inbound(binary('')).invalidation?.eventId, eventId);
  assert.deepEqual(f.gate.inbound(binary('{"body":"private"}')), { allowed: false, invalidation: null, join: null });
  const unknown = await fixture(); assert.deepEqual(unknown.gate.inbound(binary('')), { allowed: false, invalidation: null, join: null });
});
