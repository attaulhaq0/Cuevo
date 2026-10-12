import assert from 'node:assert/strict';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { RealtimeClient } from '@supabase/realtime-js';

const schoolId = '10000000-0000-4000-8000-000000000001', classId = '30000000-0000-4000-8000-000000000001';
const teacherId = '20000000-0000-4000-8000-000000000004', studentId = '20000000-0000-4000-8000-000000000012';
const classRoomId = '93000000-0000-4000-8000-000000000001', groupId = '93000000-0000-4000-8000-000000000002';
const eventId = '93000000-0000-4000-8000-000000000003', postId = '93000000-0000-4000-8000-000000000004';
const actor = { schoolId, actorId: studentId, role: 'student' as const };
const scope = { schoolId, classId, classRoomId, groupId, announcementId: postId };
const authOrigin = 'https://mqxdjvsyckzocokuikmx.supabase.co', publishable = 'sb_publishable_fixture_1234567890';
const topic = 'realtime:cuevo:' + schoolId + ':room:' + groupId;
async function api() {
  let owner: Record<string, unknown> = {};
  try { owner = await import(pathToFileURL(resolve(import.meta.dirname, 'hosted-community-transport.ts')).href); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ERR_MODULE_NOT_FOUND') throw error; }
  assert.equal(typeof owner.hostedCommunityReadAllowed, 'function', 'a finite authenticated Community read owner exists');
  return owner as typeof import('./hosted-community-transport');
}

test('Community reads allow only fixed shell and actual selected object routes with unique bounded query fields', async () => {
  const { hostedCommunityReadAllowed } = await api();
  for (const path of ['/v1/me', '/v1/classes?limit=100', '/v1/community/rooms?limit=100', '/v1/community/rooms/' + groupId + '/posts?limit=100', '/v1/community/rooms/' + classRoomId + '/roster', '/v1/community/announcements/' + postId]) assert.equal(hostedCommunityReadAllowed(path, scope, actor), true, path);
  for (const path of ['/v1/learners/'+studentId+'/state','/v1/learners/'+studentId+'/academic-report?limit=25','/v1/portfolio/items?limit=25&learnerId='+studentId,'/v1/school/calendar?limit=25&learnerId='+studentId])assert.equal(hostedCommunityReadAllowed(path,scope,actor),true,path);
  for(const path of ['/v1/assessments?limit=25','/v1/results?limit=25','/v1/submissions?limit=100','/v1/development/goals?learnerId='+studentId+'&limit=25'])assert.equal(hostedCommunityReadAllowed(path,scope,actor),true,path);
  assert.equal(hostedCommunityReadAllowed('/v1/people?limit=100',scope,{...actor,role:'parent'}),true);
  for (const path of ['/v1/community/rooms/' + eventId + '/posts', '/v1/community/rooms?limit=1&limit=100', '/v1/community/rooms?learnerId=' + studentId, '/v1/community/rooms?cursor=invalid', '/v1/community/rooms?limit=101', '/v1/community/rooms?query=private', '/v1/community/rooms/../posts', '/v1/community/%72ooms', '/v1/community/rooms#secret', '/v1/school/audit', '//v1/community/rooms']) assert.equal(hostedCommunityReadAllowed(path, scope, actor), false, path);
  assert.equal(hostedCommunityReadAllowed('/v1/community/rooms', scope, { ...actor, schoolId: eventId }), false);
  assert.equal(hostedCommunityReadAllowed('/v1/community/rooms', scope, { ...actor, role: 'parent' }), false);
});

test('only initial exact membership reads may omit school selection under the captured current token',async()=>{
 const {hostedCommunityRequestIdentityAllowed}=await api();
 const selected={apiOrigin:'https://api.fixture.invalid',path:'/v1/me',actor,token:'current-token',membershipVerified:false};
 assert.equal(hostedCommunityRequestIdentityAllowed({'authorization':'Bearer current-token'},selected),true);
 assert.equal(hostedCommunityRequestIdentityAllowed({'authorization':'Bearer current-token'},{...selected,path:'/v1/community/rooms'}),false);
 assert.equal(hostedCommunityRequestIdentityAllowed({'authorization':'Bearer current-token'},{...selected,membershipVerified:true}),false);
 assert.equal(hostedCommunityRequestIdentityAllowed({'authorization':'Bearer current-token','x-school-id':eventId},selected),false);
 assert.equal(hostedCommunityRequestIdentityAllowed({'authorization':'Bearer old-token'},selected),false);
 assert.equal(hostedCommunityRequestIdentityAllowed({'authorization':'Bearer current-token','x-school-id':schoolId},{...selected,path:'/v1/community/rooms',membershipVerified:true}),true);
  assert.equal(hostedCommunityRequestIdentityAllowed({'authorization':'Bearer current-token','x-school-id':schoolId},{...selected,path:'/v1/community/rooms',membershipVerified:false}),false);
});

const auxiliaryActors=[{kind:'peer',actorId:'20000000-0000-4000-8000-000000000018',schoolId,role:'student'},{kind:'outside',actorId:'20000000-0000-4000-8000-000000000013',schoolId,role:'student'},{kind:'foreign',actorId:'20000000-0000-4000-8000-000000000133',schoolId:'10000000-0000-4000-8000-000000000002',role:'student'}] as const;

test('finite auxiliary actor Home reads use only their own exact school and learner source',async()=>{
 const owner=await api();assert.equal(typeof owner.hostedCommunityAuxiliaryReadAllowed,'function','finite auxiliary reads require their own policy');
 for(const actor of auxiliaryActors){
  const paths=['/v1/me','/v1/diagnostics/config','/v1/assessments?limit=25','/v1/results?limit=25','/v1/submissions?limit=100','/v1/interventions?limit=25','/v1/portfolio/items?limit=25','/v1/school/calendar?limit=25','/v1/classes?limit=100','/v1/notifications?limit=25','/v1/notifications/preferences','/v1/community/rooms?limit=100','/v1/community/announcements?limit=100','/v1/community/notifications?limit=100','/v1/community/mentions?limit=25',`/v1/learners/${actor.actorId}/state`,`/v1/learners/${actor.actorId}/academic-report?limit=25`,`/v1/learners/${actor.actorId}/report-periods?limit=25`,`/v1/portfolio/items?learnerId=${actor.actorId}&limit=25`,`/v1/school/calendar?limit=25&learnerId=${actor.actorId}`,`/v1/development/goals?learnerId=${actor.actorId}&limit=25`];
  for(const path of paths)assert.equal(owner.hostedCommunityAuxiliaryReadAllowed(path,scope,actor),true,actor.kind+':'+path);
  for(const path of ['/v1/people','/v1/marking','/v1/recommendations','/v1/community/conversations','/v1/school/audit',`/v1/learners/${studentId}/state`,`/v1/portfolio/items?learnerId=${studentId}`,`/v1/development/goals?learnerId=${studentId}`])assert.equal(owner.hostedCommunityAuxiliaryReadAllowed(path,scope,actor),false,actor.kind+':'+path);
 }
 assert.equal(owner.hostedCommunityReadAllowed('/v1/development/goals?learnerId='+auxiliaryActors[0].actorId,scope,actor),false,'Original seven-session learner source remains fixed');
});

test('auxiliary read and identity checks reject any changed actor kind school role or extra selection fields',async()=>{
 const owner=await api();assert.equal(typeof owner.hostedCommunityAuxiliaryRequestIdentityAllowed,'function');
 const selected=auxiliaryActors[0],headers={authorization:'Bearer current-token','x-school-id':schoolId};
 for(const changed of [{...selected,actorId:studentId},{...selected,kind:'outside'},{...selected,schoolId:auxiliaryActors[2].schoolId},{...selected,role:'teacher'},{...selected,kind:'arbitrary'},{...selected,extra:true},null]){
  assert.equal(owner.hostedCommunityAuxiliaryReadAllowed('/v1/me',scope,changed as never),false);
  assert.equal(owner.hostedCommunityAuxiliaryRequestIdentityAllowed(headers,{apiOrigin:'https://api.fixture.invalid',path:'/v1/me',actor:changed as never,token:'current-token',membershipVerified:true,scope}),false);
 }
 for(const changed of [{...scope,schoolId:auxiliaryActors[2].schoolId},{...scope,classId:eventId},{...scope,classRoomId:groupId},{...scope,groupId:classRoomId}])assert.equal(owner.hostedCommunityAuxiliaryReadAllowed('/v1/me',changed,selected),false,'Scope remains the recorded source tuple');
});

test('auxiliary query grammar refuses repeated encoded unrelated and unbounded source fields',async()=>{
 const owner=await api();assert.equal(typeof owner.hostedCommunityAuxiliaryReadAllowed,'function');
 for(const actor of auxiliaryActors)for(const path of ['/v1/me?limit=25','/v1/community/%72ooms','/v1/community/rooms?limit=25&limit=25','/v1/community/rooms?cursor='+eventId+'&cursor='+eventId,'/v1/community/rooms?limit=101','/v1/community/rooms?limit=0','/v1/community/rooms?cursor=invalid','/v1/community/rooms?learnerId='+actor.actorId,'/v1/community/rooms?filter=private','/v1/community/rooms?limit=025','/v1/community/rooms#private','/v1/community/rooms/../posts','//v1/community/rooms','/v1/community/rooms?limit=25&','/v1/community/rooms?limit=25&&cursor='+eventId,'/v1/community/rooms?&limit=25','/v1/community/rooms?','/v1/development/goals?learnerId='+actor.actorId+'&learnerId='+actor.actorId])assert.equal(owner.hostedCommunityAuxiliaryReadAllowed(path,scope,actor),false,path);
});

test('auxiliary actor and scope proxies or accessors cannot execute private selection traps',async()=>{
 const owner=await api();let traps=0;
 const forgedActor=new Proxy(auxiliaryActors[0],{get(){traps++;throw Error('Private actor trap');},ownKeys(){traps++;throw Error('Private actor trap');}}),forgedScope={...scope,get schoolId(){traps++;return schoolId;}};
 assert.equal(owner.hostedCommunityAuxiliaryReadAllowed('/v1/me',scope,forgedActor),false);assert.equal(owner.hostedCommunityAuxiliaryReadAllowed('/v1/me',forgedScope,auxiliaryActors[0]),false);
 assert.equal(owner.hostedCommunityAuxiliaryDenialReadAllowed('/v1/community/rooms/'+groupId+'/posts',forgedScope,auxiliaryActors[0],'GROUP_POSTS'),false);
 assert.equal(owner.hostedCommunityAuxiliaryRequestIdentityAllowed({authorization:'Bearer current-token','x-school-id':schoolId},{apiOrigin:'https://api.fixture.invalid',path:'/v1/me',actor:forgedActor,token:'current-token',membershipVerified:true,scope}),false);assert.equal(traps,0);
});

test('auxiliary initial membership and own Home requests require the exact captured token and current own-school selection',async()=>{
 const owner=await api();assert.equal(typeof owner.hostedCommunityAuxiliaryRequestIdentityAllowed,'function');
 for(const actor of auxiliaryActors){
  const initial={apiOrigin:'https://api.fixture.invalid',path:'/v1/me',actor,token:'current-token',membershipVerified:false,scope};
  assert.equal(owner.hostedCommunityAuxiliaryRequestIdentityAllowed({authorization:'Bearer current-token'},initial),true);
  assert.equal(owner.hostedCommunityAuxiliaryRequestIdentityAllowed({authorization:'Bearer current-token','x-school-id':actor.schoolId},initial),true);
  const rejectedHeaders:Record<string,string>[]=[{authorization:'Bearer old-token'},{authorization:'Bearer current-token','x-school-id':eventId}];for(const headers of rejectedHeaders)assert.equal(owner.hostedCommunityAuxiliaryRequestIdentityAllowed(headers,initial),false);
  assert.equal(owner.hostedCommunityAuxiliaryRequestIdentityAllowed({authorization:'Bearer current-token'},{...initial,membershipVerified:true}),false);
  const own={...initial,path:'/v1/development/goals?learnerId='+actor.actorId+'&limit=25',membershipVerified:true};
  assert.equal(owner.hostedCommunityAuxiliaryRequestIdentityAllowed({authorization:'Bearer current-token','x-school-id':actor.schoolId},own),true);
  assert.equal(owner.hostedCommunityAuxiliaryRequestIdentityAllowed({authorization:'Bearer current-token','x-school-id':actor.schoolId},{...own,membershipVerified:false}),false);
  assert.equal(owner.hostedCommunityAuxiliaryRequestIdentityAllowed({authorization:'Bearer current-token','x-school-id':schoolId},{...own,apiOrigin:'http://api.fixture.invalid'}),false);
 }
});

test('intentional auxiliary denial reads admit only the declared exact original group or class source under current membership',async()=>{
 const owner=await api();assert.equal(typeof owner.hostedCommunityAuxiliaryDenialReadAllowed,'function');
 for(const actor of auxiliaryActors)for(const [denial,path]of [['GROUP_POSTS',`/v1/community/rooms/${groupId}/posts?limit=100`],['CLASS_POSTS',`/v1/community/rooms/${classRoomId}/posts?limit=100`],['GROUP_ROSTER',`/v1/community/rooms/${groupId}/roster?limit=100`]] as const){
  assert.equal(owner.hostedCommunityAuxiliaryDenialReadAllowed(path,scope,actor,denial),true);
  const expected={apiOrigin:'https://api.fixture.invalid',path,actor,token:'current-token',membershipVerified:true,scope,denial},headers={authorization:'Bearer current-token','x-school-id':schoolId};
  assert.equal(owner.hostedCommunityAuxiliaryRequestIdentityAllowed(headers,expected),true);
  for(const changed of [{...expected,denial:'CLASS_POSTS' as const,path:`/v1/community/rooms/${groupId}/posts`},{...expected,membershipVerified:false},{...expected,token:'old-token'},{...expected,path:path.replace(groupId,eventId).replace(classRoomId,eventId)},{...expected,path:path+'&limit=25'},{...expected,path:'/v1/community/rooms'},{...expected,path:'/v1/me'},{...expected,denial:'UNBOUNDED' as never}])assert.equal(owner.hostedCommunityAuxiliaryRequestIdentityAllowed(headers,changed),false);
  assert.equal(owner.hostedCommunityAuxiliaryRequestIdentityAllowed({...headers,'x-school-id':actor.kind==='foreign'?actor.schoolId:eventId},expected),false);
  if(actor.kind==='foreign'){assert.equal(owner.hostedCommunityAuxiliaryRequestIdentityAllowed(headers,{...expected,denial:undefined}),false);assert.equal(owner.hostedCommunityAuxiliaryReadAllowed(path,scope,actor),false);}
 }
});

test('private transport permits only the exact current key endpoint and receive-only join frames', async () => {
  const { validateHostedCommunitySocket, validateHostedCommunityOutbound } = await api();
  const url = authOrigin.replace('https:', 'wss:') + '/realtime/v1/websocket?apikey=' + publishable + '&vsn=2.0.0';
  assert.equal(validateHostedCommunitySocket(url, { authOrigin, publishable }), true);
  for (const replacement of [url.replace('mqxdjvsyckzocokuikmx', 'aaaaaaaaaaaaaaaaaaaa'), url + '&apikey=another', url + '&extra=private', url.replace('wss:', 'ws:')]) assert.equal(validateHostedCommunitySocket(replacement, { authOrigin, publishable }), false);
  const current = { topic, token: 'current-session-token' };
  const join = ['1', '2', topic, 'phx_join', { config: { broadcast: { ack: false, self: false }, presence: { key: '', enabled: false }, postgres_changes: [], private: true }, access_token: current.token }];
  assert.equal(validateHostedCommunityOutbound(JSON.stringify(join), current), true);
  assert.equal(validateHostedCommunityOutbound(JSON.stringify([null, '3', 'phoenix', 'heartbeat', {}]), current), true);
  assert.equal(validateHostedCommunityOutbound(JSON.stringify(['1', '4', topic, 'phx_leave', {}]), current), true);
  for (const frame of [[...join.slice(0, 4), { ...join[4] as object, access_token: 'old-session' }], ['1', '2', topic, 'broadcast', { event: 'invalidate', payload: { eventId, roomId: groupId } }], ['1', '2', topic, 'presence', {}], ['1', '2', topic.replace(groupId, eventId), 'phx_join', join[4]], [...join.slice(0, 4), { config: { private: false }, access_token: current.token }]]) assert.equal(validateHostedCommunityOutbound(JSON.stringify(frame), current), false);
});

/** Characterize the installed client at the wire boundary: auth refresh mutates
 * the retained join payload, so a reconnect sends its exact client version. */
test('installed RealtimeClient initial join, setAuth, heartbeat, leave and rejoin stay inside the pinned transport', async context => {
  const { validateHostedCommunityOutbound } = await api();
  const { createHostedCommunitySocketGate } = await import('./hosted-community-socket');
  let token = 'initial-token', denied = 0, closed = 0;
  const evidence: import('./hosted-community-socket').HostedCommunitySocketInvalidation[] = [];
  const gate = createHostedCommunitySocketGate({ readCurrent: () => ({ actorId: teacherId, schoolId, generation: 1, token, allowedRoomIds: [groupId] }),
    assertOriginalValidity: () => {}, fail: () => { denied++; }, close: () => { closed++; }, now: () => new Date('2026-10-12T10:00:00.000Z') });
  const frames: string[] = [], connections: ControlledWebSocket[] = [];
  class ControlledWebSocket {
    readonly CONNECTING = 0; readonly OPEN = 1; readonly CLOSING = 2; readonly CLOSED = 3;
    readyState = 0; url: string; protocol = ''; binaryType = 'arraybuffer';
    onopen: ((event: Event) => unknown) | null = null;
    onmessage: ((event: MessageEvent) => unknown) | null = null;
    onclose: ((event: CloseEvent) => unknown) | null = null;
    onerror: ((event: Event) => unknown) | null = null;
    constructor(address: string | URL) { this.url = String(address); connections.push(this); }
    addEventListener() {} removeEventListener() {}
    open() { this.readyState = 1; this.onopen?.(new Event('open')); }
    close() { this.readyState = 3; this.onclose?.({ code: 1000, wasClean: true } as CloseEvent); }
    send(value: string | ArrayBufferLike | Blob | ArrayBufferView) {
      assert.equal(typeof value, 'string'); assert.equal(gate.outbound(value as string), true, 'installed outbound enters current evidence owner'); frames.push(value as string);
    }
    reply(frame: unknown[]) {
      const message = JSON.stringify(frame), observed = gate.inbound(message);
      assert.equal(observed.allowed, true, 'known control frame enters current evidence owner');
      if (observed.invalidation) evidence.push(observed.invalidation);
      this.onmessage?.({ data: message } as MessageEvent);
    }
  }
  const client = new RealtimeClient(authOrigin.replace('https:', 'wss:') + '/realtime/v1', {
    params: { apikey: publishable }, transport: ControlledWebSocket, heartbeatIntervalMs: 30000,
    reconnectAfterMs: () => 0, timeout: 1000,
  });
  context.mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const channel = client.channel(topic.slice('realtime:'.length), { config: { private: true } }).on('broadcast', { event: 'invalidate' }, () => {});
    // Match the current private-channel hook: create channel, then setAuth, then subscribe.
    await client.setAuth('initial-token');
    channel.subscribe(); connections[0].open();
    const initial = JSON.parse(frames.at(-1)!) as unknown[];
    assert.equal(initial[3], 'phx_join');
    assert.equal((initial[4] as { version: string }).version, 'realtime-js/2.117.2');
    assert.equal(validateHostedCommunityOutbound(JSON.stringify(initial), { topic, token: 'initial-token' }), true, JSON.stringify(initial));
    connections[0].reply([initial[0], initial[1], topic, 'phx_reply', { status: 'ok', response: { postgres_changes: [] } }]);
    await client.sendHeartbeat(); const heartbeat = frames.at(-1)!;
    assert.equal(JSON.parse(heartbeat)[3], 'heartbeat');
    assert.equal(validateHostedCommunityOutbound(heartbeat, { topic, token: 'initial-token' }), true);
    const heartbeatFrame = JSON.parse(heartbeat);
    token = 'refresh-token';
    await client.setAuth('refresh-token');
    const updated = frames.at(-1)!; assert.equal(JSON.parse(updated)[3], 'access_token');
    assert.equal(validateHostedCommunityOutbound(updated, { topic, token: 'refresh-token' }), true);
    // This socket-level reply finishes the heartbeat issued before token rotation.
    connections[0].reply([null, heartbeatFrame[1], 'phoenix', 'phx_reply', { status: 'ok', response: {} }]);
    connections[0].reply([initial[0], null, topic, 'phx_error', {}]);
    // Use the installed reconnect path, without waiting its one-second channel timer.
    connections[0].open();
    const rejoin = JSON.parse(frames.at(-1)!) as unknown[];
    assert.equal(rejoin[3], 'phx_join');
    assert.equal((rejoin[4] as { version: string }).version, 'realtime-js/2.117.2');
    assert.equal(validateHostedCommunityOutbound(JSON.stringify(rejoin), { topic, token: 'refresh-token' }), true, 'pinned refreshed rejoin');
    for (const version of ['realtime-js/2.117.1', 'realtime-js/2.118.0', '2.117.2']) assert.equal(validateHostedCommunityOutbound(JSON.stringify([...rejoin.slice(0, 4), { ...rejoin[4] as object, version }]), { topic, token: 'refresh-token' }), false);
    connections[0].reply([rejoin[0], rejoin[1], topic, 'phx_reply', { status: 'ok', response: { postgres_changes: [] } }]);
    connections[0].reply([null, null, topic, 'broadcast', { type: 'broadcast', event: 'invalidate', payload: { eventId, roomId: groupId } }]);
    assert.deepEqual(evidence, [{ eventId, roomId: groupId, schoolId, actorId: teacherId, generation: 1,
      joinProof: { joinRef: rejoin[0], replyRef: rejoin[1] }, observedAt: '2026-10-12T10:00:00.000Z' }]);
    const leaving = channel.unsubscribe(); const leave = JSON.parse(frames.at(-1)!);
    assert.equal(leave[3], 'phx_leave');
    assert.equal(validateHostedCommunityOutbound(JSON.stringify(leave), { topic, token: 'refresh-token' }), true);
    connections[0].reply([leave[0], leave[1], topic, 'phx_reply', { status: 'ok', response: {} }]);
    assert.equal(await leaving, 'ok');
    assert.equal(denied, 0); assert.equal(closed, 0); gate.close();
  } finally {
    for (const channel of client.getChannels()) channel.teardown();
    await client.disconnect(); context.mock.timers.tick(10000); context.mock.timers.reset();
  }
});

