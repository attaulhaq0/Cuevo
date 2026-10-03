import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config as dotenv } from 'dotenv';
import { createCustomerContext, customerCourse, customerReleased, type CustomerContext } from './customer-test-context';
dotenv({ path: '.env.local', quiet: true });
describe.skipIf(process.env.CUEVO_REQUIRE_INTEGRATION !== '1')('native academic source bridge actual Auth API', () => {
  let context: CustomerContext;
  beforeAll(async () => { context = await createCustomerContext(); }, 60000);
  afterAll(async () => { await context?.close(); });
  it('retains existing numeric source identity and denied peer scope', async () => {
    const course = await customerCourse(context, 'Numeric source identity'); const result = await customerReleased(context, 'strong', course.courseId, 'Native zero source', 0);
    const response = await context.request('teacher', `/v1/results/${result.resultId}/source`); expect(response.statusCode).toBe(200); expect(response.json()).toMatchObject({ id: result.resultId, evidenceId: result.evidenceId, submissionId: result.submissionId, model: 'numeric', nativeResult: { type: 'numeric', score: 0, maxScore: 10, normalized: null } });
    expect((await context.request('strong', `/v1/results/${result.resultId}/source`)).statusCode).toBe(200); expect((await context.request('parent', `/v1/results/${result.resultId}/source`)).statusCode).toBe(200);
    expect((await context.request('observed', `/v1/results/${result.resultId}/source`)).statusCode).toBe(403); expect((await context.request('otherTeacher', `/v1/results/${result.resultId}/source`)).statusCode).toBe(403);
    expect((await context.client.query('select id,model,numeric_result_id,rubric_result_id from internal.academic_result_sources where school_id=$1 and id=$2', [context.school, result.resultId])).rows[0]).toMatchObject({ id: result.resultId, model: 'numeric', numeric_result_id: result.resultId, rubric_result_id: null });
    const enrollment=(await context.client.query("select effective_to from app.enrollments where school_id=$1 and class_id=$2 and student_actor_id='20000000-0000-4000-8000-000000000012'",[context.school,context.classId])).rows[0];
    try{await context.client.query("update app.enrollments set effective_to=clock_timestamp()-interval '1 minute'where school_id=$1 and class_id=$2 and student_actor_id='20000000-0000-4000-8000-000000000012'",[context.school,context.classId]);expect((await context.request('parent', `/v1/results/${result.resultId}/source`)).statusCode).toBe(403);}finally{await context.client.query("update app.enrollments set effective_to=$3 where school_id=$1 and class_id=$2 and student_actor_id='20000000-0000-4000-8000-000000000012'",[context.school,context.classId,enrollment.effective_to]);}
  });
  it('retains exact rubric criterion descriptors and rejects stale/parent-unapproved current sources', async () => {
    const course = await customerCourse(context, 'Rubric source identity');
    const rubric = await context.command('teacher', '/v1/rubrics', { courseId: course.courseId, title: 'Teacher checking rubric', version: 'teacher-v1', criteria: [{ key: 'check', title: 'Checking', levels: [{ key: 'shown', label: 'Demonstrated', description: 'Show one checking step.' }, { key: 'connected', label: 'Connected', description: 'Explain the connected checks.' }] }] });
    const assessment = await context.command('teacher', '/v1/assessments', { courseId: course.courseId, title: 'Rubric source task', instructions: 'Explain the checking step.', maxScore: 10 });
    await context.command('teacher', `/v1/assessments/${assessment.id}/rubric`, { rubricId: rubric.id, expectedPolicyVersion: 1 }); await context.command('teacher', `/v1/assessments/${assessment.id}/reference`, { referenceId: context.referenceId, expectedPolicyVersion: 2 });
    const submission = await context.command('observed', `/v1/assessments/${assessment.id}/submissions`, { content: 'Synthetic checking explanation.' });
    const markInput = { nativeResult: { type: 'rubric', rubricId: rubric.id, criteria: [{ criterionKey: 'check', levelKey: 'shown' }] }, feedback: 'Teacher reviewed the checking.', expectedPolicyVersion: 3, expectedRevision: 0, sourceEvidence: true };
    const marking = await context.command('teacher', `/v1/submissions/${submission.id}/results`, markInput); const result = await context.command('teacher', `/v1/results/${marking.id}/release`, { expectedRevision: 1, parentVisible: false });
    const response = await context.request('teacher', `/v1/results/${result.id}/source`); expect(response.statusCode).toBe(200); expect(response.json()).toMatchObject({ id: result.id, model: 'rubric', evidenceId: result.evidenceId, nativeResult: { type: 'rubric', normalized: null, criteria: [{ criterionKey: 'check', levelKey: 'shown', levelLabel: 'Demonstrated', levelDescription: 'Show one checking step.' }] } });
    expect(response.body).not.toContain('maxScore'); expect((await context.request('parent', `/v1/results/${result.id}/source`)).statusCode).toBe(403);
    const correctedMark = await context.command('teacher', `/v1/submissions/${submission.id}/results`, { ...markInput, expectedRevision: 1, nativeResult: { type: 'rubric', rubricId: rubric.id, criteria: [{ criterionKey: 'check', levelKey: 'connected' }] } }); const corrected = await context.command('teacher', `/v1/results/${correctedMark.id}/release`, { expectedRevision: 2, parentVisible: true });
    expect((await context.request('teacher', `/v1/results/${result.id}/source`)).statusCode).toBe(403); expect((await context.request('parent', `/v1/results/${corrected.id}/source`)).statusCode).toBe(200);
    expect((await context.client.query('select count(*)::integer count from internal.academic_result_sources where school_id=$1 and id=any($2::uuid[])', [context.school, [result.id, corrected.id]])).rows[0].count).toBe(2);
    const proposal=await context.command('teacher','/v1/recommendations',{baselineResultId:corrected.id,observation:'The current rubric records the demonstrated checking descriptor.',interpretation:'A teacher may review the native criterion evidence.',recommendation:'Review one checking example.',rationale:'Uses the current native rubric source without conversion.',uncertainty:'Criterion evidence does not prove cause or overall attainment.',activityTitle:'Teacher checking task',instructions:'Explain the checking step using the teacher example.'});
    expect(proposal).toMatchObject({baselineResultId:corrected.id,learnerId:'20000000-0000-4000-8000-000000000013',generationMode:'HUMAN'});
    const approved=await context.command('teacher',`/v1/recommendations/${proposal.id}/decision`,{decision:'APPROVE',reason:'Teacher reviewed the exact current criterion.',learnerNote:'Ask if the checking step is unclear.'});
    expect((await context.request('observed',`/v1/interventions/${approved.interventionId}/help`)).statusCode).toBe(200);
    await context.command('observed',`/v1/interventions/${approved.interventionId}/complete`,{reflection:'I explained a checking step.'});
    await context.drain();const state=await context.request('observed',`/v1/learners/20000000-0000-4000-8000-000000000013/state`);expect(state.statusCode).toBe(200);expect(state.json().support.items).toEqual(expect.arrayContaining([expect.objectContaining({id:approved.interventionId,status:'COMPLETED'})]));
  });
});
