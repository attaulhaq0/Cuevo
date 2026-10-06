import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as owner from './backend-hosted-learning-loop';
import type { CustomerLearningLoopCommandObservation, CustomerLearningLoopMutationIntent } from '../../tests/e2e/customer-learning-loop';
import type { HostedLearningLoopJournal, HostedLearningLoopJournalOriginal } from './hosted-learning-loop-journal';
import type { Request } from '@playwright/test';

const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const seed=JSON.parse(readFileSync(resolve(import.meta.dirname,'../../supabase/seed/identities.json'),'utf8'));
const actor=(index:number)=>seed.actors[index-1];
const selection={admin:actor(1).actorId,coordinator:actor(2).actorId,teacher:actor(4).actorId,student:actor(12).actorId,parent:actor(72).actorId};
const context={schoolId:seed.schoolId,classId:'30000000-0000-4000-8000-000000000001',subjectId:'43000000-0000-4000-8000-000000000001',referenceId:'61000000-0000-4000-8000-000000000001'};
const identity={projectRef:'mqxdjvsyckzocokuikmx',schoolId:seed.schoolId,sourceSha:'a'.repeat(40),treeSha:'b'.repeat(40),ciRunId:'31',runId:'81',runAttempt:2,backendTransferSha256:'d'.repeat(64),webDeploymentId:'dpl_Web'};
const courseId='e8000000-0000-4000-8000-000000000001';
const body={classId:context.classId,subjectId:context.subjectId,title:'Checking work',description:'Reviewed synthetic explanation'};

test('selects exactly the five source-locked related fictional actors and rejects school, duplicate and unrelated selections',()=>{
 assert.equal(typeof owner.selectHostedLearningLoopActors,'function');
 const actors=owner.selectHostedLearningLoopActors(seed,selection);
 assert.equal(actors.length,5);assert.deepEqual(actors.map(row=>row.actorId),Object.values(selection));
 for(const selected of [{...selection,parent:actor(73).actorId},{...selection,student:actor(133).actorId},{...selection,teacher:actor(5).actorId},{...selection,coordinator:selection.teacher}])assert.throws(()=>owner.selectHostedLearningLoopActors(seed,selected),/requires review/);
 assert.throws(()=>owner.selectHostedLearningLoopActors({...seed,actors:seed.actors.map((row:unknown,index:number)=>index===11?{...actor(12),schoolId:seed.denialSchoolId}:row)},selection));
});

test('parses the exact owner schema before computing its native fingerprint, keeping byte identity separate',()=>{
 assert.equal(typeof owner.parseHostedLearningLoopCommand,'function');
 const bytes=JSON.stringify({...body,title:'  Checking work  '});
 const command=owner.parseHostedLearningLoopCommand('/v1/courses',bytes,actor(4));
 assert.equal(command.operation,'course.create');assert.equal(command.targetId,null);
 assert.equal(command.requestBodySha256,hash(bytes));
 assert.equal(command.nativeFingerprint,hash(JSON.stringify({command:'course.create',targetId:null,input:body})));
 assert.notEqual(command.nativeFingerprint,command.requestBodySha256);
 for(const [path,value] of [['/v1/courses/foreign/publish','{}'],['/v1/diagnostics/browser','{}'],['/v1/courses',JSON.stringify({...body,schoolId:seed.schoolId})],['/v1/courses',JSON.stringify({...body,classId:'foreign'})],['/v1/courses','[]']])assert.throws(()=>owner.parseHostedLearningLoopCommand(path,value,actor(4)),/requires review/);
 assert.throws(()=>owner.parseHostedLearningLoopCommand('/v1/courses',bytes,actor(12)),/requires review/);
});

