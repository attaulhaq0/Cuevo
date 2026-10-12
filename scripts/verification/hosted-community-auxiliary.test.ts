import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const schoolId='10000000-0000-4000-8000-000000000001',foreignSchool='10000000-0000-4000-8000-000000000002',classId='30000000-0000-4000-8000-000000000001';
const groupId='93000000-0000-4000-8000-000000000001',classRoomId='93000000-0000-4000-8000-000000000002';
const ids={peer:'20000000-0000-4000-8000-000000000018',outside:'20000000-0000-4000-8000-000000000013',foreign:'20000000-0000-4000-8000-000000000133'};
const at=(second:number)=>new Date(Date.UTC(2026,9,12,10,0,second)).toISOString();
const expected={groupId,classRoomId,observedAfter:at(0),observedBefore:at(30)};
function fixture(){return{sessionsStarted:3,sessionsClosed:3,observations:(['peer','outside','foreign'] as const).map((kind,index)=>({kind,actorId:ids[kind],schoolId:kind==='foreign'?foreignSchool:schoolId,generation:1,groupId,classRoomId,api:(kind==='peer'?['GROUP_POSTS','GROUP_ROSTER']:['GROUP_POSTS','CLASS_POSTS']).map((target,read)=>({target,status:403,code:'FORBIDDEN',requestId:'original-'+kind+'-'+read,observedAt:at(index*5+2+read)})),joins:[{actorId:ids[kind],schoolId,generation:1,roomId:groupId,joinRef:'1',replyRef:'1',status:kind==='peer'?'JOINED':'DENIED',observedAt:at(index*5+1)},{actorId:ids[kind],schoolId,generation:1,roomId:kind==='peer'?groupId:classRoomId,joinRef:'2',replyRef:'2',status:'DENIED',observedAt:at(index*5+4)}],uiGroupOpened:kind==='peer',sessionClosed:true}))};}
async function api(){const owner:Record<string,unknown>=await import(pathToFileURL(resolve(import.meta.dirname,'hosted-community-auxiliary.ts')).href).catch(error=>{if((error as NodeJS.ErrnoException).code!=='ERR_MODULE_NOT_FOUND')throw error;return{};});assert.equal(typeof owner.parseHostedCommunityAuxiliaryObservation,'function','one strict auxiliary evidence parser is required');assert.equal(typeof owner.validateHostedCommunityAuxiliaryCompletion,'function','finite completion checks are required');return owner as typeof import('./hosted-community-auxiliary');}

test('auxiliary evidence has an explicit empty unknown observation and a detached strict factual parser',async()=>{
 const owner=await api(),empty=owner.emptyHostedCommunityAuxiliaryObservation();assert.deepEqual(empty,{sessionsStarted:0,sessionsClosed:0,observations:[]});empty.observations.push(fixture().observations[0] as never);assert.deepEqual(owner.emptyHostedCommunityAuxiliaryObservation(),{sessionsStarted:0,sessionsClosed:0,observations:[]});
 const value=fixture(),parsed=owner.parseHostedCommunityAuxiliaryObservation(value);assert.deepEqual(parsed,value);parsed.observations[0].api[0].requestId='changed';assert.equal(value.observations[0].api[0].requestId,'original-peer-0');assert.throws(()=>owner.validateHostedCommunityAuxiliaryCompletion(owner.emptyHostedCommunityAuxiliaryObservation(),expected));
 assert.doesNotMatch(JSON.stringify(parsed),/token|Bearer|nativeExecution|hostedAcceptance|customerReady/);
});

test('complete auxiliary facts retain ordered actor own schools and target-school join outcomes',async()=>{
 const owner=await api(),value=fixture(),completed=owner.validateHostedCommunityAuxiliaryCompletion(value,expected);assert.deepEqual(completed,value);assert.equal(completed.observations[2].schoolId,foreignSchool);assert.equal(completed.observations[2].joins[0].schoolId,schoolId);
 assert.equal(completed.observations[0].uiGroupOpened,true);assert.equal(completed.observations[0].joins[0].status,'JOINED');assert(completed.observations.slice(1).every(row=>!row.uiGroupOpened&&row.joins.every(join=>join.status==='DENIED')));
});

test('strict auxiliary parsing refuses secrets claims unknown states identities and unbounded facts',async()=>{
 const owner=await api();
 for(const mode of ['secret','claim','actor','kind','school','status','code','request','join-secret','join-school','join-status','four','three-api','three-joins','bad-date','fractional','negative']){
  const value=fixture() as unknown as Record<string,unknown>,rows=value.observations as Record<string,unknown>[],apiRows=rows[0].api as Record<string,unknown>[],joins=rows[0].joins as Record<string,unknown>[];
  if(mode==='secret')value.token='private-canary';if(mode==='claim')value.hostedAcceptance=true;if(mode==='actor')rows[0].actorId=ids.outside;if(mode==='kind')rows[0].kind='other';if(mode==='school')rows[2].schoolId=schoolId;if(mode==='status')apiRows[0].status=200;if(mode==='code')apiRows[0].code='UNKNOWN';if(mode==='request')apiRows[0].requestId='private request\nbody';if(mode==='join-secret')joins[0].token='private-canary';if(mode==='join-school')joins[0].schoolId=foreignSchool;if(mode==='join-status')joins[0].status='UNKNOWN';if(mode==='four')value.sessionsStarted=4;if(mode==='three-api')apiRows.push(apiRows[0]);if(mode==='three-joins')joins.push(joins[0]);if(mode==='bad-date')apiRows[0].observedAt='UNKNOWN';if(mode==='fractional')value.sessionsClosed=0.5;if(mode==='negative')value.sessionsStarted=-1;
  assert.throws(()=>owner.parseHostedCommunityAuxiliaryObservation(value),/requires review/,mode);
 }
});

