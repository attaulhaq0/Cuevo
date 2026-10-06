import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config as dotenv } from 'dotenv';
import { createCustomerContext, customerActor, customerCourse, customerReleased, type CustomerContext } from './customer-test-context';

dotenv({ path: '.env.local', quiet: true });
describe.skipIf(process.env.CUEVO_REQUIRE_INTEGRATION !== '1')('human context from exact authorized academic evidence', () => {
  let context: CustomerContext;
  beforeAll(async () => { context = await createCustomerContext(); }, 60000);
  afterAll(async () => { await context?.close(); });
  it('shows source task and recorder names without a directory and preserves retained parent scope', async () => {
    const course = await customerCourse(context, 'Checking an explanation');
    const result = await customerReleased(context, 'strong', course.courseId, 'Show a checking step', 0);
    const expectedNames = (await context.client.query('select actor_id,display_name from app.people where school_id=$1 and actor_id=any($2::uuid[])', [context.school, [customerActor(4), customerActor(12)]])).rows;
    const response = await context.request('strong', `/v1/evidence/${result.evidenceId}`);
    expect(response.statusCode).toBe(200);
    const evidence = response.json();
    expect(evidence.context).toMatchObject({ assessmentTitle: 'Show a checking step', courseTitle: 'Checking an explanation', className: 'Duplicate class — صف', yearGroupName: 'Synthetic group', academicYearName: 'Synthetic year', recordedByName: expectedNames.find(row => row.actor_id === customerActor(4))?.display_name, learnerName: expectedNames.find(row => row.actor_id === customerActor(12))?.display_name, submissionRevision: 1, labelBasis: 'CURRENT_REGISTERED_NAMES_AND_SOURCE_TASK' });
    // A learner cannot receive the existence of an inaccessible same-name peer.
    expect(evidence.context.status).toBe('READY');
    expect(evidence.context.identityRequiresReview).toBe(false);
    const teacherEvidence = await context.request('teacher', `/v1/evidence/${result.evidenceId}`);
    expect(teacherEvidence.json().context.status).toBe('REQUIRES_REVIEW');
    expect(teacherEvidence.json().context.identityRequiresReview).toBe(true);
    expect(evidence.context.submittedAt).toEqual(expect.any(String));
    expect(evidence.referenceVersion).toBe('customer-school-v1');
    expect(evidence.sourceObjectId).toBe(result.submissionId);
    expect(evidence.resultId).toBe(result.resultId);
    expect(evidence).not.toHaveProperty('content');
    expect(evidence.context).not.toHaveProperty('email');
    expect(evidence.context).not.toHaveProperty('actorId');
    expect(evidence.context).not.toHaveProperty('peers');
    expect((await context.request('observed', `/v1/evidence/${result.evidenceId}`)).statusCode).toBe(404);
    expect((await context.request('otherTeacher', `/v1/evidence/${result.evidenceId}`)).statusCode).toBe(404);
    expect((await context.request('parent', `/v1/evidence/${result.evidenceId}`)).statusCode).toBe(200);
    await context.client.query('SAVEPOINT retained_human_evidence');
    try {
      await context.client.query("update app.enrollments set status='revoked'where school_id=$1 and student_actor_id=$2", [context.school, customerActor(12)]);
      const retained = await context.request('parent', `/v1/evidence/${result.evidenceId}`);
      expect(retained.statusCode).toBe(200);
      expect(retained.json().context.assessmentTitle).toBe('Show a checking step');
      await context.client.query("update app.parent_relationships set status='revoked'where school_id=$1 and parent_actor_id=$2 and student_actor_id=$3", [context.school, customerActor(72), customerActor(12)]);
      expect((await context.request('parent', `/v1/evidence/${result.evidenceId}`)).statusCode).toBe(404);
    } finally { await context.client.query('ROLLBACK TO SAVEPOINT retained_human_evidence'); await context.client.query('RELEASE SAVEPOINT retained_human_evidence'); }
  }, 90000);
  it('marks missing recorder or mismatched saved course context for review and retains native rubric history', async () => {
    const course = await customerCourse(context, 'Native source context');
    const rubric = await context.command('teacher', '/v1/rubrics', { courseId: course.courseId, title: 'Checking criterion', version: 'school-reviewed-rubric', criteria: [{ key: 'check', title: 'Checking', levels: [{ key: 'shown', label: 'Shown', description: 'Show one checking step.' }] }] });
    const assessment = await context.command('teacher', '/v1/assessments', { courseId: course.courseId, title: 'Explain a source check', instructions: 'Explain the step.', maxScore: 10 });
    await context.command('teacher', `/v1/assessments/${assessment.id}/rubric`, { rubricId: rubric.id, expectedPolicyVersion: 1 });
    await context.command('teacher', `/v1/assessments/${assessment.id}/reference`, { referenceId: context.referenceId, expectedPolicyVersion: 2 });
    const submission = await context.command('observed', `/v1/assessments/${assessment.id}/submissions`, { content: 'My checking explanation.' });
    const mark = await context.command('teacher', `/v1/submissions/${submission.id}/results`, { nativeResult: { type: 'rubric', rubricId: rubric.id, criteria: [{ criterionKey: 'check', levelKey: 'shown' }] }, feedback: 'Reviewed the criterion.', expectedPolicyVersion: 3, expectedRevision: 0, sourceEvidence: true });
    const result = await context.command('teacher', `/v1/results/${mark.id}/release`, { expectedRevision: 1, parentVisible: true });
    const original = (await context.request('teacher', `/v1/evidence/${result.evidenceId}`)).json();
    expect(original.model).toBe('rubric'); expect(original.context.assessmentTitle).toBe('Explain a source check');
    expect(original).not.toHaveProperty('score'); expect(original).not.toHaveProperty('maxScore');
    await context.client.query('SAVEPOINT missing_recorder_context');
    try {
      await context.client.query('delete from app.people where school_id=$1 and actor_id=$2', [context.school, customerActor(4)]);
      const read = await context.request('observed', `/v1/evidence/${result.evidenceId}`);
      expect(read.statusCode).toBe(200); expect(read.json().context.recordedByName).toBeNull(); expect(read.json().context.status).toBe('REQUIRES_REVIEW');
    } finally { await context.client.query('ROLLBACK TO SAVEPOINT missing_recorder_context'); await context.client.query('RELEASE SAVEPOINT missing_recorder_context'); }
    const other = await customerCourse(context, 'Other permitted course');
    const otherRevision = (await context.client.query("select id from app.learning_content_revisions where school_id=$1 and resource='course'and source_id=$2 limit 1", [context.school, other.courseId])).rows[0].id;
    await context.client.query('SAVEPOINT wrong_saved_course_context');
    try {
      // Corrupt only this rollback fixture's immutable snapshot; restore ordinary
      // triggers before either authorization or context projection runs.
      await context.client.query("set local session_replication_role='replica'");
      expect((await context.client.query('update app.learning_submission_context set course_revision_id=$3 where school_id=$1 and submission_id=$2', [context.school, submission.id, otherRevision])).rowCount).toBe(1);
      await context.client.query("set local session_replication_role='origin'");
      const read = await context.request('observed', `/v1/evidence/${result.evidenceId}`);
      expect(read.statusCode).toBe(200); expect(read.json().context.courseTitle).toBeNull(); expect(read.json().context.status).toBe('REQUIRES_REVIEW');
      expect(read.body).not.toContain('Other permitted course');
    } finally { await context.client.query('ROLLBACK TO SAVEPOINT wrong_saved_course_context'); await context.client.query('RELEASE SAVEPOINT wrong_saved_course_context'); }
    const correctedMark = await context.command('teacher', `/v1/submissions/${submission.id}/results`, { nativeResult: { type: 'rubric', rubricId: rubric.id, criteria: [{ criterionKey: 'check', levelKey: 'shown' }] }, feedback: 'New reviewed correction.', expectedPolicyVersion: 3, expectedRevision: 1, sourceEvidence: true });
    await context.command('teacher', `/v1/results/${correctedMark.id}/release`, { expectedRevision: 2, parentVisible: true });
    const retained = await context.request('parent', `/v1/evidence/${result.evidenceId}`);
    expect(retained.statusCode).toBe(200); expect(retained.json().resultId).toBe(result.id); expect(retained.json().context.assessmentTitle).toBe(original.context.assessmentTitle);
  }, 90000);
});