test('private invalidation retains only an exact event and room identity from text or pinned binary protocol', async () => {
  const { readHostedCommunityInvalidation } = await api();
  const frame = JSON.stringify([null, null, topic, 'broadcast', { type: 'broadcast', event: 'invalidate', payload: { eventId, roomId: groupId } }]);
  assert.deepEqual(readHostedCommunityInvalidation(frame, { schoolId, roomId: groupId }), { eventId, roomId: groupId });
  for (const value of [frame.replace(groupId, classRoomId), frame.replace('invalidate', 'private-post'), JSON.stringify([null, null, topic, 'broadcast', { type: 'broadcast', event: 'invalidate', payload: { eventId, roomId: groupId, body: 'private content' } }])]) assert.equal(readHostedCommunityInvalidation(value, { schoolId, roomId: groupId }), null);
  const encodedTopic = Buffer.from(topic), event = Buffer.from('invalidate'), payload = Buffer.from(JSON.stringify({ eventId, roomId: groupId }));
  const binary = Buffer.concat([Buffer.from([4, encodedTopic.length, event.length, 0, 1]), encodedTopic, event, payload]);
  assert.deepEqual(readHostedCommunityInvalidation(binary, { schoolId, roomId: groupId }), { eventId, roomId: groupId });
  assert.equal(readHostedCommunityInvalidation(binary.subarray(0, 4), { schoolId, roomId: groupId }), null);
  assert.equal(readHostedCommunityInvalidation(Buffer.from([3, 1, 2, 3]), { schoolId, roomId: groupId }), null);
  assert.equal(readHostedCommunityInvalidation(frame, { schoolId, roomId: classRoomId }), null);
  assert.notEqual(teacherId, studentId);
});
