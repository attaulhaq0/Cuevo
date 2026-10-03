import { describe,expect,it } from 'vitest';
import type { PoolClient } from 'pg';
import type { Database } from '../../src/platform/database/database';
import { LearningContentService } from '../../src/modules/school-learning/content.service';
const id='00000000-0000-4000-8000-000000000001';const actor={userId:id,schoolId:id,membershipId:id,role:'student'as const,entitlements:['learning','assessment']};
function db(response:unknown){let reads=0;return{database:{actorTransaction:async(_actor:string,_school:string,run:(client:PoolClient)=>Promise<unknown>)=>run({query:async()=>{reads++;return{rows:[{response}]};}}as unknown as PoolClient)}as unknown as Database,count:()=>reads};}
describe('learning source command API boundaries',()=>{
 it('denies learner content publication before SQL',async()=>{const d=db({id});await expect(new LearningContentService(d.database).command(actor,'publish','lesson',id,{expectedRevision:1,confirmPublication:true},'content-publish-key','test')).rejects.toMatchObject({status:403});expect(d.count()).toBe(0);});
 it('rejects mismatched content owner and unconfirmed receipts',async()=>{const d=db({id});await expect(new LearningContentService(d.database).command({...actor,role:'teacher'},'draft','lesson',id,{resource:'unit',expectedRevision:1,title:'Unit',content:'',reason:'Change',kind:null,assessmentId:null},'content-owner-key','test')).rejects.toMatchObject({status:400});await expect(new LearningContentService(d.database).command({...actor,role:'teacher'},'publish','lesson',id,{expectedRevision:1,confirmPublication:true},'content-publish-key','test')).rejects.toMatchObject({status:503});});
});
