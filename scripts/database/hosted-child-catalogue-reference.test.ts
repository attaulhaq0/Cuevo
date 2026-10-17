import assert from 'node:assert/strict';
import { test } from 'node:test';
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {transformSync} from 'esbuild';
import { hostedChildCatalogueCategories, hostedChildCatalogueSummarySchema, applySourceChildCatalogueProviderDeltas, parseHostedChildCatalogueReceipt, verifySourceChildCatalogueImage,sourceChildCatalogueImage } from './hosted-child-catalogue-reference';
import policy from './unknown-prefix-catalogue-policy.json';
import * as reference from './hosted-child-catalogue-reference';

type ImageAdmission={imageId:string;reference:string};
const imageApi=()=>{const api=reference as unknown as {
 admitSourceChildCatalogueImageInspection?:(value:unknown,selectedReference:string)=>ImageAdmission;
 isSourceChildCatalogueImageAbsent?:(error:unknown,selectedReference:string)=>boolean;
 verifySourceChildCatalogueContainerInspection?:(value:unknown,containerId:string,image:ImageAdmission)=>void;
 prepareSourceChildCatalogueImageCache?:(command:(args:string[])=>string,observeFailure?:(step:string,kind:string,error:unknown)=>void)=>ImageAdmission;
};assert.equal(typeof api.admitSourceChildCatalogueImageInspection,'function');assert.equal(typeof api.isSourceChildCatalogueImageAbsent,'function');assert.equal(typeof api.verifySourceChildCatalogueContainerInspection,'function');return api;};
const mirrorImage='ghcr.io/supabase/postgres@sha256:0450166354dc9c1d25f0322ac8b580774d4fb0184d2b087f6e4fe9499c66cf53';
const ecrImage='public.ecr.aws/supabase/postgres@sha256:0450166354dc9c1d25f0322ac8b580774d4fb0184d2b087f6e4fe9499c66cf53';
const postgresConfigId='sha256:e671c63f6ad3a3bc0503d26bb6641bb2b8eddaabbfe1782ba56b7d2c0243b6d8';
const imageInspect=(selected=mirrorImage)=>({Id:postgresConfigId,RepoDigests:[selected],Os:'linux',Architecture:'amd64'});
const absentImageError=(selected=mirrorImage)=>Object.assign(Error('private-image-canary'),{status:1,signal:null,stdout:Buffer.alloc(0),stderr:Buffer.from('Error response from daemon: No such image: '+selected+'\n')});

test('native image preparation reuses either exactly admitted cache without a registry pull',()=>{
 const prepare=imageApi().prepareSourceChildCatalogueImageCache;assert.equal(typeof prepare,'function');
 for(const selected of[mirrorImage,ecrImage]){
  const calls:string[][]=[];
  const actual=prepare!(args=>{calls.push(args);if(args[2]!==selected)throw absentImageError(args[2]);return JSON.stringify([imageInspect(selected)]);});
  assert.deepEqual(actual,{imageId:postgresConfigId,reference:selected});
  assert.deepEqual(calls,selected===mirrorImage?[['image','inspect',mirrorImage]]:[['image','inspect',mirrorImage],['image','inspect',ecrImage]]);
 }
});

test('native image preparation permits one fixed AMD64 acquisition only after both exact cache absences',()=>{
 const prepare=imageApi().prepareSourceChildCatalogueImageCache;assert.equal(typeof prepare,'function');let pulled=false;const calls:string[][]=[];
 const actual=prepare!(args=>{calls.push(args);if(args[0]==='pull'){pulled=true;return '';}if(!pulled)throw absentImageError(args[2]);return JSON.stringify([imageInspect()]);});
 assert.deepEqual(actual,{imageId:postgresConfigId,reference:mirrorImage});
 assert.deepEqual(calls,[['image','inspect',mirrorImage],['image','inspect',ecrImage],['pull','--platform','linux/amd64',mirrorImage],['image','inspect',mirrorImage]]);
});

test('native image preparation refuses uncertainty and invalid content before any acquisition',()=>{
 const prepare=imageApi().prepareSourceChildCatalogueImageCache;assert.equal(typeof prepare,'function');
 for(const value of[Object.assign(absentImageError(),{code:'ETIMEDOUT'}),Object.assign(absentImageError(),{signal:'SIGTERM'}),Object.assign(absentImageError(),{stderr:Buffer.from('Cannot connect to Docker daemon')}),'not JSON',JSON.stringify([{...imageInspect(),Architecture:'arm64'}])]){
  const calls:string[][]=[];
  assert.throws(()=>prepare!(args=>{calls.push(args);if(typeof value==='string')return value;throw value;}),/requires review/);
  assert.deepEqual(calls,[['image','inspect',mirrorImage]]);
 }
});