test('completion refuses missing counts uniqueness order closure source or generation',async()=>{
 const owner=await api();
 for(const mode of ['missing','count-start','count-close','duplicate','order','open','session-close','generation','group','class','class-is-group','class-is-classId','missing-api','duplicate-api','wrong-api','reused-request','missing-join','foreign-joined','peer-denied','peer-wrong-room','join-ref','join-actor','join-generation']){
  const value=fixture();const rows=value.observations;
  if(mode==='missing')rows.pop();if(mode==='count-start')value.sessionsStarted=2;if(mode==='count-close')value.sessionsClosed=2;if(mode==='duplicate')rows[1]=structuredClone(rows[0]);if(mode==='order')rows.reverse();if(mode==='open')rows[1].uiGroupOpened=true;if(mode==='session-close')rows[0].sessionClosed=false;if(mode==='generation')rows[1].generation=2;if(mode==='group')rows[0].groupId=classRoomId;if(mode==='class')rows[0].classRoomId=groupId;if(mode==='class-is-group')rows.forEach(row=>row.classRoomId=groupId);if(mode==='class-is-classId')rows.forEach(row=>row.classRoomId=classId);if(mode==='missing-api')rows[0].api.pop();if(mode==='duplicate-api')rows[0].api[1]=structuredClone(rows[0].api[0]);if(mode==='wrong-api')rows[1].api[1].target='GROUP_ROSTER';if(mode==='reused-request')rows[2].api[1].requestId=rows[0].api[0].requestId;if(mode==='missing-join')rows[0].joins.pop();if(mode==='foreign-joined')rows[2].joins[0].status='JOINED';if(mode==='peer-denied')rows[0].joins[0].status='DENIED';if(mode==='peer-wrong-room')rows[0].joins[1].roomId=classRoomId;if(mode==='join-ref')rows[0].joins[0].replyRef='2';if(mode==='join-actor')rows[0].joins[0].actorId=ids.outside;if(mode==='join-generation')rows[0].joins[0].generation=2;
  assert.throws(()=>owner.validateHostedCommunityAuxiliaryCompletion(value,expected),/requires review/,mode);
 }
});

test('completion preserves exact time boundaries and refuses reverse source observation windows',async()=>{
 const owner=await api();assert.doesNotThrow(()=>owner.validateHostedCommunityAuxiliaryCompletion(fixture(),{...expected,observedAfter:at(1),observedBefore:at(14)}));
 for(const mode of ['before','after','reverse-joins','reverse-api','peer-api-before-join','reverse-sessions']){const value=fixture();if(mode==='before')value.observations[0].joins[0].observedAt=at(0);if(mode==='after')value.observations[2].joins[1].observedAt=at(31);if(mode==='reverse-joins')value.observations[0].joins[1].observedAt=at(0);if(mode==='reverse-api')value.observations[0].api[1].observedAt=at(1);if(mode==='peer-api-before-join')value.observations[0].api[0].observedAt=at(0);if(mode==='reverse-sessions')value.observations[1].joins[0].observedAt=at(1);assert.throws(()=>owner.validateHostedCommunityAuxiliaryCompletion(value,{...expected,observedAfter:at(1)}),/requires review/,mode);}
 for(const change of [{observedAfter:at(30)},{observedBefore:'unknown'},{groupId:classRoomId},{classRoomId:groupId},{classRoomId:classId},{extra:true}])assert.throws(()=>owner.validateHostedCommunityAuxiliaryCompletion(fixture(),{...expected,...change}),/requires review/);
});

test('auxiliary parser refuses proxies and accessors without evaluating their traps',async()=>{
 const owner=await api();let traps=0;const original=fixture(),proxy=new Proxy(original,{get(){traps++;throw Error('private');},ownKeys(){traps++;throw Error('private');}}),getter={sessionsStarted:3,sessionsClosed:3,get observations(){traps++;return original.observations;}};
 assert.throws(()=>owner.parseHostedCommunityAuxiliaryObservation(proxy));assert.throws(()=>owner.parseHostedCommunityAuxiliaryObservation(getter));assert.throws(()=>owner.validateHostedCommunityAuxiliaryCompletion(original,new Proxy(expected,{get(){traps++;throw Error('private');},ownKeys(){traps++;throw Error('private');}})));assert.equal(traps,0);
});
