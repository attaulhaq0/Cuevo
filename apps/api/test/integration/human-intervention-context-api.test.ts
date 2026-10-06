import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createCustomerContext, customerActor, customerAssessment, customerCourse, customerProgramme, customerReleased, type CustomerContext } from './customer-test-context';

describe.skipIf(process.env.CUEVO_REQUIRE_INTEGRATION !== '1')('human labels from exact retained Intervention baseline', () => {
  let context: CustomerContext;
  beforeAll(async () => { context = await createCustomerContext(); }, 60000);
  afterAll(async () => { await context?.close(); });
  const assigned = async (learner: 'strong' | 'observed' | 'decline', courseId: string, title: string, referenceId = context.referenceId) => {
    const baseline = await customerReleased(context, learner, courseId, title, 0, referenceId);
    const proposal = await context.command('teacher', '/v1/recommendations', { baselineResultId: baseline.resultId, observation: 'Recorded source result.', interpretation: 'Teacher-selected checking.', recommendation: 'Explain a step.', rationale: 'The recorded source.', uncertainty: 'No causal claim.', activityTitle: 'Approved checking practice', instructions: 'Explain the checking step.' });
    const decision = await context.command('teacher', `/v1/recommendations/${proposal.id}/decision`, { decision: 'APPROVE', reason: 'Reviewed the current source.' });
    return { ...baseline, interventionId: String(decision.interventionId) };
  };
  it('projects assigned and completed source labels without follow-up, extra private fields or receipt changes', async () => {
    const course = await customerCourse(context, 'Mathematics source');
    const task = await assigned('strong', course.courseId, 'Explain one calculation');
    const names = (await context.client.query('select actor_id,display_name from app.people where school_id=$1 and actor_id=$2', [context.school, customerActor(12)])).rows;
    const student = await context.request('strong', `/v1/interventions/${task.interventionId}`);
    expect(student.statusCode).toBe(200);
    expect(student.json().context).toEqual({ interventionId: task.interventionId, baselineResultId: task.resultId, learnerId: customerActor(12), referenceId: context.referenceId, status: 'READY', labelBasis: 'CURRENT_REGISTERED_NAMES_AND_SOURCE_TASK', identityRequiresReview: false, learnerName: names[0]?.display_name, courseTitle: 'Mathematics source', className: 'Duplicate class — صف', yearGroupName: 'Synthetic group', academicYearName: 'Synthetic year' });
    const teacher = await context.request('teacher', `/v1/interventions/${task.interventionId}`);
    expect(teacher.statusCode).toBe(200); expect(teacher.json().context.status).toBe('REQUIRES_REVIEW'); expect(teacher.json().context.identityRequiresReview).toBe(true);
    const page = await context.request('strong', '/v1/interventions?limit=100');
    expect(page.statusCode).toBe(200); expect(page.json().items.find((item: { id: string }) => item.id === task.interventionId)?.context).toEqual(student.json().context);
    for (const key of ['recordedByName', 'email', 'content', 'nativeResult', 'unitTitle', 'followUpAssessmentTitle', 'peers']) expect(student.json().context).not.toHaveProperty(key);
    const completion = await context.command('strong', `/v1/interventions/${task.interventionId}/complete`, { reflection: 'I checked each step.' }, 'context-completion-original');
    expect(completion).not.toHaveProperty('context');
    const completed = await context.request('strong', `/v1/interventions/${task.interventionId}`);
    expect(completed.statusCode).toBe(200); expect(completed.json().status).toBe('COMPLETED'); expect(completed.json().context).toEqual(student.json().context);
    await context.client.query('SAVEPOINT intervention_context_changed_name');
    try {
      await context.client.query("update app.people set display_name='Lina Hassan'where school_id=$1 and actor_id=$2", [context.school, customerActor(12)]);
      const current = await context.request('strong', `/v1/interventions/${task.interventionId}`);
      expect(current.statusCode).toBe(200); expect(current.json().context.learnerName).toBe('Lina Hassan');
      expect(await context.command('strong', `/v1/interventions/${task.interventionId}/complete`, { reflection: 'I checked each step.' }, 'context-completion-original')).toEqual(completion);
    } finally { await context.client.query('ROLLBACK TO SAVEPOINT intervention_context_changed_name'); await context.client.query('RELEASE SAVEPOINT intervention_context_changed_name'); }
    const followUp = await customerAssessment(context, course.courseId, 'Later checking task');
    const reassessment = await context.command('teacher', `/v1/interventions/${task.interventionId}/reassessment`, { assessmentId: followUp }, 'context-reassessment-original');
    expect(reassessment).not.toHaveProperty('context');
    expect(await context.command('teacher', `/v1/interventions/${task.interventionId}/reassessment`, { assessmentId: followUp }, 'context-reassessment-original')).toEqual(reassessment);
    expect((await context.request('parent', `/v1/interventions/${task.interventionId}`)).statusCode).toBe(403);
    expect((await context.request('observed', `/v1/interventions/${task.interventionId}`)).statusCode).toBe(403);
    expect((await context.request('otherTeacher', `/v1/interventions/${task.interventionId}`)).statusCode).toBe(403);
    await context.client.query('SAVEPOINT intervention_context_revoked');
    try {
      await context.client.query("update app.enrollments set status='revoked'where school_id=$1 and student_actor_id=$2", [context.school, customerActor(12)]);
      expect((await context.request('strong', `/v1/interventions/${task.interventionId}`)).statusCode).toBe(403);
      expect((await context.request('teacher', `/v1/interventions/${task.interventionId}`)).statusCode).toBe(403);
      await context.client.query("select set_config('app.actor_id',$1,true),set_config('app.school_id',$2,true)", [customerActor(4), context.school]);
      await expect(context.client.query('select internal.read_intervention_context($1)', [task.interventionId])).rejects.toMatchObject({ code: '42501' });
    } finally { await context.client.query('ROLLBACK TO SAVEPOINT intervention_context_revoked'); await context.client.query('RELEASE SAVEPOINT intervention_context_revoked'); }
  }, 90000);
  it('retains review history after correction and returns unknown for missing source labels', async () => {
    const course = await customerCourse(context, 'Checking source');
    const task = await assigned('observed', course.courseId, 'Original checking task');
    await context.client.query('SAVEPOINT intervention_context_missing_name');
    try {
      await context.client.query("update app.people set display_name=' 'where school_id=$1 and actor_id=$2", [context.school, customerActor(13)]);
      const read = await context.request('observed', `/v1/interventions/${task.interventionId}`);
      expect(read.statusCode).toBe(200); expect(read.json().context.status).toBe('REQUIRES_REVIEW'); expect(read.json().context.learnerName).toBeNull();
    } finally { await context.client.query('ROLLBACK TO SAVEPOINT intervention_context_missing_name'); await context.client.query('RELEASE SAVEPOINT intervention_context_missing_name'); }
    const correction = await context.command('teacher', `/v1/submissions/${task.submissionId}/results`, { score: 2, feedback: 'Reviewed correction.', expectedPolicyVersion: 2, expectedRevision: 1, sourceEvidence: true });
    await context.command('teacher', `/v1/results/${correction.id}/release`, { expectedRevision: 2, parentVisible: true });
    const read = await context.request('observed', `/v1/interventions/${task.interventionId}`);
    expect(read.statusCode).toBe(200); expect(read.json().requiresReview).toBe(true); expect(read.json().context.baselineResultId).toBe(task.resultId); expect(read.json().context.courseTitle).toBe('Checking source');
    const denied = await context.request('observed', `/v1/interventions/${task.interventionId}/complete`, { reflection: 'Stale source cannot complete.' }, 'stale-practice-complete');
    expect(denied.statusCode).toBe(403);
  }, 90000);
  it('keeps three same-name learners tied to their authorized class and course and denies revoked programme sources', async () => {
    await context.client.query('SAVEPOINT intervention_context_three_names');
    try {
      await context.client.query("update app.people set display_name='Lina Hassan'where school_id=$1 and actor_id=any($2::uuid[])", [context.school, [customerActor(12), customerActor(13), customerActor(14)]]);
      await context.client.query("update app.enrollments set status='revoked'where school_id=$1 and student_actor_id=$2", [context.school, customerActor(14)]);
      await context.client.query("insert into app.enrollments(school_id,class_id,student_actor_id,effective_from)values($1,$2,$3,now()-interval '1 day')", [context.school, context.secondClassId, customerActor(14)]);
      await context.client.query("update app.classes set name=case when id=$2 then'Cedar'else'Willow'end where school_id=$1", [context.school, context.classId]);
      const math = await customerCourse(context, 'Mathematics');
      const science = await context.command('teacher', '/v1/courses', { title: 'Science', description: 'Synthetic source explanation.', classId: context.secondClassId, subjectId: context.subject });
      await context.command('teacher', `/v1/courses/${science.id}/publish`, {});
      const first = await assigned('strong', math.courseId, 'First source');
      const second = await assigned('observed', math.courseId, 'Second source');
      const third = await assigned('decline', science.id, 'Third source');
      for (const task of [first, second]) {
        const read = await context.request('teacher', `/v1/interventions/${task.interventionId}`);
        expect(read.statusCode).toBe(200); expect(read.json().context).toMatchObject({ learnerName: 'Lina Hassan', className: 'Cedar', courseTitle: 'Mathematics', status: 'REQUIRES_REVIEW', identityRequiresReview: true });
      }
      const read = await context.request('teacher', `/v1/interventions/${third.interventionId}`);
      expect(read.statusCode).toBe(200); expect(read.json().context).toMatchObject({ learnerId: customerActor(14), learnerName: 'Lina Hassan', className: 'Willow', courseTitle: 'Science', status: 'READY', identityRequiresReview: false });
      await context.client.query('SAVEPOINT intervention_context_duplicate_class_caption');
      try {
        await context.client.query("update app.classes set name='Cedar'where school_id=$1 and id=$2", [context.school, context.secondClassId]);
        const ambiguous = await context.request('teacher', `/v1/interventions/${third.interventionId}`);
        expect(ambiguous.statusCode).toBe(200); expect(ambiguous.json().context).toMatchObject({ status: 'REQUIRES_REVIEW', identityRequiresReview: true });
        const self = await context.request('decline', `/v1/interventions/${third.interventionId}`);
        expect(self.statusCode).toBe(200); expect(self.json().context.identityRequiresReview).toBe(false);
      } finally { await context.client.query('ROLLBACK TO SAVEPOINT intervention_context_duplicate_class_caption'); await context.client.query('RELEASE SAVEPOINT intervention_context_duplicate_class_caption'); }
      const programmeCourse = await context.command('teacher', '/v1/courses', { title: 'Programme checking', description: 'Synthetic programme source.', classId: context.secondClassId, subjectId: context.subject });
      const programme = await customerProgramme(context, programmeCourse.id, context.secondClassId, customerActor(14), 'Source checking programme');
      await context.command('teacher', `/v1/courses/${programmeCourse.id}/publish`, {});
      const linked = await assigned('decline', programmeCourse.id, 'Programme source', programme.referenceId);
      expect((await context.request('decline', `/v1/interventions/${linked.interventionId}`)).statusCode).toBe(200);
      await context.client.query("update app.programme_learners set status='revoked'where school_id=$1 and learner_id=$2", [context.school, customerActor(14)]);
      expect((await context.request('teacher', `/v1/interventions/${linked.interventionId}`)).statusCode).toBe(403);
      expect((await context.request('decline', `/v1/interventions/${linked.interventionId}`)).statusCode).toBe(403);
    } finally { await context.client.query('ROLLBACK TO SAVEPOINT intervention_context_three_names'); await context.client.query('RELEASE SAVEPOINT intervention_context_three_names'); }
  }, 90000);
  it('uses the native rubric baseline and keeps missing or unrelated immutable source context unavailable', async () => {
    const course = await customerCourse(context, 'Criterion source course');
    const rubric = await context.command('teacher', '/v1/rubrics', { courseId: course.courseId, title: 'Checking rubric', version: 'criterion-source-v1', criteria: [{ key: 'check', title: 'Checking', levels: [{ key: 'shown', label: 'Shown', description: 'Show the checking step.' }] }] });
    const assessment = await context.command('teacher', '/v1/assessments', { courseId: course.courseId, title: 'Explain a criterion', instructions: 'Explain the step.', maxScore: 10 });
    await context.command('teacher', `/v1/assessments/${assessment.id}/rubric`, { rubricId: rubric.id, expectedPolicyVersion: 1 });
    await context.command('teacher', `/v1/assessments/${assessment.id}/reference`, { referenceId: context.referenceId, expectedPolicyVersion: 2 });
    const submission = await context.command('observed', `/v1/assessments/${assessment.id}/submissions`, { content: 'I checked the step.' });
    const mark = await context.command('teacher', `/v1/submissions/${submission.id}/results`, { nativeResult: { type: 'rubric', rubricId: rubric.id, criteria: [{ criterionKey: 'check', levelKey: 'shown' }] }, feedback: 'Reviewed criterion.', expectedPolicyVersion: 3, expectedRevision: 0, sourceEvidence: true });
    const result = await context.command('teacher', `/v1/results/${mark.id}/release`, { expectedRevision: 1, parentVisible: true });
    const proposal = await context.command('teacher', '/v1/recommendations', { baselineResultId: result.id, observation: 'Recorded native criterion.', interpretation: 'Teacher reviewed the criterion.', recommendation: 'Check a step.', rationale: 'Exact criterion source.', uncertainty: 'No causal or scalar claim.', activityTitle: 'Approved criterion practice', instructions: 'Explain your check.' });
    const decision = await context.command('teacher', `/v1/recommendations/${proposal.id}/decision`, { decision: 'APPROVE', reason: 'Reviewed native source.' });
    const path = `/v1/interventions/${decision.interventionId}`;
    const read = await context.request('observed', path);
    expect(read.statusCode).toBe(200); expect(read.json().context).toMatchObject({ baselineResultId: result.id, learnerId: customerActor(13), courseTitle: 'Criterion source course', status: 'READY' });
    expect(read.json().context).not.toHaveProperty('score'); expect(read.json().context).not.toHaveProperty('maxScore');
    const other = await customerCourse(context, 'Unrelated allowed course');
    const revision = (await context.client.query("select id from app.learning_content_revisions where school_id=$1 and resource='course'and source_id=$2 limit 1", [context.school, other.courseId])).rows[0].id;
    await context.client.query('SAVEPOINT intervention_context_wrong_snapshot');
    try {
      await context.client.query("set local session_replication_role='replica'");
      await context.client.query('update app.learning_submission_context set course_revision_id=$3 where school_id=$1 and submission_id=$2', [context.school, submission.id, revision]);
      await context.client.query("set local session_replication_role='origin'");
      const unavailable = await context.request('observed', path);
      expect(unavailable.statusCode).toBe(200); expect(unavailable.json().context).toMatchObject({ courseTitle: null, status: 'REQUIRES_REVIEW' }); expect(unavailable.body).not.toContain('Unrelated allowed course');
    } finally { await context.client.query('ROLLBACK TO SAVEPOINT intervention_context_wrong_snapshot'); await context.client.query('RELEASE SAVEPOINT intervention_context_wrong_snapshot'); }
    await context.client.query('SAVEPOINT intervention_context_missing_reference');
    try {
      await context.client.query("set local session_replication_role='replica'");
      await context.client.query("update app.school_custom_references set status='DRAFT',approved_by=null,approved_at=null where school_id=$1 and id=$2", [context.school, context.referenceId]);
      await context.client.query("set local session_replication_role='origin'");
      const unavailable = await context.request('observed', path);
      expect(unavailable.statusCode).toBe(200); expect(unavailable.json().context).toMatchObject({ learnerName: null, courseTitle: null, status: 'REQUIRES_REVIEW' });
    } finally { await context.client.query('ROLLBACK TO SAVEPOINT intervention_context_missing_reference'); await context.client.query('RELEASE SAVEPOINT intervention_context_missing_reference'); }
  }, 90000);
});