test('native image preparation latches the original failing pull and never retries or admits partial content',()=>{
 const prepare=imageApi().prepareSourceChildCatalogueImageCache;assert.equal(typeof prepare,'function');
 for(const mode of['pull-failed','post-pull-invalid']){
  let pulled=false;const calls:string[][]=[],observed:{step:string;kind:string;error:unknown}[]=[],original=Object.assign(Error('private-canary'),{code:'ETIMEDOUT'});
  assert.throws(()=>prepare!(args=>{calls.push(args);if(args[0]==='pull'){pulled=true;if(mode==='pull-failed')throw original;return '';}if(!pulled)throw absentImageError(args[2]);return 'invalid JSON';},(step,kind,error)=>observed.push({step,kind,error})),/requires review/);
  assert.equal(calls.filter(args=>args[0]==='pull').length,1);assert.equal(observed.length,1);
  assert.equal(observed[0].step,mode==='pull-failed'?'IMAGE_PULL':'IMAGE_POST_PULL_ADMISSION');
  assert.equal(observed[0].kind,mode==='pull-failed'?'COMMAND_FAILED':'ADMISSION_REFUSED');
  if(mode==='pull-failed')assert.equal(observed[0].error,original);
 }
});

test('native image preparation emits a fixed refusal even when a diagnostic observer fails',()=>{
 const prepare=imageApi().prepareSourceChildCatalogueImageCache;assert.equal(typeof prepare,'function');const calls:string[][]=[];
 assert.throws(()=>prepare!(args=>{calls.push(args);throw Object.assign(absentImageError(),{code:'ETIMEDOUT'});},()=>{throw Error('private-observer-canary');}),error=>error instanceof Error&&error.message==='Native PostgreSQL image admission requires review; contents withheld.');
 assert.deepEqual(calls,[['image','inspect',mirrorImage]]);
});

test('CI image setup refuses imported calls and another runner root before image commands',async()=>{
 let commands=0;
 const hook=registerHooks({load(url,context,next){
  if(url.endsWith('/prepare-ci-native-postgres-image.ts')){
   const source=readFileSync(new URL(url),'utf8')
    .replace("import {execFileSync} from 'node:child_process';",'const execFileSync=globalThis.controlledCiImageCommand;')
    .replace("import {captureCanonicalSourceContext} from '../verification/canonical-source-jobs';",'const captureCanonicalSourceContext=()=>({treeSha:"b".repeat(40),finalMetadata(){}});')
    .replace("const root=resolve('.');","const root=resolve('/home/runner/work/Cuevo/Cuevo');")
    .replaceAll('process.platform',"'linux'").replaceAll('process.arch',"'x64'");
   return{format:'module',shortCircuit:true,source:transformSync(source,{loader:'ts',format:'esm'}).code};
  }
  return next(url,context);
 }});
 Object.assign(globalThis,{controlledCiImageCommand:()=>{commands++;return Buffer.from(JSON.stringify([imageInspect()]));}});
 const savedArgv=[...process.argv],savedEnv={...process.env};
 try{
  for(const key of['SUPABASE_ACCESS_TOKEN','SUPABASE_SERVICE_ROLE_KEY','DATABASE_URL','WORKER_DATABASE_URL','VERCEL_TOKEN','VERCEL_API_KEY','SUPABASE_DB_PASSWORD','GH_TOKEN','GITHUB_TOKEN'])delete process.env[key];
  Object.assign(process.env,{CI:'true',GITHUB_ACTIONS:'true',RUNNER_ENVIRONMENT:'github-hosted',GITHUB_JOB:'source-fixtures-native',GITHUB_REPOSITORY:'attaulhaq0/Cuevo',GITHUB_SHA:'a'.repeat(40),GITHUB_WORKSPACE:'/home/runner/work/Cuevo/Cuevo'});
  const path=resolve(import.meta.dirname,'prepare-ci-native-postgres-image.ts'),api=await import(pathToFileURL(path).href) as {prepareCiNativePostgresImage:()=>Promise<unknown>};
  process.argv=[savedArgv[0],resolve(import.meta.dirname,'hosted-child-catalogue-reference.test.ts')];
  await assert.rejects(api.prepareCiNativePostgresImage(),/requires review/);assert.equal(commands,0,'An import is not an image setup invocation.');
  process.argv=[savedArgv[0],path];
  process.env.GITHUB_WORKSPACE='/home/runner/work/Cuevo/Cuevo/foreign-root';
  await assert.rejects(api.prepareCiNativePostgresImage(),/requires review/);assert.equal(commands,0,'The selected source must be in the actual runner root.');
 }finally{
  process.argv=savedArgv;for(const key of Object.keys(process.env))if(!(key in savedEnv))delete process.env[key];Object.assign(process.env,savedEnv);hook.deregister();delete(globalThis as {controlledCiImageCommand?:unknown}).controlledCiImageCommand;
 }
});

