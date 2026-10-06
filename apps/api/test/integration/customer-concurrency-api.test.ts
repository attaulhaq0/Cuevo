import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config as dotenv } from 'dotenv';
import { randomUUID } from 'node:crypto';
import { createCustomerContext, customerActor, customerAssessment, customerCourse, customerReleased, type CustomerContext } from './customer-test-context';
import { prepareSyntheticWorkerWindow } from './customer-worker-window';

dotenv({ path: '.env.local', quiet: true });
const enabled = process.env.CUEVO_REQUIRE_INTEGRATION === '1';
describe.skipIf(!enabled)('actual committed customer races with isolated tenant cleanup', () => {
  let context: CustomerContext;
  beforeAll(async () => { context = await createCustomerContext({ committed: true }); }, 60_000);
  afterAll(async () => { await context?.close(); });
  it('two concurrent marks choose one revision and concurrent identical releases create one source, audit and outbox', async () => {
    const course = await customerCourse(context, 'Concurrent teachers'); const assessmentId = await customerAssessment(context, course.courseId, 'Concurrent marking source'); const submission = await context.command('strong', `/v1/assessments/${assessmentId}/submissions`, { content: 'Immutable concurrent source.' });
    await context.client.query("insert into app.teacher_assignments(school_id,class_id,subject_id,teacher_actor_id,effective_from)values($1,$2,$3,$4,now()-interval '1 day')", [context.school, context.classId, context.subject, customerActor(5)]);
    // Author ownership is intentional. An assigned second teacher cannot grade this other teacher's course.
    const otherTeacher = await context.request('otherTeacher', `/v1/submissions/${submission.id}/results`, { score: 4, feedback: 'Foreign course marking', expectedPolicyVersion: 2, expectedRevision: 0, sourceEvidence: true }); expect(otherTeacher.statusCode).toBe(403);
    const markingBody = { score: 4, feedback: 'Concurrent human mark.', expectedPolicyVersion: 2, expectedRevision: 0, sourceEvidence: true };
    const marks = await Promise.all([context.request('teacher', `/v1/submissions/${submission.id}/results`, markingBody), context.request('teacher', `/v1/submissions/${submission.id}/results`, { ...markingBody, score: 5 })]);
    expect(marks.map(item => item.statusCode).sort()).toEqual([200, 409]); const mark = marks.find(item => item.statusCode === 200)!.json() as { id: string; revision: number };
    const releaseKey = randomUUID(); const releases = await Promise.all([context.request('teacher', `/v1/results/${mark.id}/release`, { expectedRevision: 1, parentVisible: true }, releaseKey), context.request('teacher', `/v1/results/${mark.id}/release`, { expectedRevision: 1, parentVisible: true }, releaseKey)]);
    expect(releases.map(item => item.statusCode)).toEqual([200, 200]); expect(releases[0].json()).toEqual(releases[1].json()); const result = releases[0].json() as { id: string; evidenceId: string };
    expect((await context.client.query('select count(*)::integer count from app.result_revisions where school_id=$1 and marking_id=$2', [context.school, mark.id])).rows[0].count).toBe(1);
    expect((await context.client.query("select count(*)::integer count from internal.audit_events where school_id=$1 and entity_id=$2 and action='result.release'", [context.school, result.id])).rows[0].count).toBe(1);
    expect((await context.client.query("select count(*)::integer count from internal.outbox_events where school_id=$1 and entity_id=$2 and type='result.released'", [context.school, result.id])).rows[0].count).toBe(1);
  }, 30_000);
  it('two simultaneous approvals produce one decision and intervention; conflicting decision cannot overwrite it', async () => {
    const course = await customerCourse(context, 'Concurrent approval'); const result = await customerReleased(context, 'observed', course.courseId, 'Approval baseline', 3);
    const proposal = await context.command('teacher', '/v1/recommendations', { baselineResultId: result.resultId, observation: 'Observed synthetic 3/10', interpretation: 'Teacher-selected support, no inferred cause.', recommendation: 'Try the school example.', rationale: 'Cited native result.', uncertainty: 'Single result, no causal claim.', activityTitle: 'School practice', instructions: 'Explain then check.' });
    const body = { decision: 'APPROVE', reason: 'Same teacher-reviewed decision.' }; const outcomes = await Promise.all([context.request('teacher', `/v1/recommendations/${proposal.id}/decision`, body), context.request('teacher', `/v1/recommendations/${proposal.id}/decision`, body)]);
    expect(outcomes.map(item => item.statusCode)).toEqual([200, 200]); expect(outcomes[0].json().interventionId).toBe(outcomes[1].json().interventionId);
    expect((await context.client.query('select count(*)::integer count from app.human_decisions where school_id=$1 and recommendation_id=$2', [context.school, proposal.id])).rows[0].count).toBe(1);
    expect((await context.client.query('select count(*)::integer count from app.interventions where school_id=$1 and recommendation_id=$2', [context.school, proposal.id])).rows[0].count).toBe(1);
    const reject = await context.request('teacher', `/v1/recommendations/${proposal.id}/decision`, { decision: 'REJECT', reason: 'Cannot rewrite the accepted source.' }); expect(reject.statusCode).toBe(409);
  }, 30_000);
  it('parent concurrent read never receives the new unreviewed reflection, and duplicate notifications read once', async () => {
    const course = await customerCourse(context, 'Concurrent parent portfolio'); const result = await customerReleased(context, 'decline', course.courseId, 'Parent portfolio source', 6); const item = await context.command('decline', '/v1/portfolio/items', { evidenceId: result.evidenceId, sourceModel: 'numeric', title: 'Approved selection', reflection: 'Approved original reflection.' });
    await context.command('teacher', `/v1/portfolio/items/${item.id}/review`, { expectedRevision: 1, feedback: 'Exact revision approved.', featured: false, parentVisible: true, confirmParentApproval: true, confirmSourceReview: true });
    const [read, edited] = await Promise.all([context.request('parent', `/v1/portfolio/items?limit=100&learnerId=${customerActor(14)}`), context.request('decline', `/v1/portfolio/items/${item.id}/reflection`, { expectedRevision: 1, title: 'Unreviewed replacement', reflection: 'PRIVATE NEW REFLECTION' })]);
    expect(read.statusCode).toBe(200); expect(edited.statusCode).toBe(200); expect(read.body).not.toContain('PRIVATE NEW REFLECTION');
    const after = await context.request('parent', `/v1/portfolio/items?limit=100&learnerId=${customerActor(14)}`); expect(after.json().items.find((row: { id: string }) => row.id === item.id).reflection).toBe('Approved original reflection.');
    const notice = await context.command('teacher', '/v1/community/announcements', { classId: context.classId, title: 'Concurrent approved notification', body: 'Synthetic school notice.', parentVisible: true }); const key = randomUUID();
    const receipts = await Promise.all([context.request('parent', `/v1/community/notifications/${notice.id}/read`, {}, key), context.request('parent', `/v1/community/notifications/${notice.id}/read`, {}, key)]); expect(receipts.map(row => row.statusCode)).toEqual([200, 200]); expect(receipts[0].json()).toEqual(receipts[1].json());
    expect((await context.client.query('select count(*)::integer count from app.community_announcement_revision_reads where school_id=$1 and announcement_id=$2 and actor_id=$3', [context.school, notice.id, customerActor(72)])).rows[0].count).toBe(1);
  }, 30_000);
  it('two restricted workers cannot own one lease and stale acknowledgments cannot commit after expiry', async () => {
    await context.drain();
    await prepareSyntheticWorkerWindow(context.client, process.env.WORKER_DATABASE_URL);
    expect((await context.client.query("select count(*)::integer count from internal.outbox_events where state in('PENDING','PROCESSING')")).rows[0].count, 'Exclusive worker test requires no foreign queue work.').toBe(0);
    const id = randomUUID(); await context.client.query("insert into internal.outbox_events(school_id,id,actor_id,type,entity_type,entity_id,version,metadata,deduplication_key)values($1,$2::uuid,$3,'customer.lease','customer',gen_random_uuid(),1,'{}',$2::text)", [context.school, id, customerActor(1)]);
    const { Pool } = await import('pg'); const url = new URL(process.env.WORKER_DATABASE_URL!); if (url.port !== '56322' || !['127.0.0.1', 'localhost'].includes(url.hostname) || url.username !== 'cuevo_worker') throw Error('Restricted local worker required.'); const workers = new Pool({ connectionString: url.toString(), max: 2 });
    try {
      const batches = await Promise.all([workers.query('select *from internal.claim_outbox(1,5)'), workers.query('select *from internal.claim_outbox(1,5)')]); const claims = batches.flatMap(batch => batch.rows); expect(claims).toHaveLength(1); expect(claims[0].id).toBe(id);
      await context.client.query("update internal.outbox_events set lease_until=clock_timestamp()-interval '1 second'where school_id=$1 and id=$2", [context.school, id]); const stale = await workers.query('select internal.complete_outbox($1,$2)ack', [id, claims[0].lease_token]); expect(stale.rows[0].ack).toBe(false);
      const reclaimed = (await workers.query('select *from internal.claim_outbox(1,5)')).rows[0]; expect(reclaimed?.id).toBe(id); expect(reclaimed.lease_token).not.toBe(claims[0].lease_token); expect((await workers.query('select internal.complete_outbox($1,$2)ack', [id, reclaimed.lease_token])).rows[0].ack).toBe(true);
    } finally { await workers.end(); }
  }, 30_000);
});