test('policy fingerprints pin the actual current hosted manifest and never permit live activation or a local fallback',()=>{
 const manifest={version:'teacher-insight-1',purpose:'NEXT_LEARNING_ACTION',capabilities:['GROUNDED_EXPLANATION','RECOMMENDATION'],mode:'FIXTURE',provider:'deterministic-fixture',model:'source-locked-v1',promptId:'next-learning-action',promptVersion:'1',promptDigest:'f'.repeat(64),promptSource:'SOURCE_CONTROLLED_TASK_POLICY',promptEffectiveAt:'2026-10-01T00:00:00.000Z',evaluationVersion:'source-78-checked-evidence-1',dataClassification:'SCHOOL_CUSTOM_NUMERIC',providerDataPolicy:'HOSTED_SYNTHETIC_FIXTURE',maxOutputTokens:1000,timeoutMs:10000,maxCost:1};
 const input={purpose:'NEXT_LEARNING_ACTION',dataClassification:'SCHOOL_CUSTOM_NUMERIC',fixtureEnabled:true,liveEnabled:false,allowedActions:['GUIDED_PRACTICE','REVIEW_FEEDBACK'],expectedVersion:1,confirmApproval:true,reason:'Reviewed the current hosted synthetic fixture'};
 const command=owner.parseHostedLearningLoopCommand('/v1/intelligence/policy',JSON.stringify(input),actor(1),manifest);
 assert.equal(command.nativeFingerprint,hash(JSON.stringify({input,executionManifest:manifest})));
 for(const current of [undefined,{...manifest,mode:'LIVE'}, {...manifest,providerDataPolicy:'LOCAL_SYNTHETIC_FIXTURE'}])assert.throws(()=>owner.parseHostedLearningLoopCommand('/v1/intelligence/policy',JSON.stringify(input),actor(1),current));
 assert.throws(()=>owner.parseHostedLearningLoopCommand('/v1/intelligence/policy',JSON.stringify({...input,liveEnabled:true}),actor(1),manifest));
});

test('native bridge retains only schema-checked learner projection and binds the observed learner',()=>{
 assert.equal(typeof owner.reduceHostedLearningLoopProjection,'function');
 assert.throws(()=>owner.reduceHostedLearningLoopProjection({learnerId:actor(12).actorId,status:'READY',freshness:'CURRENT'},actor(12).actorId));
 assert.throws(()=>owner.reduceHostedLearningLoopProjection({learnerId:actor(13).actorId,status:'UNKNOWN'},actor(12).actorId));
});

function fixture(options:{persistFailure?:boolean;forwardFailure?:boolean;admissionFailure?:boolean}={}){
 const events:string[]=[],rows:{original:HostedLearningLoopJournalOriginal;state:string}[]=[];
 let sequence=0;
 const journal:HostedLearningLoopJournal={
  intent:async command=>{events.push('durable-intent');const original={identity,command:command as HostedLearningLoopJournalOriginal['command'],intentSequence:++sequence,intentRecordSha256:hash(String(sequence))};rows.push({original,state:'INTENT'});return original;},
  startForwarding:async(original,forward)=>{events.push('durable-forwarding');const row=rows.find(row=>row.original===original)!;row.state='FORWARDING_AUTHORIZED';try{return await forward();}catch{row.state='UNCERTAIN';throw Error('withheld');}},
  recordHttpReceipt:async(original)=>{events.push('durable-http');rows.find(row=>row.original===original)!.state='HTTP_CONFIRMED';},
  recordNativeConfirmation:async()=>{throw Error('No native proof is available');},
  markUncertain:async(original)=>{events.push('uncertain');rows.find(row=>row.original===original)!.state='UNCERTAIN';},
  read:async()=>({records:[],commands:rows.map(row=>({...row,httpReceiptSha256:null,nativeReceiptSha256:null})) as Awaited<ReturnType<HostedLearningLoopJournal['read']>>['commands'],lastRecordSha256:null,evidence:'LOCAL_DURABLE_METADATA_ONLY',hostedAcceptance:false,runnerLossRecoveryVerified:false}),
 };
 const gate=owner.createHostedLearningLoopCommandGate({apiOrigin:'https://api.fixture.invalid',identity,context,journal,
  readmit:async()=>{events.push('readmit');if(options.admissionFailure)throw Error('withheld');},
  persist:async(name,value)=>{events.push(name.endsWith('.intent.json')?'companion-intent':'companion-http');assert.doesNotMatch(JSON.stringify(value),/Reviewed synthetic explanation|Checking work|Bearer|private-token/);if(options.persistFailure)throw Error('withheld');return hash(JSON.stringify(value));},
 });
 gate.session(actor(4),'private-token',1);
 const intent:CustomerLearningLoopMutationIntent={path:'/v1/courses',actor:actor(4),scopeGeneration:1};
 // Only the documented Request methods consumed by the gate are simulated;
 // this controlled port test makes no claim to real browser/provider traffic.
 const request={url:()=> 'https://api.fixture.invalid/v1/courses',method:()=> 'POST',headers:()=>({'x-school-id':seed.schoolId,authorization:'Bearer private-token','idempotency-key':'original-key-1','content-type':'application/json'}),postDataBuffer:()=>Buffer.from(JSON.stringify(body))} as unknown as Request;
 const forward=async()=>{events.push('forward');if(options.forwardFailure)throw Error('withheld');};
 const receipt={id:courseId,...body,status:'DRAFT',createdAt:'2026-10-06T00:00:00.000Z'};
 const observation={...intent,request,key:'original-key-1',body,receipt,status:200} satisfies CustomerLearningLoopCommandObservation;
 return{gate,events,rows,intent,request,forward,observation};
}