test('local image inspection preserves the exact approved immutable identity for both fixed repositories',()=>{
 const api=imageApi();for(const selected of[mirrorImage,ecrImage])assert.deepEqual(api.admitSourceChildCatalogueImageInspection!(JSON.stringify([imageInspect(selected)]),selected),{imageId:postgresConfigId,reference:selected});
 const indexId='sha256:0450166354dc9c1d25f0322ac8b580774d4fb0184d2b087f6e4fe9499c66cf53';
 assert.deepEqual(api.admitSourceChildCatalogueImageInspection!(JSON.stringify([{...imageInspect(),Id:indexId}]),mirrorImage),{imageId:indexId,reference:mirrorImage});
});
test('unreadable ambiguous or unapproved local image content cannot become an admitted cache',()=>{
 const api=imageApi(),valid=imageInspect();
 for(const value of[null,{},'', 'not JSON',JSON.stringify([]),JSON.stringify([valid,valid]),' '.repeat(1024*1024+1),...[
  {Id:'sha256:4bfbe2e6d7909bd386b1b774683899deb12efa04a3eebaa141f164ffd04ada1d'},{Id:'sha256:'+'0'.repeat(64)},{RepoDigests:[ecrImage]},{RepoDigests:[mirrorImage,mirrorImage]},{RepoDigests:['ghcr.io/foreign/postgres@'+mirrorImage.split('@')[1]]},{Os:'windows'},{Architecture:'arm64'}
 ].map(patch=>JSON.stringify([{...valid,...patch}]))])assert.throws(()=>api.admitSourceChildCatalogueImageInspection!(value,mirrorImage),/requires review/);
 assert.throws(()=>api.admitSourceChildCatalogueImageInspection!(JSON.stringify([valid]),'foreign/image'),/requires review/);
});
test('only the exact own native absent-image outcome permits cold acquisition',()=>{
 const api=imageApi();assert.equal(api.isSourceChildCatalogueImageAbsent!(absentImageError(),mirrorImage),true);assert.equal(api.isSourceChildCatalogueImageAbsent!(absentImageError(ecrImage),ecrImage),true);
 for(const patch of[{status:0},{status:2},{signal:'SIGTERM'},{code:'ETIMEDOUT'},{stdout:Buffer.from('unexpected output')},{stderr:Buffer.from('Cannot connect to the Docker daemon')},{stderr:Buffer.from('Error response from daemon: No such image: '+ecrImage+'\n')},{stderr:Buffer.from('Error response from daemon: No such image: '+mirrorImage+'\npermission denied')},{stderr:'Error response from daemon: No such image: '+mirrorImage},{stderr:Buffer.alloc(4097)}])assert.equal(api.isSourceChildCatalogueImageAbsent!({...absentImageError(),...patch},mirrorImage),false);
 assert.equal(api.isSourceChildCatalogueImageAbsent!(absentImageError(),'foreign/image'),false);
});
test('Docker 28 default missing-image empty-array stdout retains exact native absence without accepting other data',()=>{
 // docker/cli v28.0.4 TestIndentedInspectorEmpty emits this even when lookup fails.
 const api=imageApi();for(const stdout of[Buffer.from('[]\n'),Buffer.from('[]\r\n'),Buffer.from('[]')])assert.equal(api.isSourceChildCatalogueImageAbsent!({...absentImageError(),stdout},mirrorImage),true);
 for(const stdout of[Buffer.from('{}'),Buffer.from('[null]'),Buffer.from('[ ]'),Buffer.from('[]\n\n'),Buffer.from('\n')])assert.equal(api.isSourceChildCatalogueImageAbsent!({...absentImageError(),stdout},mirrorImage),false);
 for(const patch of[{status:0},{status:2},{signal:'SIGTERM'},{code:'ETIMEDOUT'},{stderr:Buffer.from('permission denied')},{stderr:Buffer.from('Error response from daemon: No such image: '+ecrImage+'\n')}])assert.equal(api.isSourceChildCatalogueImageAbsent!({...absentImageError(),stdout:Buffer.from('[]\n'),...patch},mirrorImage),false);
});
test('absence classification does not read error getters proxy traps or overridden buffer properties',()=>{
 const api=imageApi();let reads=0;const getter=absentImageError();Object.defineProperty(getter,'stderr',{get(){reads++;throw Error('private getter');}});
 assert.equal(api.isSourceChildCatalogueImageAbsent!(getter,mirrorImage),false);
 const inherited=Object.create(absentImageError()) as unknown;assert.equal(api.isSourceChildCatalogueImageAbsent!(inherited,mirrorImage),false);
 const proxy=new Proxy(absentImageError(),{getOwnPropertyDescriptor(){reads++;throw Error('private proxy');}});assert.equal(api.isSourceChildCatalogueImageAbsent!(proxy,mirrorImage),false);
 const buffer=absentImageError();Object.defineProperty(buffer.stderr,'length',{get(){reads++;throw Error('private buffer');}});Object.defineProperty(buffer.stderr,'toString',{get(){reads++;throw Error('private method');}});
 assert.equal(api.isSourceChildCatalogueImageAbsent!(buffer,mirrorImage),true);assert.equal(reads,0);
});
test('created disposable container must retain its exact image platform and stopped identity before start',()=>{
 const api=imageApi(),id='7'.repeat(64),image={imageId:postgresConfigId,reference:mirrorImage},valid={Id:id,Image:postgresConfigId,Platform:'linux',Config:{Image:postgresConfigId},State:{Status:'created',Running:false}};
 api.verifySourceChildCatalogueContainerInspection!(JSON.stringify([valid]),id,image);
 for(const value of['',JSON.stringify([]),JSON.stringify([valid,valid]),...[
  {Id:'8'.repeat(64)},{Image:'sha256:'+'0'.repeat(64)},{Platform:'windows'},{Config:{Image:mirrorImage}},{State:{Status:'running',Running:true}},{State:{Status:'created',Running:true}}
 ].map(patch=>JSON.stringify([{...valid,...patch}]))])assert.throws(()=>api.verifySourceChildCatalogueContainerInspection!(value,id,image),/requires review/);
 assert.throws(()=>api.verifySourceChildCatalogueContainerInspection!(JSON.stringify([valid]),id,{imageId:'sha256:'+'0'.repeat(64),reference:mirrorImage}),/requires review/);
});

