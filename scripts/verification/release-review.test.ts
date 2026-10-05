import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
const subject = await import('./release-review').catch(() => ({} as typeof import('./release-review')));
const sha='a'.repeat(40),base='b'.repeat(40),digest='c'.repeat(64),now=Date.parse('2026-10-06T12:00:00Z');
const review=(category:'source-spec-code'|'qa-regression-operations',taskId:string)=>({category,taskId,releaseSha:sha,baseSha:base,sourceManifestSha256:digest,diffSha256:digest,reportSha256:category==='source-spec-code'?'d'.repeat(64):'e'.repeat(64),evidenceSha256:digest,reviewedAt:'2026-10-06T11:00:00Z',provenance:'RETAINED_INDEPENDENT_AGENT_REPORT' as const,independenceAttested:true as const});
const input=()=>({version:1 as const,repository:'owner/repo',releaseSha:sha,baseSha:base,ciRunId:'42',manifestSha256:digest,sourceManifestSha256:digest,diffSha256:digest,web:{teamId:'team_cuevo',projectId:'prj_cuevo',target:'preview' as const},reviews:[review('source-spec-code','/root/source_reviewer'),review('qa-regression-operations','/root/qa_reviewer')]});
const expected=()=>({repository:'owner/repo',releaseSha:sha,baseSha:base,ciRunId:'42',releaseRunId:'51',runAttempt:1,environmentId:123,environmentName:'staging' as const,now,manifestSha256:digest,sourceManifestSha256:digest,diffSha256:digest,web:input().web,reviews:input().reviews.map(({category,taskId,reportSha256,evidenceSha256})=>({category,taskId,reportSha256,evidenceSha256}))});
const run=()=>({id:51,run_attempt:1,repository:{full_name:'owner/repo'},head_sha:sha,head_branch:'main',path:'.github/workflows/release.yml',event:'workflow_dispatch',status:'in_progress',conclusion:null});
function approvals(comment:string){return[{environments:[{id:123,name:'staging',created_at:'2020-01-01T00:00:00Z',updated_at:'2026-10-06T12:00:00Z'}],state:'approved',user:{id:95836629,login:'attaulhaq0',type:'User',avatar_url:'https://example.invalid/avatar'},comment}];}

