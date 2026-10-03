import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { Database } from '../../src/platform/database/database';
import type { IdentityService } from '../../src/platform/identity/identity.service';
import { SubmissionAssetService } from '../../src/modules/school-learning/submission-asset.service';
import { PortfolioArtifactService } from '../../src/modules/portfolio/portfolio-artifact.service';
import type { AssetStoragePort } from '../../src/modules/assets/public';
const id='00000000-0000-4000-8000-000000000001'; const other='00000000-0000-4000-8000-000000000002'; const bytes=Buffer.from('Actual submitted explanation');
const asset={id,ownerId:id,name:'إجابة.txt',contentType:'text/plain',byteSize:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),state:'AVAILABLE',objectPath:'school/submission/asset'};
const actor={userId:id,schoolId:id,membershipId:id,role:'student',entitlements:['assessment','portfolio']};
function dependencies(records:unknown[], role='student') { let reads=0; let downloads=0; let uploads=0; const database={actorTransaction:async(_actor:string,_school:string,run:(client:PoolClient)=>Promise<unknown>)=>run({query:async()=>({rows:[{asset:records[Math.min(reads++,records.length-1)],receipt:records[Math.min(reads-1,records.length-1)]}]})}as unknown as PoolClient)}as unknown as Database; const identity={resolve:async()=>({...actor,role})}as unknown as IdentityService; const storage={download:async()=>{downloads++;return bytes;},upload:async()=>{uploads++;}}as AssetStoragePort; return {database,identity,storage,counts:()=>({reads,downloads,uploads})}; }
describe('exact submission and portfolio artifact boundaries',()=>{
 it('rejects a retired submission record before touching storage',async()=>{const d=dependencies([{...asset,state:'RETIRED'}]);await expect(new SubmissionAssetService(d.identity,d.database,d.storage).finalize('Bearer current',id,id,id,{contentBase64:bytes.toString('base64')},'finalize-retired','test')).rejects.toMatchObject({status:403});expect(d.counts().uploads+d.counts().downloads).toBe(0);});
 it('does not accept AVAILABLE metadata substituted after upload',async()=>{const d=dependencies([asset,{...asset,id:other}]);await expect(new SubmissionAssetService(d.identity,d.database,d.storage).finalize('Bearer current',id,id,id,{contentBase64:bytes.toString('base64')},'finalize-changed','test')).rejects.toMatchObject({status:403});});
 it('rejects storage path substitution after source delivery',async()=>{const d=dependencies([asset,{...asset,objectPath:'different/object'}]);await expect(new SubmissionAssetService(d.identity,d.database,d.storage).download('Bearer current',id,id,id)).rejects.toMatchObject({status:403});});
 it('rejects parent generic submission bytes before storage',async()=>{const d=dependencies([asset],'parent');await expect(new SubmissionAssetService(d.identity,d.database,d.storage).download('Bearer parent',id,id,id)).rejects.toMatchObject({status:403});expect(d.counts().downloads).toBe(0);});
 it('rejects unconfirmed stage receipt',async()=>{const d=dependencies([null]);await expect(new SubmissionAssetService(d.identity,d.database,d.storage).stage('Bearer current',id,id,{name:asset.name,contentType:asset.contentType,byteSize:asset.byteSize,sha256:asset.sha256},'stage-missing','test')).rejects.toMatchObject({status:503});});
 it('rejects a malformed work receipt as an unknown outcome',async()=>{const d=dependencies([{id}]);await expect(new SubmissionAssetService(d.identity,d.database,d.storage).work('Bearer current',id,'submit',id,null,{responseKind:'TEXT',content:'Actual answer',assetIds:[]},'work-missing','test')).rejects.toMatchObject({status:503});});
 it('rejects a portfolio storage path changed during delivery',async()=>{const d=dependencies([asset,{...asset,objectPath:'different/object'}],'parent');await expect(new PortfolioArtifactService(d.identity,d.database,d.storage).download('Bearer parent',id,id,id,id)).rejects.toMatchObject({status:403});});
 it('denies coordinator raw portfolio document bytes',async()=>{const d=dependencies([asset],'coordinator');await expect(new PortfolioArtifactService(d.identity,d.database,d.storage).download('Bearer coordinator',id,id,id,id)).rejects.toMatchObject({status:403});expect(d.counts().downloads).toBe(0);});
});