const fixtureSummary=(entry:{catalogueSha256:string;categories:unknown;bytes:number;rows:number})=>({version:'CUEVO_SCHEMA_CATALOGUE_V1',serverVersion:170011,sha256:entry.catalogueSha256,categories:entry.categories,bytes:entry.bytes,rows:entry.rows});
function native180ReceiptFixture(){const scratch123=fixtureSummary(policy.completedPrefix.scratch),provider123=fixtureSummary(policy.completedPrefix.expected),other={version:'CUEVO_SCHEMA_CATALOGUE_V1',serverVersion:170011,sha256:'2'.repeat(64),categories:hostedChildCatalogueCategories.map(category=>({category,count:1,sha256:'3'.repeat(64)})),bytes:160,rows:16};return{version:3,purpose:'CUEVO_SOURCE_NATIVE180_CATALOGUE',repository:'attaulhaq0/Cuevo',sourceSha:'a'.repeat(40),treeSha:'b'.repeat(40),baselineSourceSha:'9bee5e0d59d95274266158a0644139fd4df5334e',baselineTreeSha:'2574891343d9bfd1be09c57dd4e450e086f76f40',runId:'31',runAttempt:2,producerJob:'database-checks',producerStep:'Build exact source child144 catalogue reference',migrationCount:180,migrationRowsSha256:'28ad9500aa5719898303ffce30e6dc8d598d22b650413d4a9639c5bd1313cbb4',sourceInventorySha256:'c'.repeat(64),querySha256:policy.querySha256,policySha256:'5b05d74fc6574c43548d9d8bab852524b9be4fb5564f5f88db74bf946ee2148d',producerSha256:'d'.repeat(64),bootstrapSha256:'e'.repeat(64),serviceSchemaSha256:{auth:'1'.repeat(64),storage:'2'.repeat(64),realtime:'3'.repeat(64)},image:sourceChildCatalogueImage.tag,imageId:sourceChildCatalogueImage.indexDigest,imageReference:sourceChildCatalogueImage.mirrorPinnedReference,imageManifestSha256:sourceChildCatalogueImage.manifestDigest,imageConfigSha256:sourceChildCatalogueImage.configDigest,imagePlatform:sourceChildCatalogueImage.platform,sourceLockSha256:'4'.repeat(64),nodeVersion:'v24.16.0',nodeBinarySha256:'5'.repeat(64),scratch123,provider123,scratch144:other,provider144:other,scratch180:other,catalogueSummary:other,child144ReceiptSha256:'6'.repeat(64),startedAt:'2026-10-11T09:00:00.000Z',capturedAt:'2026-10-11T09:01:00.000Z',cleanupCompletedAt:'2026-10-11T09:02:00.000Z',cleanupConfirmed:true,sourceFrozen:true,hostedAcceptance:false,effectAuthority:false};}

