import { describe, expect, it } from 'vitest';
import type { Database } from '../../src/platform/database/database';
import type { PoolClient } from 'pg';
import { ParentConversationService } from '../../src/modules/community/conversation.service';
const id='00000000-0000-4000-8000-000000000001';const actor={userId:id,schoolId:id,membershipId:id,role:'parent' as const,entitlements:['community']};
function db(response:unknown){let writes=0;return{database:{actorTransaction:async(_actor:string,_school:string,run:(client:PoolClient)=>Promise<unknown>)=>run({query:async()=>{writes++;return{rows:[{response}]};}}as unknown as PoolClient)}as unknown as Database,count:()=>writes};}
describe('purpose-limited parent conversation API',()=>{
 it('denies student direct message creation before SQL',async()=>{const d=db({id});await expect(new ParentConversationService(d.database).command({...actor,role:'student'},'create',null,{learnerId:id,parentId:id,teacherId:id,classId:id,subjectId:id,title:'Question',body:'Explain please'},'parent-create-key','test')).rejects.toMatchObject({status:403});expect(d.count()).toBe(0);});
 it('denies parent policy and moderator authority',async()=>{const d=db({id});await expect(new ParentConversationService(d.database).command(actor,'policy',null,{enabled:true,expectedVersion:0,reason:'Attempt',confirmApproval:true},'parent-policy-key','test')).rejects.toMatchObject({status:403});await expect(new ParentConversationService(d.database).command(actor,'moderate',id,{action:'HIDE',expectedVersion:0,reason:'Attempt',confirmModeration:true},'parent-moderate-key','test')).rejects.toMatchObject({status:403});expect(d.count()).toBe(0);});
 it('rejects injected sender or protected attachment before database',async()=>{const d=db({id});await expect(new ParentConversationService(d.database).command(actor,'send',id,{body:'Question',senderId:id},'parent-send-key','test')).rejects.toMatchObject({status:400});expect(d.count()).toBe(0);});
 it('does not confirm a malformed committed message receipt',async()=>{const d=db({id});await expect(new ParentConversationService(d.database).command(actor,'send',id,{body:'Question'},'parent-send-key','test')).rejects.toMatchObject({status:503});});
});