test('package requires the two actual assigned report/source bindings and hashes deterministic canonical UTF-8 bytes',()=>{
 assert.equal(typeof subject.prepareReleaseReviewPackage,'function');const prepared=subject.prepareReleaseReviewPackage(input(),expected());
 assert.equal(prepared.sha256,createHash('sha256').update(prepared.canonicalJson,'utf8').digest('hex'));assert.equal(Buffer.from(prepared.base64,'base64').toString('utf8'),prepared.canonicalJson);assert.ok(Buffer.byteLength(prepared.canonicalJson)<=48*1024);
 const reordered={...input(),reviews:[...input().reviews].reverse()};assert.deepEqual(subject.prepareReleaseReviewPackage(reordered,expected()),prepared);
 assert.equal(prepared.comment,`Cuevo release admission approved: sha=${sha}; run=51; attempt=1; package=sha256:${prepared.sha256}`);
 assert.match(prepared.canonicalJson,/RETAINED_INDEPENDENT_AGENT_REPORT/);assert.doesNotMatch(prepared.canonicalJson,/approvedAt|approvalId|agentReadProven/);
});
test('package refuses missing, unknown, duplicate, stale, future, self or wrong immutable reviewer evidence',()=>{
 for(const patch of[{version:2},{privateContent:'not admitted'},{releaseSha:base},{baseSha:sha},{manifestSha256:'0'.repeat(64)},{reviews:input().reviews.slice(0,1)},{reviews:[input().reviews[0],input().reviews[0]]},{reviews:[{...input().reviews[0],taskId:'/root/author'},input().reviews[1]]},{reviews:[{...input().reviews[0],independenceAttested:false},input().reviews[1]]},{reviews:[{...input().reviews[0],reportSha256:'0'.repeat(64)},input().reviews[1]]},{reviews:[{...input().reviews[0],reviewedAt:'2026-10-06T13:00:00Z'},input().reviews[1]]},{reviews:[{...input().reviews[0],reviewedAt:'2026-10-05T11:59:59Z'},input().reviews[1]]}])assert.throws(()=>subject.prepareReleaseReviewPackage({...input(),...patch},expected()));
});
test('canonical JSON refuses non-JSON values, ambiguous numbers, accessors and noncanonical parsed text',()=>{
 assert.equal(subject.canonicalReleaseReviewJson({z:1,a:[true,null,'Arabic العربية']}),'\u007b"a":[true,null,"Arabic العربية"],"z":1}');
 for(const value of[{a:undefined},{a:NaN},{a:Infinity},{a:-0},new Date(),{get a(){return 1}}, {a:'\ud800'}])assert.throws(()=>subject.canonicalReleaseReviewJson(value));
});
test('official founder receipt admits only exact run attempt environment package comment and returns no invented approval fields',()=>{
 const prepared=subject.prepareReleaseReviewPackage(input(),expected());const receipt=subject.validateFounderReleaseApproval(prepared,run(),approvals(prepared.comment),expected());
 assert.equal(receipt.state,'approved');assert.equal(receipt.founderId,95836629);assert.equal(receipt.packageSha256,prepared.sha256);assert.equal(receipt.runAttempt,1);assert.equal('approvedAt'in receipt,false);assert.equal('approvalId'in receipt,false);
 assert.equal(subject.validateFounderReleaseApproval(prepared,{...run(),status:'waiting'},approvals(prepared.comment),expected()).state,'approved');
});
test('official missing, rejected, prior-attempt, wrong-source and conflicting history fails without latest-entry guessing',()=>{
 const prepared=subject.prepareReleaseReviewPackage(input(),expected()),entry=approvals(prepared.comment)[0];
 for(const raw of[[],[entry,entry],[entry,{...entry,state:'rejected'}],[{...entry,state:'pending'}],[{...entry,state:'rejected'}],[{...entry,user:{...entry.user,id:1}}],[{...entry,user:{...entry.user,type:'Bot'}}],[{...entry,user:{...entry.user,login:'someone'}}],[{...entry,comment:'Ship it'}],[{...entry,comment:prepared.comment.replace('attempt=1','attempt=2')}],[{...entry,environments:[{id:124,name:'staging'}]}],[{...entry,environments:[{id:123,name:'production'}]}],[{...entry,environments:[{id:123,name:'staging'},{id:124,name:'production'}]}],[{...entry,user:{login:'attaulhaq0',type:'User'}}]])assert.throws(()=>subject.validateFounderReleaseApproval(prepared,run(),raw,expected()));
 for(const patch of[{id:52},{run_attempt:undefined},{run_attempt:2},{head_sha:base},{head_branch:'feature'},{path:'.github/workflows/ci.yml'},{repository:{full_name:'fork/repo'}},{event:'pull_request'},{status:'completed',conclusion:'success'},{status:'cancelled'}])assert.throws(()=>subject.validateFounderReleaseApproval(prepared,{...run(),...patch},approvals(prepared.comment),expected()));
});
test('package bytes, digest, base64, expected source and elapsed evidence drift are refused at receipt consumption',()=>{
 const prepared=subject.prepareReleaseReviewPackage(input(),expected());for(const patch of[{sha256:'0'.repeat(64)},{canonicalJson:prepared.canonicalJson+' '},{base64:Buffer.from('{}').toString('base64')},{comment:prepared.comment+' '}])assert.throws(()=>subject.validateFounderReleaseApproval({...prepared,...patch},run(),approvals(prepared.comment),expected()));
 assert.throws(()=>subject.validateFounderReleaseApproval(prepared,run(),approvals(prepared.comment),{...expected(),now:now+86400001}));
 assert.throws(()=>subject.validateFounderReleaseApproval(prepared,run(),approvals(prepared.comment),{...expected(),manifestSha256:'0'.repeat(64)}));
});
test('re-admitting the saved package at a later clock preserves original bytes hash comment and preparation time',()=>{
 const prepared=subject.prepareReleaseReviewPackage(input(),expected());const admitted=subject.validatePreparedReleaseReviewPackage(prepared,{...expected(),now:now+3600000});assert.equal(subject.canonicalReleaseReviewJson(admitted),subject.canonicalReleaseReviewJson(prepared));
 assert.equal(subject.validateFounderReleaseApproval(prepared,run(),approvals(prepared.comment),{...expected(),now:now+3600000}).packageSha256,prepared.sha256);
 for(const text of ['{"a":1,"a":2}',' {"a":1}', '{"z":1,"a":2}','{"a":-0}'])assert.throws(()=>subject.parseCanonicalReleaseReviewJson(text));
 assert.deepEqual(subject.parseCanonicalReleaseReviewJson('{"a":1}'),{a:1});
 assert.equal(subject.canonicalReleaseReviewJson(subject.readPreparedReleaseReviewPackage(prepared.base64,{...expected(),now:now+3600000})),subject.canonicalReleaseReviewJson(prepared));
 for(const base64 of [prepared.base64+'\n','e30',Buffer.from([0xff]).toString('base64')])assert.throws(()=>subject.readPreparedReleaseReviewPackage(base64,expected()));
});
test('official evidence and prepared package cannot run getters or toJSON while being validated',()=>{
 const prepared=subject.prepareReleaseReviewPackage(input(),expected());let calls=0;
 const getter={...prepared};Object.defineProperty(getter,'canonicalJson',{enumerable:true,get(){calls++;return prepared.canonicalJson}});
 assert.throws(()=>subject.validatePreparedReleaseReviewPackage(getter,expected()));
 const row=approvals(prepared.comment)[0];const raw=[row];Object.defineProperty(raw,'0',{enumerable:true,get(){calls++;return row}});
 assert.throws(()=>subject.validateFounderReleaseApproval(prepared,run(),raw,expected()));
 const custom={...run(),toJSON(){calls++;return run()}};
 assert.throws(()=>subject.validateFounderReleaseApproval(prepared,custom,approvals(prepared.comment),expected()));assert.equal(calls,0);
 const sparse=new Array(1);assert.throws(()=>subject.canonicalReleaseReviewJson(sparse));const cyclic:Record<string,unknown>={};cyclic.self=cyclic;assert.throws(()=>subject.canonicalReleaseReviewJson(cyclic));
});
test('an unrelated valid environment cannot replace the target and malformed unrelated evidence remains unverified',()=>{
 const prepared=subject.prepareReleaseReviewPackage(input(),expected()),target=approvals(prepared.comment)[0];const other={...target,environments:[{id:124,name:'production'}],state:'rejected',comment:'Separate environment'};
 assert.equal(subject.validateFounderReleaseApproval(prepared,run(),[other,target],expected()).state,'approved');
 assert.throws(()=>subject.validateFounderReleaseApproval(prepared,run(),[{...other,state:'unknown'},target],expected()));
 assert.throws(()=>subject.prepareReleaseReviewPackage(input(),{...expected(),releaseRunId:'9007199254740993'}));
});