test('finite native180 source receipt cannot be replaced by relabeled144, changed source history, partial categories or unconfirmed cleanup',()=>{
 const api=reference as unknown as {parseHostedNative180CatalogueReceipt?:(value:unknown)=>unknown;sourceNative180CatalogueReceiptSha256?:(value:unknown)=>string};
 assert.equal(typeof api.parseHostedNative180CatalogueReceipt,'function','native180 requires its own current source receipt parser');
 const valid=native180ReceiptFixture();
 assert.equal((api.parseHostedNative180CatalogueReceipt!(valid) as {migrationCount:number}).migrationCount,180);
 assert.match(api.sourceNative180CatalogueReceiptSha256!(valid),/^[a-f0-9]{64}$/);
 const patches=[{migrationCount:144},{baselineSourceSha:'1a493ad735798bb6d3fa0ffaabc779e62149ac37'},{baselineTreeSha:'0'.repeat(40)},{migrationRowsSha256:'0'.repeat(64)},{version:2},{imageReference:sourceChildCatalogueImage.pinnedReference},{child144ReceiptSha256:undefined},{cleanupConfirmed:false},{cleanupCompletedAt:'2026-10-11T08:59:00Z'},{sourceSha:valid.baselineSourceSha},{hostedAcceptance:true},{effectAuthority:true},{querySha256:'0'.repeat(64)},{policySha256:'0'.repeat(64)},{catalogueSummary:{...valid.catalogueSummary,categories:valid.catalogueSummary.categories.slice(1)}},{scratch123:{...valid.scratch123,sha256:'0'.repeat(64)}},{provider123:{...valid.provider123,sha256:'0'.repeat(64)}},{privateRows:[]}];
 for(const patch of patches)assert.throws(()=>api.parseHostedNative180CatalogueReceipt!({...valid,...patch}),/requires review/);
 assert.throws(()=>parseHostedChildCatalogueReceipt(valid),/requires review/);
});

