import { describe, expect, it } from 'vitest';
import type { PoolClient } from 'pg';
import type { Database } from '../../src/platform/database/database';
import { ThinkingFocusService } from '../../src/modules/school-learning/thinking-focus.service';

const id = '00000000-0000-4000-8000-000000000001';
const actor = { userId:id, schoolId:id, membershipId:id, role:'teacher' as const, entitlements:['learning','curriculum','assessment'] };
const focus = { taxonomyVersion:'revised-bloom-2001-cuevo-v1', primaryProcess:'APPLY', additionalProcesses:[] };
const input = { expectedRevision:0, expectedSourceVersion:'activity:1', focus, rationale:'Apply an idea to the task.' };
function database(response:unknown, error?:unknown) {
  const calls:{sql:string; values:unknown[]}[] = [];
  return { calls, value:{ actorTransaction:async (user:string, school:string, run:(client:PoolClient)=>Promise<unknown>) => {
    expect([user,school]).toEqual([id,id]);
    return run({query:async (sql:string, values:unknown[])=>{ calls.push({sql,values}); if(error)throw error; return {rows:[{response}]}; }} as unknown as PoolClient);
  }} as unknown as Database };
}
describe('reviewed thinking-focus API authority and receipts', () => {
  it('denies student authoring, teacher review and missing curriculum review before database', async () => {
    const db = database({}); const service = new ThinkingFocusService(db.value);
    await expect(service.command({...actor,role:'student'},'draft','activity',id,{},input,'thinking-key','request')).rejects.toMatchObject({status:403});
    const review = {expectedRevision:1,expectedSourceVersion:'activity:1',decision:'APPROVE',reason:'Reviewed actual task.',confirmReview:true};
    await expect(service.command(actor,'review','activity',id,{},review,'thinking-key','request')).rejects.toMatchObject({status:403});
    await expect(service.command({...actor,role:'coordinator',entitlements:['learning']},'review','activity',id,{},review,'thinking-key','request')).rejects.toMatchObject({status:403});
    expect(db.calls).toHaveLength(0);
  });
  it('rejects malformed focus, wrong criterion tuple, unknown query and invalid key without SQL', async () => {
    const db=database({}); const service=new ThinkingFocusService(db.value);
    await expect(service.command(actor,'draft','activity',id,{}, {...input,focus:{...focus,additionalProcesses:['APPLY']}},'thinking-key','request')).rejects.toMatchObject({status:400});
    await expect(service.read(actor,'criterion',id,{})).rejects.toMatchObject({status:400});
    await expect(service.read(actor,'activity',id,{criterionKey:'reasoning'})).rejects.toMatchObject({status:400});
    await expect(service.read(actor,'activity',id,{unexpected:true})).rejects.toMatchObject({status:400});
    await expect(service.command(actor,'draft','activity',id,{},input,undefined,'request')).rejects.toMatchObject({status:400});
    expect(db.calls).toHaveLength(0);
  });
  it('treats malformed mutation receipts as unknown outcomes and preserves safe denial/conflict errors', async () => {
    await expect(new ThinkingFocusService(database({}).value).command(actor,'draft','activity',id,{},input,'thinking-key','request')).rejects.toMatchObject({status:503,code:'THINKING_FOCUS_OUTCOME_UNKNOWN'});
    await expect(new ThinkingFocusService(database({}, {code:'42501',detail:'private content'}).value).read(actor,'activity',id,{})).rejects.toMatchObject({status:403});
    await expect(new ThinkingFocusService(database({}, {code:'22023'}).value).read(actor,'activity',id,{})).rejects.toMatchObject({status:409});
  });
  it('requires the exact target and a confirmed mutation identity, beyond a valid response shape',async()=>{
    const response={schemaVersion:'1',target:{kind:'ACTIVITY',id,criterionKey:null},courseId:id,targetTitle:'Apply the idea',sourceVersion:'activity:1',status:'AWAITING_REVIEW',revision:1,classification:{id,revision:1,focus,rationale:input.rationale,authorId:id,authoredAt:'2026-10-04T02:00:00Z',reviewerId:null,reviewedAt:null,reviewReason:null},source:{title:'Apply the idea',instructions:'Use a procedure.',contentRevision:1,preparationVersion:null,policyVersion:null,rubricVersion:null,criterionTitle:null},canAuthor:true,canReview:false};
    await expect(new ThinkingFocusService(database(response).value).command(actor,'draft','activity',id,{},input,'thinking-key','request')).rejects.toMatchObject({code:'THINKING_FOCUS_OUTCOME_UNKNOWN'});
    await expect(new ThinkingFocusService(database({...response,id}).value).command(actor,'draft','activity',id,{},input,'thinking-key','request')).resolves.toMatchObject({id,revision:1});
    await expect(new ThinkingFocusService(database({...response,target:{kind:'ASSESSMENT',id,criterionKey:null}}).value).read(actor,'activity',id,{})).rejects.toMatchObject({status:503});
  });
  it('accepts the authorized native result wrapper with its distinct pinned submission and rejects wrong result identity',async()=>{
    const submissionId='00000000-0000-4000-8000-000000000002';
    const snapshot={schemaVersion:'1',kind:'submission',id:submissionId,resultId:id,recorded:true,scope:'RECORDED_TASK_DEMAND_NOT_ATTAINMENT',items:[]};
    const parent={...actor,role:'parent' as const};const db=database(snapshot);
    await expect(new ThinkingFocusService(db.value).snapshot(parent,'result',id)).resolves.toMatchObject({id:submissionId,resultId:id});
    expect(db.calls[0].values).toEqual(['result',id]);
    await expect(new ThinkingFocusService(database({...snapshot,resultId:submissionId}).value).snapshot(parent,'result',id)).rejects.toMatchObject({status:503});
    await expect(new ThinkingFocusService(database(snapshot).value).snapshot(actor,'submission',submissionId)).rejects.toMatchObject({status:503});
  });
});
