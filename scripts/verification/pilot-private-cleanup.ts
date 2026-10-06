/** Operator ownership model only. No environment, filesystem, database or Storage client. */
export type PilotPrivateContext={version:1;runId:string;window:'performance'|'volume';sourceSha:string;sourceManifestSha256:string;schemaSha256:string;migrationSha256:string;populationSha256:string;schoolId:string;allowedActorIds:string[];apiUrl:string;databaseTarget:string;stopped:boolean};
export type PilotPrivateAsset={id:string;schoolId:string;ownerId:string;createdBy:string;name:string;contentType:'text/plain'|'image/png'|'image/jpeg'|'application/pdf';byteSize:number;sha256:string;state:'STAGED'|'AVAILABLE'|'RETIRED';objectPath:string;purpose:'PERSONAL'|'COURSE_RESOURCE'|'SUBMISSION_WORK';courseId:string|null;assessmentId:string|null;createdAt:string;availableAt:string|null;retiredAt:string|null};
/** Provider owner is a provider fact, never the asset's learner ownership.
 * byteProof must come from an exact object download, not copied registry metadata. */
export type PilotStorageObject={id:string;bucketId:'learner-private';name:string;providerOwnerId:string|null;createdAt:string;updatedAt:string;providerMetadata:Record<string,unknown>&{size:number;mimetype:PilotPrivateAsset['contentType']};byteProof:{objectId:string;name:string;byteSize:number;sha256:string}};
export type PilotPrivateSnapshot={context:PilotPrivateContext;assets:PilotPrivateAsset[];objects:PilotStorageObject[]};
export type PilotPrivateBaseline={version:1;mode:'FRESH_EMPTY';snapshot:PilotPrivateSnapshot};
export type PilotPrivateDelta={version:1;context:PilotPrivateContext;assets:PilotPrivateAsset[];targets:{asset:PilotPrivateAsset;object:PilotStorageObject}[]};
export type PilotPrivateCleanupResult={status:'PASSED'|'FAILED'|'UNKNOWN';restorationAllowed:boolean;removed:number;errorCode:'NONE'|'OWNERSHIP_REFUSED'|'JOURNAL_UNCONFIRMED'|'REMOVE_FAILED'|'REMOVE_UNKNOWN'|'ABSENCE_UNCONFIRMED'};
export type PilotPrivateCleanupPorts={inspect():Promise<PilotPrivateSnapshot>;persistJournal(journal:PilotPrivateDelta):Promise<boolean>;removeExact(bucket:'learner-private',path:string):Promise<{status:'REMOVED'|'FAILED'|'UNKNOWN'}>;lookupExact(bucket:'learner-private',path:string):Promise<{status:'ABSENT'}|{status:'PRESENT';object:PilotStorageObject}|{status:'UNKNOWN'}>};
const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
const digest=/^[a-f0-9]{64}$/;
const copy=<T>(value:T):T=>structuredClone(value);
function refuse():never{throw Error('Private cleanup ownership requires review.');}
function same(left:unknown,right:unknown):boolean{return JSON.stringify(left)===JSON.stringify(right);}
function exactKeys(value:object,keys:string[]){if(Object.keys(value).sort().join('|')!==keys.sort().join('|'))refuse();}
function date(value:unknown){return typeof value==='string'&&/^\d{4}-\d\d-\d\dT/.test(value)&&Number.isFinite(Date.parse(value));}
function checkedContext(value:PilotPrivateContext):PilotPrivateContext{
 if(!value||typeof value!=='object')refuse();exactKeys(value,['version','runId','window','sourceSha','sourceManifestSha256','schemaSha256','migrationSha256','populationSha256','schoolId','allowedActorIds','apiUrl','databaseTarget','stopped']);
 if(value.version!==1||!/^\d+$/.test(value.runId)||!['performance','volume'].includes(value.window)||!/^[a-f0-9]{40}$/.test(value.sourceSha)||![value.sourceManifestSha256,value.schemaSha256,value.migrationSha256,value.populationSha256].every(item=>digest.test(item))||value.schoolId!=='10000000-0000-4000-8000-000000000001'||value.stopped!==true||!Array.isArray(value.allowedActorIds)||!value.allowedActorIds.length||value.allowedActorIds.some(item=>!uuid.test(item))||new Set(value.allowedActorIds).size!==value.allowedActorIds.length)refuse();
 let api:URL,db:URL;try{api=new URL(value.apiUrl);db=new URL(value.databaseTarget);}catch{refuse();}
 if(api.protocol!=='http:'||api.hostname!=='127.0.0.1'||api.port!=='56321'||api.pathname!=='/'||api.username||api.password||api.search||api.hash||!['postgres:','postgresql:'].includes(db.protocol)||db.hostname!=='127.0.0.1'||db.port!=='56322'||db.pathname!=='/postgres'||db.username||db.password||db.search||db.hash)refuse();
 return copy(value);
}
function checkedSnapshot(value:PilotPrivateSnapshot,context:PilotPrivateContext):PilotPrivateSnapshot{
 if(!value||typeof value!=='object')refuse();exactKeys(value,['context','assets','objects']);if(!same(checkedContext(value.context),context)||!Array.isArray(value.assets)||!Array.isArray(value.objects))refuse();
 const paths=new Set<string>(),assetIds=new Set<string>(),objects=new Set<string>();
 for(const asset of value.assets){exactKeys(asset,['id','schoolId','ownerId','createdBy','name','contentType','byteSize','sha256','state','objectPath','purpose','courseId','assessmentId','createdAt','availableAt','retiredAt']);
  if(!uuid.test(asset.id)||assetIds.has(asset.id)||asset.schoolId!==context.schoolId||!context.allowedActorIds.includes(asset.ownerId)||!context.allowedActorIds.includes(asset.createdBy)||!asset.name.trim()||asset.name.length>120||/[\\/\u202a-\u202e\u2066-\u2069]/u.test(asset.name)||[...asset.name].some(character=>character.charCodeAt(0)<32||character.charCodeAt(0)===127)||!['text/plain','image/png','image/jpeg','application/pdf'].includes(asset.contentType)||!Number.isInteger(asset.byteSize)||asset.byteSize<1||asset.byteSize>524288||!digest.test(asset.sha256)||!['STAGED','AVAILABLE','RETIRED'].includes(asset.state)||!date(asset.createdAt)||asset.availableAt!==null&&!date(asset.availableAt)||asset.retiredAt!==null&&!date(asset.retiredAt))refuse();
  const segment=asset.purpose==='PERSONAL'?asset.ownerId:asset.purpose==='COURSE_RESOURCE'?'resource':asset.purpose==='SUBMISSION_WORK'?'submission':null;
  if(!segment||asset.objectPath!==`${context.schoolId}/${segment}/${asset.id}`||paths.has(asset.objectPath)||asset.purpose==='PERSONAL'&&(asset.courseId!==null||asset.assessmentId!==null)||asset.purpose!=='PERSONAL'&&(!asset.courseId||!uuid.test(asset.courseId))||asset.purpose==='COURSE_RESOURCE'&&asset.assessmentId!==null||asset.purpose==='SUBMISSION_WORK'&&(!asset.assessmentId||!uuid.test(asset.assessmentId)))refuse();
  paths.add(asset.objectPath);assetIds.add(asset.id);
 }
 for(const object of value.objects){exactKeys(object,['id','bucketId','name','providerOwnerId','createdAt','updatedAt','providerMetadata','byteProof']);exactKeys(object.byteProof,['objectId','name','byteSize','sha256']);
  const asset=value.assets.find(asset=>asset.objectPath===object.name);if(!uuid.test(object.id)||objects.has(object.id)||object.bucketId!=='learner-private'||!asset||object.providerOwnerId!==null&&(typeof object.providerOwnerId!=='string'||!object.providerOwnerId)||!date(object.createdAt)||!date(object.updatedAt)||object.providerMetadata.size!==asset.byteSize||object.providerMetadata.mimetype!==asset.contentType||object.byteProof.objectId!==object.id||object.byteProof.name!==object.name||object.byteProof.byteSize!==asset.byteSize||object.byteProof.sha256!==asset.sha256)refuse();objects.add(object.id);
 }
 if(new Set(value.objects.map(object=>object.name)).size!==value.objects.length)refuse();return copy(value);
}
export function admitFreshPrivateBaseline(context:PilotPrivateContext,snapshot:PilotPrivateSnapshot):PilotPrivateBaseline{const checked=checkedSnapshot(snapshot,checkedContext(context));if(checked.assets.length!==0||checked.objects.length!==0)refuse();return{version:1,mode:'FRESH_EMPTY',snapshot:checked};}
export function planOwnedPrivateDelta(baseline:PilotPrivateBaseline,current:PilotPrivateSnapshot):PilotPrivateDelta{
 if(baseline.version!==1||baseline.mode!=='FRESH_EMPTY')refuse();const original=admitFreshPrivateBaseline(baseline.snapshot.context,baseline.snapshot),snapshot=checkedSnapshot(current,original.snapshot.context);
 return{version:1,context:copy(snapshot.context),assets:copy(snapshot.assets),targets:snapshot.objects.map(object=>({asset:copy(snapshot.assets.find(asset=>asset.objectPath===object.name)!),object:copy(object)}))};
}
function consistentDelta(expected:PilotPrivateDelta,current:PilotPrivateSnapshot,removed:Set<string>){const delta=planOwnedPrivateDelta({version:1,mode:'FRESH_EMPTY',snapshot:{context:expected.context,assets:[],objects:[]}},current);if(!same(delta.assets,expected.assets)||delta.targets.some(target=>removed.has(target.object.name)||!expected.targets.some(original=>same(original,target)))||expected.targets.some(target=>!removed.has(target.object.name)&&!delta.targets.some(current=>same(current,target))))refuse();}
export async function cleanupOwnedPrivateDelta(baseline:PilotPrivateBaseline,ports:PilotPrivateCleanupPorts):Promise<PilotPrivateCleanupResult>{
 let plan:PilotPrivateDelta;try{plan=planOwnedPrivateDelta(baseline,await ports.inspect());}catch{return{status:'FAILED',restorationAllowed:false,removed:0,errorCode:'OWNERSHIP_REFUSED'};}
 try{if(await ports.persistJournal(copy(plan))!==true)return{status:'FAILED',restorationAllowed:false,removed:0,errorCode:'JOURNAL_UNCONFIRMED'};}catch{return{status:'UNKNOWN',restorationAllowed:false,removed:0,errorCode:'JOURNAL_UNCONFIRMED'};}
 const removed=new Set<string>();
 for(const target of plan.targets){try{consistentDelta(plan,await ports.inspect(),removed);}catch{return{status:'FAILED',restorationAllowed:false,removed:removed.size,errorCode:'OWNERSHIP_REFUSED'};}
  let result:{status:'REMOVED'|'FAILED'|'UNKNOWN'};try{result=await ports.removeExact('learner-private',target.object.name);}catch{result={status:'UNKNOWN'};}
  let lookup:Awaited<ReturnType<PilotPrivateCleanupPorts['lookupExact']>>;try{lookup=await ports.lookupExact('learner-private',target.object.name);}catch{lookup={status:'UNKNOWN'};}
  if(lookup.status==='UNKNOWN'||result.status==='UNKNOWN')return{status:'UNKNOWN',restorationAllowed:false,removed:removed.size,errorCode:'REMOVE_UNKNOWN'};
  if(lookup.status==='PRESENT'){if(!same(lookup.object,target.object))return{status:'FAILED',restorationAllowed:false,removed:removed.size,errorCode:'OWNERSHIP_REFUSED'};try{consistentDelta(plan,await ports.inspect(),removed);}catch{return{status:'FAILED',restorationAllowed:false,removed:removed.size,errorCode:'OWNERSHIP_REFUSED'};}return{status:'FAILED',restorationAllowed:true,removed:removed.size,errorCode:'REMOVE_FAILED'};}
  removed.add(target.object.name);
  try{consistentDelta(plan,await ports.inspect(),removed);}catch{return{status:'FAILED',restorationAllowed:false,removed:removed.size,errorCode:'ABSENCE_UNCONFIRMED'};}
  if(result.status!=='REMOVED')return{status:'FAILED',restorationAllowed:true,removed:removed.size,errorCode:'REMOVE_FAILED'};
 }
 try{consistentDelta(plan,await ports.inspect(),removed);}catch{return{status:'FAILED',restorationAllowed:false,removed:removed.size,errorCode:'OWNERSHIP_REFUSED'};}
 return{status:'PASSED',restorationAllowed:true,removed:removed.size,errorCode:'NONE'};
}
