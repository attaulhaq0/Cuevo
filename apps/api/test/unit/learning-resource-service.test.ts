import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { Database } from '../../src/platform/database/database';
import type { IdentityService } from '../../src/platform/identity/identity.service';
import { LearningResourceService } from '../../src/modules/school-learning/resource.service';
import type { AssetStoragePort } from '../../src/modules/assets/public';
const id='00000000-0000-4000-8000-000000000001';const bytes=Buffer.from('School worksheet');const asset={id,ownerId:id,name:'ورقة.txt',contentType:'text/plain',byteSize:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),state:'AVAILABLE',objectPath:'private/resource'};
const actor={userId:id,schoolId:id,membershipId:id,role:'teacher',entitlements:['learning']};
describe('resource delivery current scope',()=>{
 it('reauthorizes after storage and denies removed/currently changed link',async()=>{let reads=0;const database={actorTransaction:async(_actor:string,_school:string,fn:(client:PoolClient)=>Promise<unknown>)=>fn({query:async()=>({rows:[{delivery:++reads===1?{asset,resource:{}}:null}]})}as unknown as PoolClient)}as unknown as Database;const identity={resolve:async()=>actor}as unknown as IdentityService;const storage={download:async()=>bytes,upload:async()=>{}}as AssetStoragePort;await expect(new LearningResourceService(identity,database,storage).download('Bearer current',id,id,id)).rejects.toMatchObject({code:'RESOURCE_NOT_FOUND'});expect(reads).toBe(2);});
 it('denies parent before reading storage and keeps raw bytes purpose-limited',async()=>{let reads=0;const identity={resolve:async()=>({...actor,role:'parent'})}as unknown as IdentityService;const storage={download:async()=>{reads++;return bytes;},upload:async()=>{}}as AssetStoragePort;await expect(new LearningResourceService(identity,{}as Database,storage).download('Bearer parent',id,id,id)).rejects.toMatchObject({status:403});expect(reads).toBe(0);});
});
