import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {resolve,join,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {original231RecoveryPlanFixture,originalPrefixCustodyJournalFixture,originalChildNative124JournalFixture} from './hosted-original-child-recovery.fixture';
import {expandOriginalNative180RecoveryTemplate,readOriginalNative180RetainedChild} from './hosted-original-child-recovery';
import {requireOriginal231InactiveDefinitionCustody} from './hosted-original231-transport-observation';
import {planHostedMigrations,canonicalHostedMigrationPlan} from './hosted-migration-plan';

const migration='20261015110814_sql_cron_managed_transport.sql';
const custodyHash=(value:string)=>createHash('sha256').update(value).digest('hex');
function originalCustody(){
 const template=fixture().original231Recovery.template,native=expandOriginalNative180RecoveryTemplate(JSON.parse(template.native180ReceiptJson).template,template.stageRows.slice(0,180)),child=readOriginalNative180RetainedChild(native).template,native124=originalChildNative124JournalFixture();
 const journals=[...originalPrefixCustodyJournalFixture(),...[template,native,child].map(saved=>({identity:saved.originalIdentity,ownerJson:saved.ownerJson,recordJson:saved.recordJson,state:'REQUIRES_REVIEW'})),{identity:JSON.parse(native124.ownerJson).identity,ownerJson:native124.ownerJson,recordJson:[native124.record1Json,native124.terminalJson],state:'COMMITTED'}];
 const operations=journals.map(saved=>({operation:custodyHash(JSON.stringify(saved.identity)),identity:saved.identity,state:saved.state,chainSha256:custodyHash(saved.ownerJson+saved.recordJson.join(''))})),objects=journals.flatMap(saved=>[saved.ownerJson,...saved.recordJson].map((bytes,index)=>({path:'migration/v1/'+template.originalIdentity.projectRef+'/'+custodyHash(JSON.stringify(saved.identity))+'/'+(index===0?'owner.json':String(index).padStart(6,'0')+'.record.json'),sha256:custodyHash(bytes)})));
 return{template,operations,objects,current:{identity:{...template.originalIdentity,sourceSha:'f'.repeat(40),treeSha:'e'.repeat(40),approvalDigest:'d'.repeat(64)},contextSha256:'c'.repeat(64)}};
}
test('inactive Cron custody accepts all eighteen preserved original journal objects without relabeling acknowledgements',()=>{
 const input=originalCustody();assert.equal(input.objects.length,18);assert.equal(input.operations.length,6);
 const result=requireOriginal231InactiveDefinitionCustody(input,input.template,input.current);assert.equal(result.originalAcknowledgement,'UNKNOWN');assert.equal(result.effectAuthority,false);assert.equal(input.operations.filter(row=>row.state==='REQUIRES_REVIEW').length,4);assert.equal(input.operations.filter(row=>row.state==='COMMITTED').length,2);
});
test('inactive Cron custody rejects missing or altered bytes in either preserved prefix journal',()=>{
 const input=originalCustody(),prefixes=originalPrefixCustodyJournalFixture().map(row=>row.operation);
 for(const operation of prefixes){const protectedObjects=input.objects.filter(row=>row.path.includes('/'+operation+'/'));assert.equal(protectedObjects.length,3);for(const object of protectedObjects){assert.throws(()=>requireOriginal231InactiveDefinitionCustody({...input,objects:input.objects.filter(row=>row!==object)},input.template,input.current));assert.throws(()=>requireOriginal231InactiveDefinitionCustody({...input,objects:input.objects.map(row=>row===object?{...row,sha256:'0'.repeat(64)}:row)},input.template,input.current));}
  for(const patch of[{state:'OWNER_ONLY'},{state:'INTENT'},{chainSha256:'0'.repeat(64)}])assert.throws(()=>requireOriginal231InactiveDefinitionCustody({...input,operations:input.operations.map(row=>row.operation===operation?{...row,...patch}:row)},input.template,input.current));
 }
});
test('inactive Cron custody rejects an unrelated original journal and retains the exact current-operation exception',()=>{
 const input=originalCustody(),currentOperation=custodyHash(JSON.stringify(input.current.identity)),extra={operation:'b'.repeat(64),identity:input.current.identity,state:'COMMITTED',chainSha256:'a'.repeat(64)};
 assert.throws(()=>requireOriginal231InactiveDefinitionCustody({...input,operations:[...input.operations,extra]},input.template,input.current));assert.throws(()=>requireOriginal231InactiveDefinitionCustody({...input,objects:[...input.objects,{path:'migration/v1/'+input.template.originalIdentity.projectRef+'/'+extra.operation+'/owner.json',sha256:'a'.repeat(64)}]},input.template,input.current));
 for(const state of['OWNER_ONLY','INTENT','INACTIVE_DEFINITIONS_ACKNOWLEDGED'])assert.equal(requireOriginal231InactiveDefinitionCustody({...input,operations:[...input.operations,{...extra,operation:currentOperation,state}]},input.template,input.current).effectAuthority,false);
 assert.throws(()=>requireOriginal231InactiveDefinitionCustody({...input,operations:[...input.operations,{...extra,operation:currentOperation}]},input.template,input.current));
});
let originalFixture:ReturnType<typeof original231RecoveryPlanFixture>|undefined;
function fixture(){
 const original=structuredClone(originalFixture??=(original231RecoveryPlanFixture({sha:'f'.repeat(40),tree:'e'.repeat(40)})));
 return{...original,sources:[...original.sources,{name:migration,bytes:readFileSync(resolve(import.meta.dirname,'../../supabase/migrations',migration))}]};
}
const api=()=>import('./hosted-original231-transport-append');

test('caller success objects cannot certify an exact native transport append',async()=>{
 const process=await import('./hosted-migration-native-process'),expected={databaseUrl:'postgresql://private-withheld.invalid',workdir:'private-withheld',deliverySha256:'a'.repeat(64),notBeforeMs:1,notAfterMs:30000};
 for(const value of[{},true,{kind:'EXITED',exitCode:0},Object.freeze({nativeVerified:true}),new Proxy({},{})])assert.throws(()=>process.readNativeInactiveCronAppendExecution(value,expected),/requires review/);
});

test('inactive definition source admission accepts only the exact SQL Boolean and empty runtime facts',async()=>{
 const subject=await import('./hosted-original231-transport-observation'),bytes=fixture().sources.at(-1)!.bytes,body=subject.readInactiveCronLegacyTransportBody(bytes);
 assert.match(body,/worker_transport_boundary_private\(false\)/);
 assert.equal(subject.readInactiveCronLegacyTransportSource({body,valid:true},bytes).effectAuthority,false);
 for(const value of[{body:body+' ',valid:true},{body,valid:false},{body,valid:true,private:true}])assert.throws(()=>subject.readInactiveCronLegacyTransportSource(value,bytes));
 assert.throws(()=>subject.readInactiveCronLegacyTransportSource({body,valid:true},Buffer.from('select true;')));
 const empty={runtimeNoLogin:true,runtimeKeysAbsent:true,processingAbsent:true,netQueueAbsent:true,authAbsent:true};
 assert.deepEqual(subject.readInactiveCronEmptyRuntime(empty),empty);
 for(const key of Object.keys(empty))assert.throws(()=>subject.readInactiveCronEmptyRuntime({...empty,[key]:false}));
});

test('inactive native census covers every source table and quotes names without returning row values',async()=>{
 const subject=await import('./hosted-original231-transport-observation'),catalogueOwner=await import('./hosted-schema-catalogue');
 const rows=[...['app','authorization','internal'].map(name=>({category:'schema',key:JSON.stringify([name]),facts:{name,owner:'postgres',acl:null}})),...['cuevo_api','cuevo_worker'].map(name=>({category:'role',key:JSON.stringify([name]),facts:{name,superuser:false,inherit:false,createRole:false,createDb:false,login:false,replication:false,bypassRls:false,connectionLimit:-1,validUntil:null,config:null}})),...Array.from({length:136},(_,index)=>{const name=index===0?'quoted"name':'table_'+index;return{category:'relation',key:JSON.stringify(['app',name]),facts:{schema:'app',name,owner:'postgres',acl:null,kind:'r',persistence:'p',accessMethod:'heap',tablespace:null,isPartition:false,populated:true,rls:true,forceRls:true,replicaIdentity:'d',options:null,partitionKey:null,partitionBound:null,definition:null,parents:[]}};})];
 const catalogue=catalogueOwner.requireCompleteHostedSchemaCatalogue(rows),sql=subject.inactiveCronEmptyAppCensusSql(catalogue);
 assert.equal((sql.match(/not exists\(select 1 from app\./g)??[]).length,136);assert.match(sql,/app\."quoted""name"/);assert.doesNotMatch(sql,/select \*/i);
 assert.throws(()=>subject.inactiveCronEmptyAppCensusSql(catalogueOwner.requireCompleteHostedSchemaCatalogue(rows.slice(0,-1))));
 assert.deepEqual(subject.readInactiveCronEmptyAppCensus({tableCount:136,empty:true}),{tableCount:136,empty:true});
 assert.throws(()=>subject.readInactiveCronEmptyAppCensus({tableCount:136,empty:false}));
});

test('purpose-specific native delivery retains all original SQL but exposes only the one unapplied transport suffix',async()=>{
 const workdirs=await import('./hosted-migration-workdirs'),files=await import('./hosted-migration-stage-files');
 assert.equal(typeof workdirs.createOriginal231TransportAppendWorkdir,'function');
 await canonicalFixture(async(root,input)=>{
  const plan=(await api()).prepareOriginal231TransportAppendPlan(input),binding={repoRoot:root,sourceSha:input.source.sha,treeSha:input.source.tree,plan};
  const delivery=await workdirs.createOriginal231TransportAppendWorkdir({...binding,outputRoot:join(root,'.local','hosted-release')});
  assert.equal(delivery.stage.included.length,232);assert.deepEqual(delivery.stage.pending.map(r=>r.name),[migration]);
  assert.equal(delivery.execution,'NOT_EXECUTED');assert.equal(delivery.effectAuthority,false);assert.equal(delivery.originalAcknowledgement,'UNKNOWN');
  const admitted=await files.admitOriginal231TransportAppendStageFiles({...binding,stage:delivery.stage});
  assert.equal(admitted.sources.length,232);assert.equal(admitted.planSha256,plan.planSha256);
  for(const source of input.sources)assert.equal(createHash('sha256').update(readFileSync(join(delivery.stage.workdir,'supabase/migrations',source.name))).digest('hex'),createHash('sha256').update(source.bytes).digest('hex'));
  writeFileSync(join(delivery.stage.workdir,'supabase/migrations',migration),'select 1;\n');
  await assert.rejects(files.admitOriginal231TransportAppendStageFiles({...binding,stage:delivery.stage}),/requires review/);
 });
});

test('changing the exported source identity cannot approve different transport SQL',async()=>{
 const owner=await api(),identity=(await import('./original231-transport-source')).original231TransportAppendMigration,input=fixture(),originalHash=identity.sha256;
 input.sources.at(-1)!.bytes=Buffer.from('begin; select 1; commit;\n');
 try{Reflect.set(identity,'sha256',createHash('sha256').update(input.sources.at(-1)!.bytes).digest('hex'));assert.throws(()=>owner.prepareOriginal231TransportAppendPlan(input),/requires review/);assert.equal(identity.sha256,originalHash);}
 finally{Reflect.set(identity,'sha256',originalHash);}
});
async function canonicalFixture(run:(root:string,input:ReturnType<typeof fixture>)=>Promise<void>){
 const root=mkdtempSync(join(tmpdir(),'cuevo-transport-source-'));
 const git=(...args:string[])=>execFileSync('git',args,{cwd:root,windowsHide:true,stdio:['ignore','pipe','ignore']}).toString().trim();
 try{
  git('clone','--shared','--no-checkout','--quiet',resolve(import.meta.dirname,'../..'),'.');git('checkout','--quiet','--detach','5b6e39956d7b9cbe507ec4352812f433225fa6f6');
  const input=fixture();writeFileSync(join(root,'supabase/migrations',migration),input.sources.at(-1)!.bytes);
  git('add','supabase/migrations');git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','--quiet','-m','Exact232 source operation fixture');
  input.source={sha:git('rev-parse','HEAD'),tree:git('rev-parse','HEAD^{tree}')};input.original231Recovery.catalogueReference.sourceSha=input.source.sha;input.original231Recovery.catalogueReference.treeSha=input.source.tree;
  await run(root,input);
 }finally{assert.ok(resolve(root).startsWith(resolve(tmpdir())+sep));rmSync(root,{recursive:true,force:true});}
}

test('canonical transport source operation retains actual232 bytes but cannot enter the old V1 source consumer',async()=>{
 const subject=await import('./hosted-migration-plan');
 assert.equal(typeof subject.prepareCanonicalOriginal231TransportAppendOperation,'function','a purpose-specific actual source owner is required');
 await canonicalFixture(async(root,input)=>{
  const owner=await api(),plan=owner.prepareOriginal231TransportAppendPlan(input),binding={repoRoot:root,sourceSha:input.source.sha,treeSha:input.source.tree,plan},operation=subject.prepareCanonicalOriginal231TransportAppendOperation(binding);
  try{
   const read=subject.readCanonicalOriginal231TransportAppendOperation(operation,binding);assert.equal(read.rows.length,232);assert.equal(read.sources.length,232);assert.equal(read.provenance.kind,'VERIFIED_GIT_BLOBS');
   assert.equal(plan.originalSQLPending,0);assert.equal(plan.effectAuthority,false);assert.equal(plan.originalAcknowledgement,'UNKNOWN');
   read.sources.at(-1)!.bytes[0]^=1;assert.ok(Buffer.from(subject.readCanonicalOriginal231TransportAppendOperation(operation,binding).sources.at(-1)!.bytes).equals(input.sources.at(-1)!.bytes));
   assert.throws(()=>subject.readCanonicalMigrationOperation(operation,binding as unknown as Parameters<typeof subject.readCanonicalMigrationOperation>[1]),/requires review/);
   assert.throws(()=>subject.readCanonicalOriginal231TransportAppendOperation({},binding),/requires review/);
  }finally{subject.disposeCanonicalMigrationOperation(operation);}
 });
});

test('canonical transport source operation permanently refuses actual SQL drift or a changed original binding',async()=>{
 const subject=await import('./hosted-migration-plan');assert.equal(typeof subject.prepareCanonicalOriginal231TransportAppendOperation,'function');
 await canonicalFixture(async(root,input)=>{
  const plan=(await api()).prepareOriginal231TransportAppendPlan(input),binding={repoRoot:root,sourceSha:input.source.sha,treeSha:input.source.tree,plan},operation=subject.prepareCanonicalOriginal231TransportAppendOperation(binding),path=join(root,'supabase/migrations',migration),bytes=readFileSync(path);
  try{writeFileSync(path,'select 1;\n');assert.throws(()=>subject.readCanonicalOriginal231TransportAppendOperation(operation,binding),/requires review/);writeFileSync(path,bytes);assert.throws(()=>subject.readCanonicalOriginal231TransportAppendOperation(operation,binding),/requires review/);}
  finally{writeFileSync(path,bytes);subject.disposeCanonicalMigrationOperation(operation);}
  const changed=structuredClone(binding);changed.plan.originalAcknowledgement='CONFIRMED' as typeof changed.plan.originalAcknowledgement;
  assert.throws(()=>subject.prepareCanonicalOriginal231TransportAppendOperation(changed),/requires review/);
 });
});

test('dedicated transport plan retains unfinished marker124 and delivers232 while only the exact new Cron SQL is pending',async()=>{
 const input=fixture();assert.throws(()=>planHostedMigrations(input),/requires review/,'ordinary original231 path must remain denied for pending SQL');
 const owner=await api(),plan=owner.prepareOriginal231TransportAppendPlan(input);
 assert.equal(plan.version,2);assert.equal(plan.purpose,'CUEVO_CURRENT_ORIGINAL231_TRANSPORT_APPEND_PLAN');
 assert.equal(plan.migrations.length,232);assert.equal(plan.applied.length,231);assert.equal(plan.pending.length,1);assert.equal(plan.pending[0].name,migration);
 assert.equal(plan.stage.included.length,232);assert.equal(plan.stage.pending.length,1);assert.equal(plan.originalSQLPending,0);
 assert.equal(plan.priorSchemaRelease.migrationCount,124);assert.equal(plan.originalAcknowledgement,'UNKNOWN');
 assert.equal(plan.effectAuthority,false);assert.equal(plan.execution,'NOT_EXECUTED');
 assert.equal(plan.target.storageObjects,input.target.storageObjects,'existing private operator journal objects are retained; their count is not application-file absence proof');
 assert.deepEqual(plan.original231Recovery,input.original231Recovery);
 assert.deepEqual(plan.stage.expectedBeforeVersions,[...input.target.migrationVersions].sort());
 assert.equal(plan.stage.expectedAfterVersions.length,232);
 assert.throws(()=>canonicalHostedMigrationPlan(plan as unknown as Parameters<typeof canonicalHostedMigrationPlan>[0]),error=>error instanceof Error,'old canonical/executor surface must not consume this new purpose');
 owner.readOriginal231TransportAppendPlan(plan);
});

test('transport plan admits only the reviewed migration bytes and no other suffix or changed original source',async()=>{
 const owner=await api();
 for(const mode of['missing','wrong-name','wrong-bytes','extra','changed-original']){
  const input=fixture();
  if(mode==='missing')input.sources.pop();
  if(mode==='wrong-name')input.sources.at(-1)!.name='20261015110815_unreviewed.sql';
  if(mode==='wrong-bytes')input.sources.at(-1)!.bytes=Buffer.from('select 1;\n');
  if(mode==='extra')input.sources.push({name:'20261015195955_hosted_demo49_account_runtime_admission.sql',bytes:Buffer.from('select 1;\n')});
  if(mode==='changed-original')input.sources[0].bytes=Buffer.from('select 2;\n');
  assert.throws(()=>owner.prepareOriginal231TransportAppendPlan(input),/requires review/,mode);
 }
});

test('transport plan refuses a populated foreign stale or incomplete target',async()=>{
 const owner=await api();
 for(const mode of['auth','schemas','history230','foreign','populated','stale','future','completed-marker']){
  const input=fixture();
  if(mode==='auth')input.target.authUsers=1;
  if(mode==='schemas')input.target.appSchemas.pop();
  if(mode==='history230')input.target.migrationVersions.pop();
  if(mode==='foreign')input.target.projectRef='a'.repeat(20);
  if(mode==='populated')Object.assign(input.target,{population:'GUARDED_SYNTHETIC'});
  if(mode==='stale')input.now+=86400001;
  if(mode==='future')input.now-=1;
  if(mode==='completed-marker')Object.assign(input.priorReceipt,{completedSourceMigrationCount:124});
  assert.throws(()=>owner.prepareOriginal231TransportAppendPlan(input),/requires review/,mode);
 }
});

test('transport plan keeps missing original acknowledgement and original chain validation mandatory',async()=>{
 const owner=await api();
 for(const mode of['ack','chain','marker','reference']){
  const input=fixture();
  if(mode==='ack')Object.assign(input.original231Recovery.template.originalThirdConfirmation,{status:'CONFIRMED',receiptSha256:'a'.repeat(64)});
  if(mode==='chain')input.original231Recovery.template.batchReceiptJson[0]+=' ';
  if(mode==='marker')input.original231Recovery.installedMarker.migrationCount=231;
  if(mode==='reference')input.original231Recovery.catalogueReference.sourceSha='a'.repeat(40);
  assert.throws(()=>owner.prepareOriginal231TransportAppendPlan(input),/requires review/,mode);
 }
});

test('transport plan reader refuses altered pending delivery acknowledgement or effect flags',async()=>{
 const owner=await api(),plan=owner.prepareOriginal231TransportAppendPlan(fixture());
 for(const mode of['pending-original','omit-historical-delivery','ack','effect','hash','source']){
  const changed=structuredClone(plan);
  if(mode==='pending-original')changed.pending.unshift(changed.migrations[0]);
  if(mode==='omit-historical-delivery')changed.stage.included.shift();
  if(mode==='ack')Object.assign(changed,{originalAcknowledgement:'CONFIRMED'});
  if(mode==='effect')Object.assign(changed,{effectAuthority:true});
  if(mode==='hash')changed.planSha256='a'.repeat(64);
  if(mode==='source')changed.source.sha='a'.repeat(40);
  assert.throws(()=>owner.readOriginal231TransportAppendPlan(changed),/requires review/,mode);
 }
});

test('transport planning snapshots data and rejects caller authority/accessors without executing them',async()=>{
 const owner=await api(),input=fixture();let read=0;
 Object.defineProperty(input.sources.at(-1)!,'name',{enumerable:true,get(){read++;throw Error('private getter');}});
 assert.throws(()=>owner.prepareOriginal231TransportAppendPlan(input),/requires review/);assert.equal(read,0);
 assert.throws(()=>owner.prepareOriginal231TransportAppendPlan({...fixture(),executionAdmitted:true}),/requires review/);
});

test('transport planning refuses oversized SQL before byte enumeration or copying',async context=>{
 const owner=await api(),ownDescriptors=Object.getOwnPropertyDescriptors,ownKeys=Reflect.ownKeys;
 for(const mode of['blob','total']){
  const large=Buffer.alloc(mode==='blob'?2*1024*1024+1:2*1024*1024);
  const sources=Array.from({length:232},(_,index)=>({name:String(20261001000000+index)+'_fixture.sql',bytes:index<(mode==='blob'?1:9)?large:Buffer.alloc(0)}));
  const input={sources,source:{},target:{},priorReceipt:null,original231Recovery:null,now:0};let inspected=0;
  // These traps bound the test's allocation. The real planner must reject the
  // actual sizes before either costly inspection boundary is reached.
  context.mock.method(Object,'getOwnPropertyDescriptors',(value:object)=>{if(value===large){inspected++;throw Error('oversized byte inspection');}return ownDescriptors(value);});
  context.mock.method(Reflect,'ownKeys',(value:object)=>{if(value===large){inspected++;throw Error('oversized byte inspection');}return ownKeys(value);});
  try{assert.throws(()=>owner.prepareOriginal231TransportAppendPlan(input),/requires review/);assert.equal(inspected,0,mode+' limit must precede byte inspection');}
  finally{context.mock.restoreAll();}
 }
});