test('finite original231 source receipt links the actual180 source receipt and preserves complete categories and cleanup',()=>{
 const api=reference as unknown as {parseHostedOriginal231CatalogueReceipt?:(value:unknown)=>unknown;sourceOriginal231CatalogueReceiptSha256?:(value:unknown)=>string};assert.equal(typeof api.parseHostedOriginal231CatalogueReceipt,'function');const original=native180ReceiptFixture(),valid={...original,version:4,purpose:'CUEVO_SOURCE_ORIGINAL231_CATALOGUE',baselineSourceSha:'239bb18f5646bbfcc0aa5a5bee56edb81e9dfb37',baselineTreeSha:'a58fa0bef6f6c0ea9cc57d12156b6c3464ac5559',migrationCount:231,migrationRowsSha256:'46b7ac8b3a4f1bdcb1f2f0a83a5df7f1594c8ea37d841c8b1be495653df0f6ab',provider180:original.catalogueSummary,scratch231:original.scratch180,sourceNative180ReceiptSha256:reference.sourceNative180CatalogueReceiptSha256(original)};assert.equal((api.parseHostedOriginal231CatalogueReceipt!(valid)as{migrationCount:number}).migrationCount,231);assert.match(api.sourceOriginal231CatalogueReceiptSha256!(valid),/^[a-f0-9]{64}$/);const patches=[{migrationCount:180},{version:3},{baselineSourceSha:original.baselineSourceSha},{baselineTreeSha:'f'.repeat(40)},{migrationRowsSha256:'f'.repeat(64)},{sourceNative180ReceiptSha256:undefined},{provider180:undefined},{scratch231:undefined},{cleanupConfirmed:false},{sourceSha:valid.baselineSourceSha},{querySha256:'f'.repeat(64)},{policySha256:'f'.repeat(64)},{imageReference:sourceChildCatalogueImage.pinnedReference},{catalogueSummary:{...valid.catalogueSummary,categories:valid.catalogueSummary.categories.slice(1)}},{effectAuthority:true},{privateOriginalReceipt:{}},{providerPostureVerified:true}];for(const patch of patches)assert.throws(()=>api.parseHostedOriginal231CatalogueReceipt!({...valid,...patch}),/requires review/);assert.throws(()=>reference.parseHostedNative180CatalogueReceipt(valid),/requires review/);
});

test('native180 baseline retains complete current rows and requires every exact reviewed provider delta',()=>{
 const api=reference as unknown as {deriveSourceNative180CatalogueBaseline?:(value:unknown)=>{scratch180:{rows:number};provider180:{rows:number}}};
 assert.equal(typeof api.deriveSourceNative180CatalogueBaseline,'function','native180 baseline must use the complete fixed catalogue projection');
 const role=(name:string)=>({category:'role',key:JSON.stringify([name]),facts:{name,superuser:false,inherit:false,createRole:false,createDb:false,login:true,replication:false,bypassRls:false,connectionLimit:-1,validUntil:null,config:null}});
 const rows=[...['app','authorization','internal'].map(name=>({category:'schema',key:JSON.stringify([name]),facts:{name,owner:'postgres',acl:null}})),role('cuevo_api'),role('cuevo_worker'),...policy.exactProviderDeltas.filter(delta=>delta.expected!==null).map(delta=>delta.expected)];
 const result=api.deriveSourceNative180CatalogueBaseline!(rows);assert.equal(result.scratch180.rows,13);assert.equal(result.provider180.rows,12);
 for(const candidate of[rows.slice(1),rows.slice(0,-1),[...rows,rows.at(-1)],rows.map(row=>row?.category==='role'&&row.facts.name==='supabase_admin'?{...row,facts:{...row.facts,superuser:false}}:row)])assert.throws(()=>api.deriveSourceNative180CatalogueBaseline!(candidate),/requires review/);
});

test('child catalogue summary requires every exact category once in canonical order and remains small', () => {
 const value={version:'CUEVO_SCHEMA_CATALOGUE_V1',serverVersion:170011,sha256:'a'.repeat(64),rows:16,bytes:160,categories:hostedChildCatalogueCategories.map(category=>({category,count:1,sha256:'a'.repeat(64)}))};
 assert.equal(hostedChildCatalogueSummarySchema.parse(value).categories.length,16);
 for(const mutation of [()=>({...value,categories:value.categories.slice(1)}),()=>({...value,categories:[...value.categories].reverse()}),()=>({...value,categories:[...value.categories.slice(1),value.categories[1]]}),()=>({...value,rows:17}),()=>({...value,serverVersion:170012}),()=>({...value,privateRows:[]})])assert.equal(hostedChildCatalogueSummarySchema.safeParse(mutation()).success,false);
 assert.ok(Buffer.byteLength(JSON.stringify(value))<49152);
});

test('source child delta transform refuses missing, changed, duplicate or already transformed authority rows', () => {
 const rows=policy.exactProviderDeltas.filter(delta=>delta.expected!==null).map(delta=>delta.expected);
 for(const mutated of [rows,rows.slice(1),[...rows,rows[0]],policy.exactProviderDeltas.filter(delta=>delta.observed!==null).map(delta=>delta.observed)])assert.throws(()=>applySourceChildCatalogueProviderDeltas(mutated),/requires review/);
});

