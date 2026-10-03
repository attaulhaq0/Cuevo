import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config as dotenv } from 'dotenv';
import { learnerStateSchema } from '@cuevo/contracts';
import { createCustomerContext, customerActor, customerAssessment, customerCourse, customerProgramme, customerReleased, type CustomerContext, type CustomerRole } from './customer-test-context';

dotenv({ path: '.env.local', quiet: true });
const enabled = process.env.CUEVO_REQUIRE_INTEGRATION === '1';
describe.skipIf(!enabled)('independent twelve-pattern longitudinal customer acceptance', () => {
  let context: CustomerContext;
  beforeAll(async () => { context = await createCustomerContext(); }, 60_000);
  afterAll(async () => { await context?.close(); });
  const state = async (role: CustomerRole, actor: number) => { const response = await context.request(role, `/v1/learners/${customerActor(actor)}/state`); expect(response.statusCode).toBe(200); return learnerStateSchema.parse(response.json()); };
  const proposal = async (resultId: string) => { await context.drain(); const row = await context.command('teacher', '/v1/intelligence/analyze', { baselineResultId: resultId }); expect(row).toMatchObject({ origin: 'AI_GENERATED', generationMode: 'FIXTURE', status: 'AWAITING_HUMAN', baselineResultId: resultId }); expect(row.evidenceIds).toHaveLength(1); expect(row.uncertainty).toMatch(/single|one result|cause|trait/i); return row; };
  const loop = async (role: CustomerRole, actor: number, before: number, after: number, expected: string) => {
    const course = await customerCourse(context, `Synthetic ${role} improvement loop`);
    const baseline = await customerReleased(context, role, course.courseId, 'Baseline source', before); const generated = await proposal(baseline.resultId);
    const denied = await context.request('parent', `/v1/recommendations/${generated.id}/decision`, { decision: 'APPROVE', reason: 'Parent bypass' }); expect(denied.statusCode).toBe(403);
    const decision = await context.command('teacher', `/v1/recommendations/${generated.id}/decision`, { decision: 'APPROVE', reason: 'Human reviewed synthetic evidence and learning option.' });
    const intervention = String(decision.interventionId); expect(intervention).not.toBe('undefined');
    expect((await context.request('strong', `/v1/interventions/${intervention}/complete`, {})).statusCode).toBe(role === 'strong' ? 200 : 403);
    if (role !== 'strong') await context.command(role, `/v1/interventions/${intervention}/complete`, { reflection: 'Synthetic completed practice source.' });
    const followup = await customerReleased(context, role, course.courseId, 'Later follow-up source', after);
    await context.command('teacher', `/v1/interventions/${intervention}/reassessment`, { assessmentId: followup.assessmentId });
    const measured = await context.command('teacher', `/v1/interventions/${intervention}/measure`, { followUpResultId: followup.resultId, minimumChange: 1 });
    expect(measured).toMatchObject({ status: expected, difference: after - before, baseline: { score: before, maxScore: 10 }, followUp: { score: after, maxScore: 10 }, limitation: 'OBSERVED_CHANGE_NOT_CAUSAL_PROOF', baselineResultId: baseline.resultId, followUpResultId: followup.resultId });
    await context.drain(); const current = await state(role, actor); expect(current.impact.outcomes.some(item => item.id === measured.id)).toBe(true);
    expect(current.academic.every(item => item.nativeResult.normalized === null)).toBe(true); return { current, baseline, followup, generated, intervention, measured };
  };

  it('1 strong result and weak recorded practice remain independent, with teacher rejection producing no practice', async () => {
    const course = await customerCourse(context, 'Strong native result, no recorded practice'); const result = await customerReleased(context, 'strong', course.courseId, 'Strong source', 9); const generated = await proposal(result.resultId);
    const decision = await context.command('teacher', `/v1/recommendations/${generated.id}/decision`, { decision: 'REJECT', reason: 'Teacher selects a different supported next action.' }); expect(decision.interventionId).toBeNull();
    const current = await state('strong', 12); expect(current.academic).toEqual(expect.arrayContaining([expect.objectContaining({ resultId: result.resultId, nativeResult: expect.objectContaining({ score: 9, maxScore: 10 }) })]));
    expect(current.development.practice.count).toBe(0); expect(current.support.items).toEqual([]); expect(current.impact.status).toBe('unmeasured');
    expect(current).not.toHaveProperty('effortScore'); expect(current).not.toHaveProperty('intelligenceScore');
  }, 30_000);
  it('2 weak result and multiple observed practice/reflection sources never become an effort or ability score', async () => {
    const course = await customerCourse(context, 'Weak result with observed actions');
    for (let index = 0; index < 4; index++) { const action = await context.command('teacher', `/v1/lessons/${course.lessonId}/activities`, { title: `Practice ${index}`, kind: 'practice', instructions: 'School-authored practice.', sequence: index + 2 }); await context.command('observed', `/v1/activities/${action.id}/complete`, {}); }
    for (let index = 0; index < 2; index++) { const action = await context.command('teacher', `/v1/lessons/${course.lessonId}/activities`, { title: `Reflection ${index}`, kind: 'reflection', instructions: 'Reflect on the source work.', sequence: index + 6 }); await context.command('observed', `/v1/activities/${action.id}/complete`, { reflection: 'Recorded reflection; no inferred trait.' }); }
    const result = await customerReleased(context, 'observed', course.courseId, 'Weak native source', 2); const generated = await proposal(result.resultId);
    const current = await state('observed', 13); expect(current.development.practice.count).toBe(4); expect(current.development.reflection.count).toBe(2); expect(current.academic[0].nativeResult).toMatchObject({ score: 2, maxScore: 10 });
    expect(String(generated.interpretation)).not.toMatch(/intelligent|lazy|motivated|personality/i); expect(current.impact.status).toBe('unmeasured');
  }, 30_000);
  it('3 sudden decline uses two compatible native sources and an approved policy, without inferred cause', async () => {
    const course = await customerCourse(context, 'Decline sources'); const first = await customerReleased(context, 'decline', course.courseId, 'Earlier source', 8); const second = await customerReleased(context, 'decline', course.courseId, 'Later source', 3); await context.drain();
    await context.command('teacher', `/v1/learners/${customerActor(14)}/attention-refresh`, { expectedPolicyVersion: 1 });
    const response = await context.request('teacher', `/v1/attention-signals?learnerId=${customerActor(14)}&limit=100`); expect(response.statusCode).toBe(200);
    const signal = response.json().items.find((item: { type: string }) => item.type === 'native_result_decline');
    expect(signal).toMatchObject({ baselineResultId: first.resultId, followUpResultId: second.resultId, difference: -5, minimumDecline: 3, uncertainty: 'OBSERVED_CHANGE_NOT_CAUSE' });
    await proposal(second.resultId); expect((await state('decline', 14)).academic).toHaveLength(2);
  }, 30_000);
  it('4 missing submissions are counted from due assignments and never produce zero grades or a fabricated analysis baseline', async () => {
    const course = await customerCourse(context, 'Missing work'); const due = new Date(Date.now() - 60_000).toISOString();
    const assessments = [await customerAssessment(context, course.courseId, 'Missing source one', due), await customerAssessment(context, course.courseId, 'Missing source two', due)]; await context.drain();
    await context.command('teacher', `/v1/learners/${customerActor(15)}/attention-refresh`, { expectedPolicyVersion: 1 });
    const response = await context.request('teacher', `/v1/attention-signals?learnerId=${customerActor(15)}&limit=100`); expect(response.statusCode).toBe(200); const signal = response.json().items.find((item: { type: string }) => item.type === 'missing_due_work'); expect(signal.count).toBe(2); expect(signal.missingAssessments.map((item: { id: string }) => item.id).sort()).toEqual(assessments.sort());
    const current = await state('missing', 15); expect(current.academic).toEqual([]); expect(current.impact.status).toBe('unmeasured');
    expect((await context.request('teacher', '/v1/intelligence/analyze', { baselineResultId: randomMissingId() })).statusCode).toBe(403);
  }, 30_000);
  it('5 repeated incomplete work has human returns and immutable revisions without inferred attainment', async () => {
    const course = await customerCourse(context, 'Repeated incomplete work'); const assessmentId = await customerAssessment(context, course.courseId, 'Teacher requests checking'); let submission = await context.command('incomplete', `/v1/assessments/${assessmentId}/submissions`, { content: 'Synthetic incomplete source.' });
    for (let revision = 1; revision <= 2; revision++) { const returned = await context.command('teacher', `/v1/submissions/${submission.id}/return`, { feedback: `Teacher asks for checking step ${revision}.`, expectedRevision: revision }); submission = await context.command('incomplete', `/v1/submissions/${submission.id}/resubmit`, { returnId: returned.id, expectedRevision: revision, content: `Immutable revision ${revision + 1}, still awaiting teacher judgment.` }); }
    await context.drain(); const current = await state('incomplete', 16); expect(current.development.revision.count).toBe(2); expect(current.academic).toEqual([]); expect(current).not.toHaveProperty('attainmentScore');
    const history = await context.request('incomplete', `/v1/submissions/${submission.id}/history?limit=100`); expect(history.statusCode).toBe(200); expect(history.json().items.map((item: { revision: number }) => item.revision).sort()).toEqual([1, 2, 3]);
    expect((await context.request('parent', `/v1/submissions/${submission.id}/history`)).statusCode).toBe(403);
  }, 30_000);
  it('6 improvement closes the real approval, completion, reassessment and native measured-outcome loop', async () => { await loop('improved', 17, 3, 7, 'improved'); }, 30_000);
  it('7 unchanged native follow-up remains no meaningful change rather than successful intervention', async () => { await loop('unchanged', 18, 3, 3, 'no_meaningful_change'); }, 30_000);
  it('8 lower native follow-up retains the negative difference and inconclusive non-causal outcome', async () => { const result = await loop('inconclusive', 19, 6, 2, 'inconclusive'); expect(result.measured.reason).toBe('FOLLOW_UP_LOWER'); }, 30_000);
  it('9 strong performance followed by no recent recorded action does not infer motivation or disengagement as a trait', async () => {
    const course = await customerCourse(context, 'Earlier performance and recorded inactivity'); const result = await customerReleased(context, 'disengaged', course.courseId, 'Strong earlier result', 9); const completion = await context.command('disengaged', `/v1/activities/${course.practiceId}/complete`, {}); await context.drain();
    // Time moves only the owned synthetic completion and matching immutable observation/event fixture.
    await context.client.query("set local session_replication_role='replica'"); const older = new Date(Date.now() - 20 * 86400000).toISOString(); await context.client.query('update app.activity_completions set completed_at=$2 where school_id=$1 and id=$3', [context.school, older, completion.id]); await context.client.query('update app.habit_observations set occurred_at=$2 where school_id=$1 and source_object_id=$3', [context.school, older, completion.id]); await context.client.query("set local session_replication_role='origin'");
    const current = await state('disengaged', 20); expect(current.academic.some(item => item.resultId === result.resultId)).toBe(true); expect(current.development.practice.count).toBe(0); expect(Date.parse(current.engagement.lastCompletedAt!)).toBe(Date.parse(older)); expect(current).not.toHaveProperty('motivation'); expect(current).not.toHaveProperty('disengagementTrait');
  }, 30_000);
  it('10 new learner with no history and no guardian remains unknown and rejects unrelated approved views', async () => {
    const current = await state('newcomer', 21); expect(current.status).toBe('UNKNOWN'); expect(current.academic).toEqual([]); expect(current.development.practice.count).toBeNull(); expect(current.impact.status).toBe('unmeasured');
    expect((await context.request('parent', `/v1/learners/${customerActor(21)}/state`)).statusCode).toBe(403);
    expect((await context.request('teacher', '/v1/intelligence/analyze', { baselineResultId: randomMissingId() })).statusCode).toBe(403);
  });
  it('11 class transfer removes old source authority and retains new class native context without mixing programmes', async () => {
    const oldCourse = await customerCourse(context, 'Before transfer'); const oldProgramme = await customerProgramme(context, oldCourse.courseId, context.classId, customerActor(22), 'Before transfer programme'); const oldResult = await customerReleased(context, 'transferred', oldCourse.courseId, 'Before transfer source', 6, oldProgramme.referenceId); await context.drain();
    await context.command('admin', '/v1/curriculum/learners', { programmeId: oldProgramme.programmeId, learnerId: customerActor(22), status: 'revoked', confirmAccessChange: true });
    await context.client.query("update app.enrollments set status='revoked'where school_id=$1 and class_id=$2 and student_actor_id=$3", [context.school, context.classId, customerActor(22)]); await context.client.query("insert into app.enrollments(school_id,class_id,student_actor_id,effective_from)values($1,$2,$3,now()-interval '1 second')", [context.school, context.secondClassId, customerActor(22)]);
    const newCourse = await customerCourse(context, 'After transfer', context.secondClassId); const newProgramme = await customerProgramme(context, newCourse.courseId, context.secondClassId, customerActor(22), 'After transfer programme'); const newResult = await customerReleased(context, 'transferred', newCourse.courseId, 'After transfer source', 5, newProgramme.referenceId); await context.drain();
    const current = await state('transferred', 22); expect(current.academic.some(item => item.resultId === oldResult.resultId)).toBe(false); expect(current.academic.some(item => item.resultId === newResult.resultId)).toBe(true);
    expect((await context.request('transferred', `/v1/courses/${oldCourse.courseId}`)).statusCode).toBe(404); expect((await context.request('transferred', `/v1/evidence/${oldResult.evidenceId}`)).statusCode).toBe(404);
  }, 30_000);
  it('12 partial evidence and missing mapping cannot produce released results or analysis authority', async () => {
    const course = await customerCourse(context, 'Partial source coverage'); const assessment = await context.command('teacher', '/v1/assessments', { courseId: course.courseId, title: 'Unmapped synthetic source', instructions: 'Awaiting source mapping.', maxScore: 10 }); const submission = await context.command('partial', `/v1/assessments/${assessment.id}/submissions`, { content: 'Source awaiting an approved mapping.' });
    const mark = await context.request('teacher', `/v1/submissions/${submission.id}/results`, { score: 0, feedback: 'Cannot become a released zero.', expectedPolicyVersion: 1, expectedRevision: 0, sourceEvidence: true }); expect(mark.statusCode).toBe(409); expect(mark.json().code).toBe('ACADEMIC_REFERENCE_REQUIRED'); await context.drain();
    const current = await state('partial', 23); expect(current.academic).toEqual([]); expect(current.impact.outcomes).toEqual([]); expect((await context.request('teacher', '/v1/intelligence/analyze', { baselineResultId: randomMissingId() })).statusCode).toBe(403);
    const report = await context.request('partial', `/v1/learners/${customerActor(23)}/academic-report?limit=25`); expect(report.statusCode).toBe(200); expect(report.json()).toMatchObject({ coverage: 'NOT_ESTABLISHED', items: [] });
  }, 30_000);
});
function randomMissingId() { return 'ffffffff-ffff-4fff-8fff-ffffffffffff'; }
