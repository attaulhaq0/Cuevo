import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { createCustomerContext, customerCourse, customerReleased, customerActor, type CustomerContext } from './customer-test-context';
const enabled = process.env.CUEVO_REQUIRE_INTEGRATION === '1';
describe.skipIf(!enabled)('exact selected portfolio text work actual Auth/API', () => {
  let context: CustomerContext;
  beforeAll(async () => { context = await createCustomerContext(); }, 30000);
  afterAll(async () => { await context?.close(); });
  async function confirmReviewLearnerNames() {
    // Keep the global duplicate-name fixture; only these source-review cases need distinct school records.
    const confirmedNames = (await context.client.query<{ actor_id: string; display_name: string }>('update app.people set display_name=case when actor_id=$2 then $4 else $5 end where school_id=$1 and actor_id in($2,$3)and synthetic is true returning actor_id,display_name', [context.school, customerActor(12), customerActor(13), 'Lina Al-Kuwari', 'Omar Al-Kuwari'])).rows.sort((left, right) => left.actor_id.localeCompare(right.actor_id));
    expect(confirmedNames).toEqual([{ actor_id: customerActor(12), display_name: 'Lina Al-Kuwari' }, { actor_id: customerActor(13), display_name: 'Omar Al-Kuwari' }]);
    expect(new Set(confirmedNames.map(person => person.display_name)).size).toBe(2);
  }
  async function selected() {
    const course = await customerCourse(context, 'Selected text evidence'); const released = await customerReleased(context, 'strong', course.courseId, 'Explain selected source', 6);
    const item = await context.command('strong', '/v1/portfolio/items', { evidenceId: released.evidenceId, sourceModel: 'numeric', title: 'My selected explanation', reflection: 'What I learned from checking.' });
    return { ...released, courseId: course.courseId, itemId: item.id, revisionId: String(item.revisionId) };
  }
  it('shows the exact source only after explicit review and keeps parent revision separate', async () => {
    await confirmReviewLearnerNames();
    const source = await selected(); const path = `/v1/portfolio/items/${source.itemId}/revisions/${source.revisionId}/source-work`;
    const portfolio = await context.request('teacher', '/v1/portfolio/items?limit=100'); expect(portfolio.statusCode).toBe(200); expect(portfolio.json().items.find((item: { id: string }) => item.id === source.itemId)).toMatchObject({ id: source.itemId, revisionId: source.revisionId, learnerId: customerActor(12), identity: { status: 'READY', learnerName: 'Lina Al-Kuwari' } });
    expect((await context.request('parent', path)).statusCode).toBe(403);
    expect((await context.request('observed', path)).statusCode).toBe(403);
    expect((await context.request('coordinator', path)).statusCode).toBe(403);
    const teacher = await context.request('teacher', path); expect(teacher.statusCode).toBe(200); expect(teacher.json()).toMatchObject({ itemId: source.itemId, revisionId: source.revisionId, learnerId: customerActor(12), source: { kind: 'TEXT', submissionId: source.submissionId, submissionRevision: 1, content: 'Synthetic source explanation.' } });
    const review = { expectedRevision: 1, feedback: 'Reviewed the exact answer and reflection.', featured: false, parentVisible: true, confirmParentApproval: true };
    expect((await context.request('teacher', `/v1/portfolio/items/${source.itemId}/review`, review)).statusCode).toBe(409);
    await context.command('teacher', `/v1/portfolio/items/${source.itemId}/review`, { ...review, confirmSourceReview: true });
    expect((await context.request('parent', path)).json().source.submissionId).toBe(source.submissionId);
    const correction = await context.command('teacher', `/v1/submissions/${source.submissionId}/results`, { score: 7, feedback: 'Corrected academic mark, same submitted answer.', expectedPolicyVersion: 2, expectedRevision: 1, sourceEvidence: true });
    await context.command('teacher', `/v1/results/${correction.id}/release`, { expectedRevision: 2, parentVisible: true });
    // Approved portfolio evidence is historical and pinned; a correction does not rewrite its answer/result.
    expect((await context.request('parent', path)).json()).toMatchObject({ resultId: source.resultId, source: { submissionId: source.submissionId, content: 'Synthetic source explanation.' } });
    const newer = await context.command('strong', `/v1/portfolio/items/${source.itemId}/reflection`, { expectedRevision: 1, title: 'New private revision', reflection: 'Not reviewed for parent.' });
    expect((await context.request('parent', `/v1/portfolio/items/${source.itemId}/revisions/${newer.revisionId}/source-work`)).statusCode).toBe(403);
    expect((await context.request('parent', path)).statusCode).toBe(200);
    await context.command('teacher', `/v1/portfolio/items/${source.itemId}/parent-revoke`, { reason: 'School revoked sharing.' }); expect((await context.request('parent', path)).statusCode).toBe(403);
  }, 30000);
  it('rechecks exact current child source and rejects revision substitution without broad raw work access', async () => {
    await confirmReviewLearnerNames();
    const source = await selected(); const path = `/v1/portfolio/items/${source.itemId}/revisions/${source.revisionId}/source-work`;
    const portfolio = await context.request('teacher', '/v1/portfolio/items?limit=100'); expect(portfolio.statusCode).toBe(200); expect(portfolio.json().items.find((item: { id: string }) => item.id === source.itemId)).toMatchObject({ id: source.itemId, revisionId: source.revisionId, learnerId: customerActor(12), identity: { status: 'READY', learnerName: 'Lina Al-Kuwari' } });
    await context.command('teacher', `/v1/portfolio/items/${source.itemId}/review`, { expectedRevision: 1, feedback: 'Approved exact source.', featured: false, parentVisible: true, confirmParentApproval: true, confirmSourceReview: true });
    expect((await context.request('parent', `/v1/portfolio/items/${source.itemId}/revisions/${context.referenceId}/source-work`)).statusCode).toBe(403);
    await context.client.query("update app.parent_relationships set status='revoked'where school_id=$1 and parent_actor_id=$2 and student_actor_id=$3", [context.school, customerActor(72), customerActor(12)]);
    expect((await context.request('parent', path)).statusCode).toBe(403);
    expect((await context.request('parent', '/v1/submissions?limit=100')).statusCode).toBe(403);
    await context.client.query("update app.parent_relationships set status='active'where school_id=$1 and parent_actor_id=$2 and student_actor_id=$3", [context.school, customerActor(72), customerActor(12)]);
    await context.client.query("update app.enrollments set status='revoked'where school_id=$1 and class_id=$2 and student_actor_id=$3", [context.school, context.classId, customerActor(12)]);
    expect((await context.request('parent', path)).statusCode).toBe(403); expect((await context.request('teacher', path)).statusCode).toBe(403);
    await context.client.query("update app.enrollments set status='active'where school_id=$1 and class_id=$2 and student_actor_id=$3", [context.school, context.classId, customerActor(12)]);
    expect((await context.request('parent', path)).statusCode).toBe(200);
    const sibling = await selected();
    expect((await context.request('teacher', `/v1/portfolio/items/${source.itemId}/revisions/${sibling.revisionId}/source-work`)).statusCode).toBe(403);
  }, 30000);
  it('does not retrospectively treat an existing reflection approval as submitted-text approval', async () => {
    const source = await selected();
    // Owner-only historical fixture emulates a review written before source_review_confirmed existed.
    await context.client.query('insert into app.portfolio_reviews(school_id,item_id,revision_id,feedback,featured,parent_visible,reviewed_by)values($1,$2,$3,$4,false,true,$5)', [context.school, source.itemId, source.revisionId, 'Historical reflection approval only.', customerActor(4)]);
    await context.client.query('update app.portfolio_current set parent_revision_id=$3 where school_id=$1 and item_id=$2', [context.school, source.itemId, source.revisionId]);
    const parent = await context.request('parent', '/v1/portfolio/items?limit=100'); expect(parent.statusCode).toBe(200); expect(parent.json().items.find((item: { id: string }) => item.id === source.itemId)).toMatchObject({ sourceWorkApproved: false });
    expect((await context.request('parent', `/v1/portfolio/items/${source.itemId}/revisions/${source.revisionId}/source-work`)).statusCode).toBe(403);
    expect((await context.request('teacher', `/v1/portfolio/items/${source.itemId}/revisions/${source.revisionId}/source-work`)).statusCode).toBe(200);
  }, 30000);
});
