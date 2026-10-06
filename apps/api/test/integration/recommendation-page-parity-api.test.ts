import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config as dotenv } from 'dotenv';
import { recommendationProvenanceSchema } from '@cuevo/contracts';
import { createCustomerContext, customerActor, customerCourse, customerReleased, type CustomerContext, type CustomerRole } from './customer-test-context';

dotenv({ path: '.env.local', quiet: true });
const payload = (baselineResultId: string, label: string) => ({ baselineResultId, observation: 'Recorded source ' + label, interpretation: 'Teacher review ' + label, recommendation: 'Read feedback ' + label, rationale: 'Exact evidence ' + label, uncertainty: 'Recorded evidence does not prove cause.', activityTitle: 'Human practice ' + label, instructions: 'Teacher-authored instruction ' + label });
const projection = `jsonb_build_object('id',r.id,'learnerId',r.learner_id,'referenceId',r.reference_id,'baselineResultId',r.baseline_result_id,'origin',r.origin,'generationMode',r.generation_mode,'intelligenceRunId',r.intelligence_run_id,'observation',r.observation,'evidenceIds',r.evidence_ids,'interpretation',r.interpretation,'recommendation',r.recommendation,'rationale',r.rationale,'uncertainty',r.uncertainty,'activityTitle',r.activity_title,'instructions',r.instructions,'status',r.status,'createdAt',r.created_at,'selectedActivityId',r.selected_activity_id,'analysis',r.analysis,'promptDigest',r.prompt_digest)`;

