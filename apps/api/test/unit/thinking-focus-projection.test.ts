import { describe, expect, it } from 'vitest';
import type { PoolClient } from 'pg';
import type { Database } from '../../src/platform/database/database';
import { SchoolLearningService } from '../../src/modules/school-learning/learning.service';
import { LearningContentService } from '../../src/modules/school-learning/content.service';
import { checkedThinkingFocus, checkedThinkingFocusSet } from '../../src/modules/school-learning/thinking-focus-projection';
const id='00000000-0000-4000-8000-000000000001',course='00000000-0000-4000-8000-000000000002',other='00000000-0000-4000-8000-000000000003';
const actor={userId:id,schoolId:id,membershipId:id,role:'teacher'as const,entitlements:['learning','assessment','curriculum']};
const assessment={id,courseId:course,title:'Reviewed task',instructions:'Apply the procedure.',model:'numeric',maxScore:10,rubricId:null,preparationVersion:2,policyVersion:3};
const focus={schemaVersion:'1',target:{kind:'ASSESSMENT',id,criterionKey:null},courseId:course,targetTitle:'Reviewed task',sourceVersion:'source:1',status:'APPROVED',revision:2,classification:{id,revision:2,focus:{taxonomyVersion:'revised-bloom-2001-cuevo-v1',primaryProcess:'APPLY',additionalProcesses:[]},rationale:'Apply the procedure.',authorId:id,authoredAt:'2026-10-04T02:00:00Z',reviewerId:other,reviewedAt:'2026-10-04T03:00:00Z',reviewReason:'Reviewed actual task.'},source:{title:'Reviewed task',instructions:'Apply the procedure.',contentRevision:null,preparationVersion:2,policyVersion:3,rubricVersion:null,criterionTitle:null},canAuthor:true,canReview:false};
function database(response:unknown,batch=false){return{actorTransaction:async(_actor:string,_school:string,run:(c:PoolClient)=>Promise<unknown>)=>run({query:async(sql:string)=>({rows:sql.includes('read_thinking_focus')?[batch?{items:response}:{response}]:sql.includes('select title from app.courses')?[{title:'Reviewed course'}]:sql.includes('read_activity_assessment')?[{response:assessment}]:[{...assessment}]})}as unknown as PoolClient)}as unknown as Database;}
describe('additive learning task metadata receipts',()=>{
  it('accepts exact source metadata and explicit legacy null without borrowing another source',async()=>{
    expect(await new SchoolLearningService(database(focus)).assessment(actor,id)).toMatchObject({thinkingFocus:focus});
    expect(await new SchoolLearningService(database(null)).assessment(actor,id)).toMatchObject({thinkingFocus:null});
    expect(await new LearningContentService(database(focus)).task(actor,id)).toMatchObject({thinkingFocus:focus});
  });
  it.each([{...focus,target:{...focus.target,id:other}},{...focus,courseId:other},{...focus,source:{...focus.source,preparationVersion:1}},{...focus,source:{...focus.source,policyVersion:2}},{...focus,source:{...focus.source,rubricVersion:other+':old'}}])('rejects source identity and current preparation/policy/rubric mismatches',async value=>{
    await expect(new SchoolLearningService(database(value)).assessment(actor,id)).rejects.toMatchObject({status:503});
    await expect(new LearningContentService(database(value)).task(actor,id)).rejects.toMatchObject({status:503});
  });
  it.each([{rows:[focus,focus]},{rows:[{...focus,target:{...focus.target,id:other}}]},{rows:[{target:{kind:'ASSESSMENT',id:other,criterionKey:null},classification:null}]},{rows:[]}])('rejects duplicate, unexpected or missing batch target receipts',async({rows})=>{
    await expect(new SchoolLearningService(database(rows,true)).list(actor,'assessments',{})).rejects.toMatchObject({status:503});
  });
  it('preserves explicit authorized batch absence as null',async()=>{
    const response=await new SchoolLearningService(database([{target:{kind:'ASSESSMENT',id,criterionKey:null},courseId:course,classification:null}],true)).list(actor,'assessments',{});expect(response.items[0].thinkingFocus).toBeNull();
  });
  it('binds activity metadata to the current content revision and rejects undefined/null batch receipts',()=>{
    const activity={...focus,target:{kind:'ACTIVITY',id,criterionKey:null},source:{...focus.source,contentRevision:7,preparationVersion:null,policyVersion:null}};
    const basis={kind:'activity'as const,id,courseId:course,title:assessment.title,contentRevision:7};expect(checkedThinkingFocus(activity,basis)?.source.contentRevision).toBe(7);
    expect(()=>checkedThinkingFocus(activity,{...basis,contentRevision:6})).toThrowError();expect(()=>checkedThinkingFocus(undefined,basis)).toThrowError();expect(()=>checkedThinkingFocusSet([null],[basis])).toThrowError();expect(()=>checkedThinkingFocusSet([{target:activity.target,courseId:other,classification:null}],[basis])).toThrowError();
  });
});