test('provider readmission runs before the visible action; durable intent and companion precede route forwarding',async()=>{
 assert.equal(typeof owner.createHostedLearningLoopCommandGate,'function');
 const f=fixture();await f.gate.prepare(f.intent);assert.deepEqual(f.events,['readmit']);
 await f.gate.forward(f.request,f.forward);
 assert.deepEqual(f.events,['readmit','durable-intent','companion-intent','durable-forwarding','forward']);
 await f.gate.confirm(f.observation,'server-request-1');
 assert.equal(f.rows[0].state,'HTTP_CONFIRMED');assert.equal(f.gate.confirmedCount(),1);
 assert.deepEqual(f.events.slice(-2),['companion-http','durable-http']);
 assert.equal((await f.gate.read()).commands[0].state,'HTTP_CONFIRMED');
});

test('foreign actor, school, key, body, request and missing receipt versions never advance an admitted command',async()=>{
 for(const change of ['actor','school','key','body','request','receipt','version']){
  const f=fixture();await f.gate.prepare(f.intent);
  if(change==='actor'){f.gate.session(actor(12),'private-token',2);await assert.rejects(f.gate.forward(f.request,f.forward));assert(!f.events.includes('forward'));continue;}
  if(change==='school'){const request={...f.request,headers:()=>({...f.request.headers(),'x-school-id':seed.denialSchoolId})};await assert.rejects(f.gate.forward(request as Request,f.forward));assert(!f.events.includes('forward'));continue;}
  await f.gate.forward(f.request,f.forward);
  const changed={...f.observation,...(change==='key'?{key:'replacement-key'}:change==='body'?{body:{...body,title:'Foreign body'}}:change==='request'?{request:{...f.request} as Request}:change==='receipt'?{receipt:{id:courseId,title:'wrong'}}:{receipt:{...f.observation.receipt,status:undefined}})};
  await assert.rejects(f.gate.confirm(changed,'server-request-1'));assert.equal(f.gate.confirmedCount(),0);assert.equal(f.rows[0].state,'UNCERTAIN',change);
  await assert.rejects(f.gate.prepare(f.intent));assert.equal(f.events.filter(value=>value==='forward').length,1);
 }
});

test('intent companion failure, uncertain forwarding and admission expiry stop without replacement commands',async()=>{
 for(const options of [{persistFailure:true},{forwardFailure:true},{admissionFailure:true}]){
  const f=fixture(options);
  if(options.admissionFailure)await assert.rejects(f.gate.prepare(f.intent));else{await f.gate.prepare(f.intent);await assert.rejects(f.gate.forward(f.request,f.forward));}
  assert.equal(f.events.includes('forward'),Boolean(options.forwardFailure));
  await assert.rejects(f.gate.prepare(f.intent));assert.equal(f.gate.confirmedCount(),0);
 }
});

