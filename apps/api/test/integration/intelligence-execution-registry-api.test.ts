import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config as dotenv } from 'dotenv';
import { createCustomerContext, customerCourse, customerReleased, type CustomerContext } from './customer-test-context';
dotenv({ path: '.env.local', quiet: true });
describe.skipIf(process.env.CUEVO_REQUIRE_INTEGRATION !== '1')('source-controlled task execution registry actual Auth API', () => {
  let context: CustomerContext;
  beforeAll(async () => { context = await createCustomerContext(); }, 60000);
  afterAll(async () => { await context?.close(); });
  it('binds exact task/model/prompt approval to a durable run and exposes only staff provenance', async () => {
    const before = await context.request('admin', '/v1/intelligence/execution'); expect(before.statusCode).toBe(200); expect(before.json()).toMatchObject({ status: 'REQUIRES_APPROVAL', binding: null, current: { mode: 'FIXTURE', providerDataPolicy: 'LOCAL_SYNTHETIC_FIXTURE', promptVersion: '2' } });
    for (const role of ['parent', 'strong', 'coordinator'] as const) expect((await context.request(role, '/v1/intelligence/execution')).statusCode).toBe(403);
    const policy = (await context.request('admin', '/v1/intelligence/policy')).json().policy;
    await context.command('admin', '/v1/intelligence/policy', { purpose: 'NEXT_LEARNING_ACTION', dataClassification: 'SCHOOL_CUSTOM_NUMERIC', fixtureEnabled: true, liveEnabled: false, allowedActions: ['GUIDED_PRACTICE', 'REVIEW_FEEDBACK'], expectedVersion: policy.version, confirmApproval: true, reason: 'Administrator reviewed current task model and prompt configuration.' });
    const registry = await context.request('teacher', '/v1/intelligence/execution'); expect(registry.statusCode).toBe(200); expect(registry.json()).toMatchObject({ status: 'APPROVED', binding: { approvalSource: 'EXPLICIT_SCHOOL_POLICY', approvedBy: '20000000-0000-4000-8000-000000000001', effectiveAt: expect.any(String) } });
    const course = await customerCourse(context, 'Registry source'); const baseline = await customerReleased(context, 'strong', course.courseId, 'Registry baseline', 3); await context.drain(); const proposal = await context.command('teacher', '/v1/intelligence/analyze', { baselineResultId: baseline.resultId });
    const run = (await context.client.query('select execution_binding_id,execution_binding_version from app.intelligence_runs where school_id=$1 and id=$2', [context.school, proposal.intelligenceRunId])).rows[0]; expect(run).toMatchObject({ execution_binding_id: registry.json().binding.id, execution_binding_version: registry.json().binding.version });
    expect((await context.client.query("select count(*)::integer count from internal.audit_events where school_id=$1 and entity_id=$2 and action='intelligence.execution.bound'", [context.school, proposal.intelligenceRunId])).rows[0].count).toBe(1);
    await context.drain();expect((await context.client.query("select count(*)::integer count from internal.outbox_events where school_id=$1 and type in('intelligence.execution.approved','intelligence.execution.bound')and state='COMPLETED'",[context.school])).rows[0].count).toBe(2);
    expect(JSON.stringify(registry.json())).not.toMatch(/apiKey|authorization|promptBody|contentBase64/);
  });
  it('keeps historical binding visible while paused policy requires a new current approval',async()=>{
    const original=(await context.request('teacher','/v1/intelligence/execution')).json();expect(original.status).toBe('APPROVED');const policy=(await context.request('admin','/v1/intelligence/policy')).json().policy;
    await context.command('admin','/v1/intelligence/policy',{purpose:'NEXT_LEARNING_ACTION',dataClassification:'SCHOOL_CUSTOM_NUMERIC',fixtureEnabled:false,liveEnabled:false,allowedActions:['GUIDED_PRACTICE','REVIEW_FEEDBACK'],expectedVersion:policy.version,confirmApproval:true,reason:'Pause the current analysis mode and preserve its original approval.'});
    const paused=await context.request('teacher','/v1/intelligence/execution');expect(paused.statusCode,paused.body).toBe(200);expect(paused.json()).toMatchObject({status:'REQUIRES_APPROVAL',binding:{id:original.binding.id,policyVersion:policy.version}});
    const current=(await context.request('admin','/v1/intelligence/policy')).json().policy;await context.command('admin','/v1/intelligence/policy',{purpose:'NEXT_LEARNING_ACTION',dataClassification:'SCHOOL_CUSTOM_NUMERIC',fixtureEnabled:true,liveEnabled:false,allowedActions:['GUIDED_PRACTICE','REVIEW_FEEDBACK'],expectedVersion:current.version,confirmApproval:true,reason:'Review the unchanged execution configuration under the restored current policy.'});
    const restored=(await context.request('teacher','/v1/intelligence/execution')).json();expect(restored.status).toBe('APPROVED');expect(restored.binding.id).not.toBe(original.binding.id);expect(restored.binding.policyVersion).toBe(current.version+1);
  });
  it('does not mark a future-dated current binding effective',async()=>{
    const before=(await context.request('teacher','/v1/intelligence/execution')).json();expect(before.status).toBe('APPROVED');
    // Immutable owner-only fixture models an approved future effective time without editing prior binding history.
    const future=(await context.client.query("insert into internal.intelligence_execution_bindings(school_id,version,policy_version,manifest,approved_by,effective_at,approval_source)select school_id,version+1,policy_version,manifest,approved_by,clock_timestamp()+interval '1 day',approval_source from internal.intelligence_execution_bindings where school_id=$1 and id=$2 returning id",[context.school,before.binding.id])).rows[0];
    const registry=await context.request('teacher','/v1/intelligence/execution');expect(registry.statusCode,registry.body).toBe(200);expect(registry.json()).toMatchObject({status:'REQUIRES_APPROVAL',binding:{id:future.id,policyVersion:before.binding.policyVersion}});
  });
});