describe.skipIf(process.env.CUEVO_REQUIRE_INTEGRATION !== '1')('recommendation page exact current RLS parity', () => {
  let context: CustomerContext;
  beforeAll(async () => { context = await createCustomerContext(); }, 60000);
  afterAll(async () => { await context?.close(); });

  async function scoped<T>(role: CustomerRole, run: () => Promise<T>) {
    await context.client.query('SAVEPOINT parity_read');
    await context.client.query('set local role cuevo_api');
    try {
      await context.client.query("set local statement_timeout='5s'");
      const actor = customerActor(role === 'admin' ? 1 : role === 'coordinator' ? 2 : role === 'otherTeacher' ? 5 : 4);
      await context.client.query("select set_config('app.actor_id',$1,true),set_config('app.school_id',$2,true)", [actor, context.school]);
      return await run();
    } finally {
      await context.client.query('ROLLBACK TO SAVEPOINT parity_read');
      await context.client.query('RELEASE SAVEPOINT parity_read');
    }
  }
  async function raw(role: CustomerRole) {
    return scoped(role, async () => (await context.client.query(`select ${projection}as item from app.recommendations r where r.school_id=$1 order by r.id`, [context.school])).rows.map(row => row.item as Record<string, unknown> & { id: string }));
  }
  async function parity(role: CustomerRole, limit = 2) {
    const expected = await raw(role); const collected: Record<string, unknown>[] = []; let cursor: string | null = null;
    for (let index = 0; index <= Math.ceil(expected.length / limit); index++) {
      const response = await context.request(role, '/v1/recommendations?limit=' + limit + (cursor ? '&cursor=' + cursor : ''));
      expect(response.statusCode, response.body).toBe(200);
      const page = response.json() as { items: (Record<string, unknown> & { id: string })[]; nextCursor: string | null };
      const candidates = expected.filter(row => cursor === null || row.id > cursor);
      expect(page.items).toEqual(candidates.slice(0, limit));
      expect(page.nextCursor).toBe(candidates.length > limit ? candidates[limit - 1].id : null);
      for (const item of page.items) {
        expect(recommendationProvenanceSchema.safeParse(item).success).toBe(true);
        const allowed = await scoped(role, async () => (await context.client.query('select internal.recommendation_source_allowed($1,$2)as allowed', [context.school, item.id])).rows[0]?.allowed);
        expect(allowed).toBe(true); // A false individual helper can never borrow its group's verdict.
      }
      collected.push(...page.items); if (page.nextCursor === null) break; cursor = page.nextCursor;
    }
    expect(collected).toEqual(expected);
    return expected;
  }

  it('matches every payload/current helper across creators, human metadata/status and denied source cursors', async () => {
    const course = await customerCourse(context, 'Page authority parity');
    const current = await customerReleased(context, 'strong', course.courseId, 'Current source', 3);
    const stale = await customerReleased(context, 'observed', course.courseId, 'Later corrected source', 2);
    await context.drain();
    const human: (Record<string, unknown> & { id: string })[] = [];
    for (let index = 0; index < 8; index++) human.push(await context.command(index === 6 ? 'admin' : 'teacher', '/v1/recommendations', payload(index % 2 ? stale.resultId : current.resultId, String(index))));
    await context.command('teacher', '/v1/recommendations/' + human[0].id + '/decision', { decision: 'REJECT', reason: 'Actual human review metadata differs.' });
    for (let index = 0; index < 4; index++) await context.command('teacher', '/v1/intelligence/analyze', { baselineResultId: current.resultId });
    const corrected = await context.command('teacher', '/v1/submissions/' + stale.submissionId + '/results', { score: 4, feedback: 'Actual source correction.', expectedPolicyVersion: 2, expectedRevision: 1, sourceEvidence: true });
    await context.command('teacher', '/v1/results/' + corrected.id + '/release', { expectedRevision: 2, parentVisible: false });
    const rows = await parity('teacher');
    expect(rows.filter(row => row.origin === 'TEACHER_AUTHORED')).toHaveLength(4);
    expect(rows.find(row => row.id === human[0].id)?.status).toBe('REJECTED');
    expect(rows.find(row => row.id === human[3].id)).toBeUndefined(); // A separately created proposal does not resurrect a stale baseline.
    expect(rows.some(row => row.id === human[6].id && row.activityTitle === 'Human practice 6')).toBe(true); // Current baseline authority is not restricted to the proposal creator.
    await parity('admin'); await parity('coordinator'); expect(await parity('otherTeacher')).toHaveLength(0);
    await context.client.query('SAVEPOINT withdrawn_scope');
    try {
      await context.client.query("update app.enrollments set effective_to=now()-interval'1 second'where school_id=$1 and student_actor_id=$2", [context.school, customerActor(12)]);
      expect((await parity('teacher')).filter(row => row.learnerId === customerActor(12))).toHaveLength(0);
    } finally { await context.client.query('ROLLBACK TO SAVEPOINT withdrawn_scope'); }
    await context.client.query('SAVEPOINT withdrawn_entitlement');
    try {
      await context.client.query("update app.entitlements set enabled=false where school_id=$1 and code='improvement'", [context.school]);
      expect(await raw('teacher')).toHaveLength(0);
      expect((await context.request('teacher', '/v1/recommendations?limit=2')).statusCode).toBe(403);
    } finally { await context.client.query('ROLLBACK TO SAVEPOINT withdrawn_entitlement'); }
  }, 120000);

  it('keeps exact native/evidence/saved source authority and filters a distinct failed helper group', async () => {
    const course = await customerCourse(context, 'Native page parity');
    const rubric = await context.command('teacher', '/v1/rubrics', { courseId: course.courseId, title: 'Checking evidence', version: 'synthetic-native-v1', criteria: [{ key: 'check', title: 'Checking', levels: [{ key: 'shown', label: 'Shown', description: 'Show the check.' }] }] });
    const assessment = await context.command('teacher', '/v1/assessments', { courseId: course.courseId, title: 'Native page source', instructions: 'Explain one checking step.', maxScore: 10 });
    await context.command('teacher', '/v1/assessments/' + assessment.id + '/rubric', { rubricId: rubric.id, expectedPolicyVersion: 1 });
    await context.command('teacher', '/v1/assessments/' + assessment.id + '/reference', { referenceId: context.referenceId, expectedPolicyVersion: 2 });
    const submission = await context.command('observed', '/v1/assessments/' + assessment.id + '/submissions', { content: 'Synthetic native explanation.' });
    const mark = await context.command('teacher', '/v1/submissions/' + submission.id + '/results', { nativeResult: { type: 'rubric', rubricId: rubric.id, criteria: [{ criterionKey: 'check', levelKey: 'shown' }] }, feedback: 'Reviewed native evidence.', expectedPolicyVersion: 3, expectedRevision: 0, sourceEvidence: true });
    const baseline = await context.command('teacher', '/v1/results/' + mark.id + '/release', { expectedRevision: 1, parentVisible: false });
    const policy = (await context.request('admin', '/v1/intelligence/policy')).json().policy;
    await context.command('admin', '/v1/intelligence/policy', { purpose: 'NEXT_LEARNING_ACTION', dataClassification: 'SCHOOL_CUSTOM_NATIVE', fixtureEnabled: true, liveEnabled: false, allowedActions: ['GUIDED_PRACTICE', 'REVIEW_FEEDBACK'], expectedVersion: policy.version, confirmApproval: true, reason: 'Reviewed synthetic native fixture.' });
    await context.drain();
    const first = await context.command('teacher', '/v1/intelligence/analyze', { baselineResultId: baseline.id });
    const second = await context.command('teacher', '/v1/intelligence/analyze', { baselineResultId: baseline.id });
    const rows = await parity('teacher');
    expect(rows.filter(row => row.baselineResultId === baseline.id).map(row => row.id).sort()).toEqual([first.id, second.id].sort());
    expect(first.evidenceIds).toEqual([baseline.evidenceId]);
    const stored = (await context.client.query('select context_references from app.intelligence_runs where school_id=$1 and id=$2', [context.school, first.intelligenceRunId])).rows[0].context_references;
    expect(stored.nativeResult).toEqual(baseline.nativeResult); expect(stored).not.toHaveProperty('score');

    await context.client.query('SAVEPOINT corrupt_saved_native');
    try {
      // Explicit rollback-only corrupt fixture: immutable source changes are never a supported runtime mutation.
      await context.client.query('alter table app.intelligence_context_details disable trigger immutable_history');
      await context.client.query("update app.intelligence_context_details set context=jsonb_set(context,'{recentResults,0,nativeResult,criteria,0,levelKey}',to_jsonb('unsupported'::text))where school_id=$1 and run_id=$2", [context.school, second.intelligenceRunId]);
      await context.client.query('alter table app.intelligence_context_details enable trigger immutable_history');
      const allowed = await scoped('teacher', async () => (await context.client.query('select internal.recommendation_source_allowed($1,$2)allowed', [context.school, second.id])).rows[0].allowed);
      expect(allowed).toBe(false);
      const after = await parity('teacher');
      expect(after.some(row => row.id === second.id)).toBe(false); expect(after.some(row => row.id === first.id)).toBe(true);
    } finally { await context.client.query('ROLLBACK TO SAVEPOINT corrupt_saved_native'); }

    await context.client.query('SAVEPOINT malformed_saved_array');
    try {
      // Explicit corrupt rollback fixture: canonical known-invalid source is isolated to its own proposal.
      await context.client.query('alter table app.intelligence_context_details disable trigger immutable_history');
      await context.client.query("update app.intelligence_context_details set context=jsonb_set(context,'{recentResults}',jsonb_build_object('unexpected','object'))where school_id=$1 and run_id=$2", [context.school, second.intelligenceRunId]);
      await context.client.query('alter table app.intelligence_context_details enable trigger immutable_history');
      const allowed = await scoped('teacher', async () => (await context.client.query('select internal.recommendation_source_allowed($1,$2)allowed', [context.school, second.id])).rows[0].allowed);
      expect(allowed).toBe(false);
      const teacher = await parity('teacher'); expect(teacher.some(row => row.id === second.id)).toBe(false); expect(teacher.some(row => row.id === first.id)).toBe(true);
      const coordinator = await parity('coordinator'); expect(coordinator.some(row => row.id === first.id)).toBe(true); expect(coordinator.some(row => row.id === second.id)).toBe(true);
    } finally { await context.client.query('ROLLBACK TO SAVEPOINT malformed_saved_array'); }

    await context.client.query('SAVEPOINT corrupt_linkage');
    try {
      // Explicit provenance-corrupt fixture; the new page deliberately refuses more than legacy RLS here.
      await context.client.query('alter table app.recommendations disable trigger recommendation_run_provenance');
      await context.client.query('update app.recommendations set created_by=$3 where school_id=$1 and id=$2', [context.school, second.id, customerActor(1)]);
      await context.client.query('alter table app.recommendations enable trigger recommendation_run_provenance');
      expect((await raw('teacher')).some(row => row.id === second.id)).toBe(true); // Existing helper does not read proposal.created_by.
      const response = await context.request('teacher', '/v1/recommendations?limit=100');
      expect(response.statusCode).toBe(200);
      expect(response.json().items.some((row: { id: string }) => row.id === second.id)).toBe(false);
      expect(response.json().items.some((row: { id: string }) => row.id === first.id)).toBe(true);
    } finally { await context.client.query('ROLLBACK TO SAVEPOINT corrupt_linkage'); }
    await parity('teacher');
  }, 90000);
});