test('unplanned domain paths and cross-origin traffic stay outside the hosted GET and command boundary',()=>{
 assert.equal(typeof owner.hostedLearningLoopReadAllowed,'function');
 for(const path of ['/v1/me','/v1/courses?limit=100','/v1/learners/'+selection.student+'/state','/v1/classes/'+context.classId+'/learning-summary'])assert.equal(owner.hostedLearningLoopReadAllowed(path,context,selection.student),true,path);
 for(const path of ['/v1/learners/'+actor(133).actorId+'/state','/v1/intelligence/provider','/v1/diagnostics/browser','/v1/assets','/v1/courses?secret=private','/v1/courses/../school','/v1/me#foreign'])assert.equal(owner.hostedLearningLoopReadAllowed(path,context,selection.student),false,path);
});

test('actual hosted entry is a separate current-main manual web consumer and cannot run from ordinary local tests',async()=>{
 assert.equal(typeof owner.verifyHostedLearningLoop,'function');
 let admitted=0;const result=await owner.verifyHostedLearningLoop({}, {readmitWeb:async()=>{admitted++;throw Error('withheld');}});
 assert.equal(result.purpose,'CUEVO_HOSTED_LEARNING_LOOP_UI');assert.equal(result.status,'REQUIRES_REVIEW');assert.equal(admitted,0);
 for(const field of ['nativeChainVerified','coreLearningLoopVerified','customerReady','hostedAcceptance','allNestedWorkflowAcceptance','runnerLossRecoveryVerified'])assert.equal(result[field as keyof typeof result],false);
 assert.doesNotMatch(JSON.stringify(result),/private-token|access_token|refresh_token/);
});

test('fresh web admission rejects replaced source, CI, attempt, transfer, artifact, population, endpoint or expired original proof',()=>{
 assert.equal(typeof owner.validateHostedLearningLoopWebAdmission,'function');
 const now=Date.now(),current={purpose:'PREBUILD_RELEASE_ADMISSION' as const,sourceSha:identity.sourceSha,treeSha:identity.treeSha,ciRunId:identity.ciRunId,runId:identity.runId,runAttempt:identity.runAttempt,webDeploymentId:identity.webDeploymentId,artifactSha256:'e'.repeat(64),packageSha256:'f'.repeat(64),webPackageExpiresAt:new Date(now+60000).toISOString(),backendTransferSha256:identity.backendTransferSha256,populationReceiptSha256:'c'.repeat(64),apiOrigin:'https://api.fixture.invalid',authOrigin:'https://auth.fixture.invalid',webOrigin:'https://web.fixture.invalid',observedAt:new Date(now).toISOString()};
 const expected={...current,consumptionExpiresAt:new Date(now+60000).toISOString()};
 assert.deepEqual(owner.validateHostedLearningLoopWebAdmission(current,expected,now),current);
 for(const changed of [{sourceSha:'f'.repeat(40)},{treeSha:'f'.repeat(40)},{ciRunId:'32'},{runAttempt:3},{backendTransferSha256:'f'.repeat(64)},{artifactSha256:'a'.repeat(64)},{populationReceiptSha256:'a'.repeat(64)},{apiOrigin:'https://foreign.invalid'},{webDeploymentId:'dpl_Old'},{observedAt:new Date(now-30001).toISOString()},{observedAt:new Date(now+1).toISOString()},{webPackageExpiresAt:new Date(now).toISOString()}])assert.throws(()=>owner.validateHostedLearningLoopWebAdmission({...current,...changed},expected,now),/requires review/);
 for(const consumptionExpiresAt of ['unknown',new Date(now).toISOString()])assert.throws(()=>owner.validateHostedLearningLoopWebAdmission(current,{...expected,consumptionExpiresAt},now),/requires review/);
});