test('exact provider transform applies each reviewed replacement and preserves unrelated runtime authority',()=>{
 const role=(name:string)=>({category:'role',key:JSON.stringify([name]),facts:{name,superuser:false,inherit:false,createRole:false,createDb:false,login:true,replication:false,bypassRls:false,connectionLimit:-1,validUntil:null,config:null}});
 const schemas=['app','authorization','internal'].map(name=>({category:'schema',key:JSON.stringify([name]),facts:{name,owner:'postgres',acl:null}}));
 const input=[...schemas,role('cuevo_api'),role('cuevo_worker'),...policy.exactProviderDeltas.filter(delta=>delta.expected!==null).map(delta=>delta.expected)];
 const observed=applySourceChildCatalogueProviderDeltas(input);
 assert.deepEqual(observed.rows.filter(row=>row.category==='schema'),schemas);
 assert.ok(observed.rows.some(row=>row.category==='role'&&row.facts.name==='cuevo_api'));
 for(const delta of policy.exactProviderDeltas)assert.deepEqual(observed.rows.find(row=>row.category+':'+row.key===delta.id)??null,delta.observed);
 for(const mode of ['missing','changed','duplicate','insert-present']){const rows=structuredClone(input);if(mode==='missing')rows.pop();if(mode==='changed')(rows.at(-1)!.facts as Record<string,unknown>).config=['search_path=public'];if(mode==='duplicate')rows.push(rows.at(-1)!);if(mode==='insert-present')rows.push(policy.exactProviderDeltas.at(-1)!.observed as typeof rows[number]);assert.throws(()=>applySourceChildCatalogueProviderDeltas(rows),/requires review/,mode);}
});

test('catalogue receipt refuses user baselines, raw catalogue rows and missing source or cleanup identities',()=>{
 for(const value of [{},{version:1,purpose:'CUEVO_SOURCE_CHILD144_CATALOGUE',catalogue:{rows:[]}},{hostedAcceptance:true},{cleanupConfirmed:false}])assert.throws(()=>parseHostedChildCatalogueReceipt(value),/requires review/);
});

test('catalogue image proof accepts only the pinned repository index and exact amd64 image identities on both Docker stores',()=>{
 const input={Id:sourceChildCatalogueImage.configDigest,RepoDigests:[sourceChildCatalogueImage.pinnedReference],Os:'linux',Architecture:'amd64'};
 assert.deepEqual(verifySourceChildCatalogueImage(input),sourceChildCatalogueImage);
 assert.deepEqual(verifySourceChildCatalogueImage({...input,Id:sourceChildCatalogueImage.indexDigest}),sourceChildCatalogueImage);
 for(const patch of [{Id:'sha256:'+'0'.repeat(64)},{RepoDigests:['other.example/postgres@'+sourceChildCatalogueImage.indexDigest]},{RepoDigests:['public.ecr.aws/supabase/postgres@sha256:'+'0'.repeat(64)]},{Os:'windows'},{Architecture:'arm64'},{Id:sourceChildCatalogueImage.manifestDigest}])assert.throws(()=>verifySourceChildCatalogueImage({...input,...patch}),/requires review/);
});
test('the fixed GHCR transport requires its selected reviewed digest while legacy ECR proof stays separate',()=>{
 const mirror='ghcr.io/supabase/postgres@sha256:0450166354dc9c1d25f0322ac8b580774d4fb0184d2b087f6e4fe9499c66cf53';
 const input={Id:sourceChildCatalogueImage.configDigest,RepoDigests:[mirror],Os:'linux',Architecture:'amd64'};
 assert.deepEqual(verifySourceChildCatalogueImage(input,mirror),sourceChildCatalogueImage);
 assert.throws(()=>verifySourceChildCatalogueImage(input),/requires review/);
 assert.throws(()=>verifySourceChildCatalogueImage({...input,RepoDigests:[sourceChildCatalogueImage.pinnedReference]},mirror),/requires review/);
 for(const patch of[{Id:sourceChildCatalogueImage.manifestDigest},{RepoDigests:[mirror,mirror]},{RepoDigests:['ghcr.io/foreign/postgres@'+sourceChildCatalogueImage.indexDigest]},{RepoDigests:['ghcr.io/supabase/postgres@sha256:'+'0'.repeat(64)]},{Os:'windows'},{Architecture:'arm64'}])assert.throws(()=>verifySourceChildCatalogueImage({...input,...patch},mirror),/requires review/);
});