test('proxy approval and array cannot substitute a comment or execute traps at the JSON boundary',()=>{
 const prepared=subject.prepareReleaseReviewPackage(input(),expected());let calls=0;
 const entry=new Proxy({...approvals(prepared.comment)[0],comment:'Ship it'},{get(target,key,receiver){calls++;return key==='comment'?prepared.comment:Reflect.get(target,key,receiver)}});
 assert.throws(()=>subject.validateFounderReleaseApproval(prepared,run(),[entry],expected()));
 const array=new Proxy([approvals(prepared.comment)[0]],{get(target,key,receiver){calls++;return Reflect.get(target,key,receiver)}});
 assert.throws(()=>subject.validateFounderReleaseApproval(prepared,run(),array,expected()));assert.equal(calls,0);
});

test('a missing own approval comment cannot be supplied by an inherited getter',()=>{
 const prepared=subject.prepareReleaseReviewPackage(input(),expected());let calls=0;
 const entry:Record<string,unknown>={...approvals(prepared.comment)[0]};delete entry.comment;
 const original=Object.getOwnPropertyDescriptor(Object.prototype,'comment');
 try{Object.defineProperty(Object.prototype,'comment',{configurable:true,get(){calls++;return prepared.comment}});assert.throws(()=>subject.validateFounderReleaseApproval(prepared,run(),[entry],expected()));}
 finally{if(original)Object.defineProperty(Object.prototype,'comment',original);else delete (Object.prototype as Record<string,unknown>).comment;}
 assert.equal(calls,0);
});

test('the public web sink identity is bound before approval and cannot drift at later consumption',()=>{
 const prepared=subject.prepareReleaseReviewPackage(input(),expected());
 for(const web of [{...input().web,teamId:'team_other'},{...input().web,projectId:'prj_other'},{...input().web,target:'production' as const}]){
  assert.throws(()=>subject.prepareReleaseReviewPackage({...input(),web},expected()));
  assert.throws(()=>subject.validatePreparedReleaseReviewPackage(prepared,{...expected(),web}));
 }
});