test('the native original command chain accepts only prior owned targets and exact numeric source values',async()=>{
 const f=fixture();let key=1,actorValue=actor(4),scope=1;
 const id=(index:number)=>'e8000000-0000-4000-8000-'+String(index).padStart(12,'0');
 const course=id(1),unit=id(2),lesson=id(3),activity=id(4),assessment=id(5),draft=id(6),submission=id(7),mark=id(8),result=id(9),evidence=id(10),proposal=id(11),run=id(12),intervention=id(13),followAssessment=id(14),followSubmission=id(15),followMark=id(16),followResult=id(17),followEvidence=id(18),outcome=id(19),portfolio=id(20),revision=id(21);
 const send=async(path:string,input:Record<string,unknown>,receipt:Record<string,unknown>)=>{const originalKey='full-original-'+key++,bytes=JSON.stringify(input),request={url:()=> 'https://api.fixture.invalid'+path,method:()=> 'POST',headers:()=>({'x-school-id':seed.schoolId,authorization:'Bearer private-token','idempotency-key':originalKey,'content-type':'application/json'}),postDataBuffer:()=>Buffer.from(bytes)} as unknown as Request,intent={path,actor:actorValue,scopeGeneration:scope};await f.gate.prepare(intent);await f.gate.forward(request,async()=>{});await f.gate.confirm({...intent,request,key:originalKey,body:input,receipt:receipt as CustomerLearningLoopCommandObservation['receipt'],status:200},'server-'+key);};
 const changeActor=(index:number)=>{f.gate.endSession();actorValue=actor(index);scope+=2;f.gate.session(actorValue,'private-token',scope);};
 const assessmentRow=(target:string)=>({id:target,courseId:course,title:'Checking assessment',model:'numeric',maxScore:10,policyVersion:2,preparationVersion:2,availabilityVersion:1,status:'PUBLISHED',referenceId:context.referenceId});
 const createAssessment=async(target:string)=>{await send('/v1/assessments',{courseId:course,title:'Checking assessment',instructions:'Explain',maxScore:10,preparation:true,intendedSubmissionKind:'TEXT',intendedModel:'numeric'},{...assessmentRow(target),status:'DRAFT',policyVersion:1,preparationVersion:1});await send('/v1/assessments/'+target+'/preparation',{title:'Checking assessment',instructions:'Explain',dueAt:null,maxScore:10,referenceId:context.referenceId,rubricId:null,expectedPreparationVersion:1},assessmentRow(target));await send('/v1/assessments/'+target+'/publish',{expectedPreparationVersion:2,expectedPolicyVersion:2,expectedAvailabilityVersion:1},assessmentRow(target));};
 const release=async(task:string,submitted:string,marked:string,released:string,sourceEvidence:string,score:number)=>{await send('/v1/submissions/'+submitted+'/results',{score,feedback:'Teacher reviewed',expectedPolicyVersion:2,expectedRevision:0,sourceEvidence:true},{id:marked,submissionId:submitted,learnerId:selection.student,referenceId:context.referenceId,policyVersion:2,revision:1,status:'REVIEW',score});await send('/v1/results/'+marked+'/release',{expectedRevision:1,parentVisible:true},{id:released,submissionId:submitted,assessmentId:task,learnerId:selection.student,referenceId:context.referenceId,evidenceId:sourceEvidence,referenceVersion:'synthetic-school-1',policyVersion:2,revision:1,status:'RELEASED',parentVisible:true,score,maxScore:10,nativeResult:{type:'numeric',score,maxScore:10,policyVersion:2}});};
 await send('/v1/courses',body,{id:course,...body,status:'DRAFT'});await send('/v1/courses/'+course+'/units',{title:'Unit',sequence:1},{id:unit,title:'Unit',sequence:1});await send('/v1/units/'+unit+'/lessons',{title:'Lesson',sequence:1,body:'School example'},{id:lesson,title:'Lesson',sequence:1,body:'School example'});await send('/v1/lessons/'+lesson+'/activities',{title:'Practice',sequence:1,kind:'practice',instructions:'Check'},{id:activity,title:'Practice',sequence:1,kind:'practice',instructions:'Check'});await send('/v1/courses/'+course+'/publish',{}, {id:course,...body,status:'PUBLISHED'});await createAssessment(assessment);
 changeActor(12);await send('/v1/activities/'+activity+'/complete',{}, {id:id(22),activityId:activity,learnerId:selection.student,completedAt:'2026-10-06T00:00:00.000Z'});await send('/v1/assessments/'+assessment+'/draft',{content:'Checked',expectedRevision:0},{id:draft,assessmentId:assessment,status:'DRAFT',revision:1});await send('/v1/assessments/'+assessment+'/submissions',{content:'Checked'},{id:submission,assessmentId:assessment,learnerId:selection.student,status:'SUBMITTED',revision:1,submittedAt:'2026-10-06T00:00:00.000Z'});
 changeActor(4);await release(assessment,submission,mark,result,evidence,2);await send('/v1/intelligence/analyze',{baselineResultId:result},{id:proposal,baselineResultId:result,origin:'AI_GENERATED',generationMode:'FIXTURE',intelligenceRunId:run,learnerId:selection.student,referenceId:context.referenceId,evidenceIds:[evidence],status:'AWAITING_HUMAN'});await send('/v1/recommendations/'+proposal+'/decision',{decision:'APPROVE',reason:'Reviewed'},{id:proposal,recommendationId:proposal,decision:'APPROVE',status:'APPROVED',interventionId:intervention});
 changeActor(12);await send('/v1/interventions/'+intervention+'/complete',{}, {id:intervention,recommendationId:proposal,learnerId:selection.student,referenceId:context.referenceId,baselineResultId:result,status:'COMPLETED',completedAt:'2026-10-06T00:00:00.000Z',followUpAssessmentId:null});changeActor(4);await createAssessment(followAssessment);changeActor(12);await send('/v1/assessments/'+followAssessment+'/submissions',{content:'Checked again'},{id:followSubmission,assessmentId:followAssessment,learnerId:selection.student,status:'SUBMITTED',revision:1,submittedAt:'2026-10-06T00:00:00.000Z'});changeActor(4);await release(followAssessment,followSubmission,followMark,followResult,followEvidence,7);
 await send('/v1/interventions/'+intervention+'/reassessment',{assessmentId:followAssessment},{id:intervention,recommendationId:proposal,learnerId:selection.student,referenceId:context.referenceId,baselineResultId:result,status:'COMPLETED',completedAt:'2026-10-06T00:00:00.000Z',followUpAssessmentId:followAssessment});await send('/v1/interventions/'+intervention+'/measure',{followUpResultId:followResult,minimumChange:1},{id:outcome,interventionId:intervention,baselineResultId:result,followUpResultId:followResult,baseline:{score:2,maxScore:10},followUp:{score:7,maxScore:10},difference:5,minimumChange:1,status:'improved',limitation:'OBSERVED_CHANGE_NOT_CAUSAL_PROOF',measuredAt:'2026-10-06T00:00:00.000Z'});
 changeActor(12);await send('/v1/portfolio/items',{evidenceId:followEvidence,sourceModel:'numeric',title:'Selected checked work',reflection:'Reviewed'}, {id:portfolio,revisionId:revision,revision:1,status:'AWAITING_REVIEW'});changeActor(4);await send('/v1/portfolio/items/'+portfolio+'/review',{expectedRevision:1,feedback:'Reviewed',featured:false,parentVisible:true,confirmParentApproval:true,confirmSourceReview:true},{id:portfolio,revisionId:revision,revision:1,status:'REVIEWED'});await send('/v1/portfolio/items/'+portfolio+'/parent-revoke',{reason:'Reviewed withdrawal'},{id:portfolio,revisionId:revision,revision:1,status:'PARENT_REVOKED'});
 assert.equal(f.gate.confirmedCount(),27);assert.equal((await f.gate.read()).commands.every(row=>row.state==='HTTP_CONFIRMED'),true);
 assert.doesNotMatch(JSON.stringify(f.gate.receipts()),/Checked again|Teacher reviewed|School example|Reviewed withdrawal/);
});