it('reconciles a bounded draft receipt without placing a large actual response in the command record',async()=>{
 const content='إ'.repeat(50000);const receipt={id,assessmentId:id,revision:1,status:'DRAFT'};const source={...receipt,responseKind:'TEXT',content,artifacts:[]};let reads=0;const database={actorTransaction:async(_actor:string,_school:string,run:(client:PoolClient)=>Promise<unknown>)=>run({query:async()=>({rows:[++reads===1?{receipt}:{source}]})}as unknown as PoolClient)}as unknown as Database;const identity={resolve:async()=>actor}as unknown as IdentityService;const result=await new SubmissionAssetService(identity,database).work('Bearer current',id,'draft',id,null,{responseKind:'TEXT',content,assetIds:[],expectedRevision:0},'large-work-receipt','test');expect(result.content).toBe(content);expect(reads).toBe(2);
});
it('reports the known original draft as superseded when current working source has advanced',async()=>{
 const receipt={id,assessmentId:id,revision:1,status:'DRAFT'};const source={...receipt,revision:2,responseKind:'TEXT',content:'Changed draft',artifacts:[]};let reads=0;const database={actorTransaction:async(_actor:string,_school:string,run:(client:PoolClient)=>Promise<unknown>)=>run({query:async()=>({rows:[++reads===1?{receipt}:{source}]})}as unknown as PoolClient)}as unknown as Database;const identity={resolve:async()=>actor}as unknown as IdentityService;await expect(new SubmissionAssetService(identity,database).work('Bearer current',id,'draft',id,null,{responseKind:'TEXT',content:'Original draft',assetIds:[],expectedRevision:0},'advanced-work-receipt','test')).rejects.toMatchObject({status:409,code:'SUBMISSION_DRAFT_SUPERSEDED'});
});

it('translates a private submission source denial before storage to forbidden',async()=>{
 const database={actorTransaction:async()=>{throw {code:'42501'};}}as unknown as Database;const identity={resolve:async()=>actor}as unknown as IdentityService;await expect(new SubmissionAssetService(identity,database).finalize('Bearer current',id,id,id,{contentBase64:bytes.toString('base64')},'denied-private-source','test')).rejects.toMatchObject({status:503});const storage={download:async()=>bytes,upload:async()=>{}}as AssetStoragePort;await expect(new SubmissionAssetService(identity,database,storage).finalize('Bearer current',id,id,id,{contentBase64:bytes.toString('base64')},'denied-private-source','test')).rejects.toMatchObject({status:403});
});
it('translates private portfolio preapproval denial to forbidden',async()=>{
 const database={actorTransaction:async()=>{throw {code:'42501'};}}as unknown as Database;const identity={resolve:async()=>({...actor,role:'parent'})}as unknown as IdentityService;const storage={download:async()=>bytes,upload:async()=>{}}as AssetStoragePort;await expect(new PortfolioArtifactService(identity,database,storage).download('Bearer parent',id,id,id,id)).rejects.toMatchObject({status:403});
});


it('denies a submitted byte delivery when current actor changes after storage read',async()=>{
 const d=dependencies([asset]);let resolves=0;const identity={resolve:async()=>++resolves===1?actor:{...actor,userId:other}}as unknown as IdentityService;await expect(new SubmissionAssetService(identity,d.database,d.storage).download('Bearer current',id,id,id)).rejects.toMatchObject({status:403});expect(d.counts().downloads).toBe(1);
});
it('denies parent byte delivery revoked while storage response is held',async()=>{
 let reads=0;let released!:()=>void;const hold=new Promise<void>(resolve=>{released=resolve;});let started!:()=>void;const observed=new Promise<void>(resolve=>{started=resolve;});const database={actorTransaction:async(_actor:string,_school:string,run:(client:PoolClient)=>Promise<unknown>)=>run({query:async()=>{if(++reads>1)throw {code:'42501'};return{rows:[{asset}]};}}as unknown as PoolClient)}as unknown as Database;const identity={resolve:async()=>({...actor,role:'parent'})}as unknown as IdentityService;const storage={download:async()=>{started();await hold;return bytes;},upload:async()=>{}}as AssetStoragePort;const pending=new PortfolioArtifactService(identity,database,storage).download('Bearer parent',id,id,id,id);await observed;released();await expect(pending).rejects.toMatchObject({status:403});expect(reads).toBe(2);
});
