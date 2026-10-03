import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { config as dotenv } from 'dotenv';
import { insightContextSchema, type InsightContext } from '@cuevo/contracts';
import { createCustomerContext, customerActor, customerCourse, customerReleased, type CustomerContext, type JsonRow } from './customer-test-context';
import { CooperativeFixtureScope } from './cooperative-fixture-scope';
import { cooperativeCustomerContext } from './cooperative-customer-context';
import { withFixtureCleanup } from './fixture-cleanup';

dotenv({ path: '.env.local', quiet: true });
type Proposal = { id: string; runId: string | null };
type PageRow = Record<string, unknown> & { id: string };
// Public page fields read independently from the authoritative stored records.
const projection = `jsonb_build_object('id',r.id,'learnerId',r.learner_id,'referenceId',r.reference_id,'baselineResultId',r.baseline_result_id,'origin',r.origin,'generationMode',r.generation_mode,'intelligenceRunId',r.intelligence_run_id,'observation',r.observation,'evidenceIds',r.evidence_ids,'interpretation',r.interpretation,'recommendation',r.recommendation,'rationale',r.rationale,'uncertainty',r.uncertainty,'activityTitle',r.activity_title,'instructions',r.instructions,'status',r.status,'createdAt',r.created_at,'selectedActivityId',r.selected_activity_id,'analysis',r.analysis,'promptDigest',r.prompt_digest)`;

describe.skipIf(process.env.CUEVO_REQUIRE_INTEGRATION !== '1')('current recommendation page mixed saved source parity', () => {
  let owner: CustomerContext | undefined;
  let context: CustomerContext;
  let scope: CooperativeFixtureScope | undefined;
  beforeEach(async () => { owner = await createCustomerContext(); context = owner; }, 60000);
  afterEach(async () => {
    await withFixtureCleanup(async () => { await scope?.cancelAndWait(); }, [
      () => owner?.close(),
      () => { owner = undefined; scope = undefined; },
    ]);
  });
  function journey(work: () => Promise<void>) {
    scope = new CooperativeFixtureScope(60000);
    context = cooperativeCustomerContext(owner!, scope);
    return scope.run(work);
  }
  async function teacherRead<T>(work: () => Promise<T>) {
    await context.client.query('SAVEPOINT mixed_source_read');
    try {
      await context.client.query('set local role cuevo_api');
      await context.client.query("set local statement_timeout='5s'");
      await context.client.query("select set_config('app.actor_id',$1,true),set_config('app.school_id',$2,true)", [customerActor(4), context.school]);
      return await work();
    } finally {
      await withFixtureCleanup(() => owner!.client.query('ROLLBACK TO SAVEPOINT mixed_source_read'), [
        () => owner!.client.query('RELEASE SAVEPOINT mixed_source_read'),
      ]);
    }
  }
  async function allowed(proposal: Proposal, expected: boolean, label: string) {
    const actual = await teacherRead(async () => (await context.client.query('select internal.recommendation_source_allowed($1,$2)as allowed', [context.school, proposal.id])).rows[0]?.allowed);
    expect(actual, `${label}: unchanged canonical source verifier`).toBe(expected);
  }
  async function snapshots(proposals: Proposal[]) {
    const rows = (await context.client.query(`select ${projection}as item from app.recommendations r where r.school_id=$1 and r.id=any($2::uuid[])order by r.id`, [context.school, proposals.map(row => row.id)])).rows.map(row => row.item as PageRow);
    expect(rows.map(row => row.id)).toEqual(proposals.map(row => row.id).sort());
    return new Map(rows.map(row => [row.id, row]));
  }
  async function pageEquals(saved: Map<string, PageRow>, expected: Proposal[], label: string) {
    const response = await context.request('teacher', '/v1/recommendations?limit=100');
    expect(response.statusCode, `${label}: current page ${response.statusCode}`).toBe(200);
    const page = response.json() as { items: PageRow[]; nextCursor: string | null };
    expect(page.items, `${label}: exact unaffected proposal payloads`).toEqual(expected.map(row => saved.get(row.id)!).sort((a, b) => a.id.localeCompare(b.id)));
    expect(page.nextCursor).toBeNull();
  }
  async function analysis(baselineResultId: string): Promise<Proposal> {
    const row = await context.command('teacher', '/v1/intelligence/analyze', { baselineResultId });
    expect(row).toMatchObject({ baselineResultId, generationMode: 'FIXTURE', status: 'AWAITING_HUMAN' });
    expect(typeof row.intelligenceRunId).toBe('string');
    return { id: row.id, runId: row.intelligenceRunId as string };
  }
  async function stored(proposal: Proposal): Promise<InsightContext> {
    const response = await context.request('teacher', `/v1/intelligence/runs/${proposal.runId}/context`);
    expect(response.statusCode).toBe(200);
    return insightContextSchema.parse(response.json().context);
  }
  async function rollbackFixture(work: () => Promise<void>, verify: () => Promise<void>) {
    await context.client.query('SAVEPOINT mixed_source_fixture');
    try { await work(); await verify(); }
    finally {
      await withFixtureCleanup(() => owner!.client.query('ROLLBACK TO SAVEPOINT mixed_source_fixture'), [
        () => owner!.client.query('RELEASE SAVEPOINT mixed_source_fixture'),
      ]);
    }
  }
  async function corruptStored(proposal: Proposal, value: InsightContext, verify: () => Promise<void>) {
    await rollbackFixture(async () => {
      // Explicit corrupt immutable fixture, confined to this rollback tenant/savepoint.
      // No production command may rewrite these records or weaken their trigger.
      await context.client.query('alter table app.intelligence_context_details disable trigger immutable_history');
      const changed = await context.client.query('update app.intelligence_context_details set context=$3::jsonb where school_id=$1 and run_id=$2', [context.school, proposal.runId, JSON.stringify(value)]);
      expect(changed.rowCount).toBe(1);
      await context.client.query('alter table app.intelligence_context_details enable trigger immutable_history');
    }, verify);
  }
  async function human(baselineResultId: string, title: string): Promise<Proposal> {
    const row = await context.command('teacher', '/v1/recommendations', { baselineResultId, observation: 'Actual released numeric evidence.', interpretation: 'Teacher selected the next step.', recommendation: 'Review the source feedback.', rationale: 'Reviewed current source.', uncertainty: 'Recorded evidence is not causal proof.', activityTitle: title, instructions: 'Explain one checked step from the school example.' });
    return { id: row.id, runId: null };
  }

  it('retains observed numeric proposals beside unrelated submitted work and denies each changed saved identity or observation fact', () => journey(async () => {
    const course = await customerCourse(context, 'Mixed numeric exact source');
    const unrelated = await customerCourse(context, 'Unrelated published work without proposals');
    const unrelatedAssessment = await context.command('teacher', '/v1/assessments', { courseId: unrelated.courseId, title: 'Unrelated submitted task', instructions: 'Separate current course work.', maxScore: 10 });
    await context.command('observed', `/v1/assessments/${unrelatedAssessment.id}/submissions`, { content: 'Actual other-course submission without any proposal.' });
    const baseline = await customerReleased(context, 'strong', course.courseId, 'Selected numeric baseline', 3);
    const otherLearner = await customerReleased(context, 'observed', course.courseId, 'Another learner numeric result', 7);
    const reference = await context.command('teacher', '/v1/academic-references', { title: 'Separate approved objective', description: 'A distinct school-authored objective.', version: 'mixed-objective-v1' });
    await context.command('coordinator', `/v1/academic-references/${reference.id}/approve`, {});
    const reflection = await context.command('teacher', `/v1/lessons/${course.lessonId}/activities`, { title: 'Checking reflection', kind: 'reflection', instructions: 'Reflect on the checking step.', sequence: 2 });
    const practiceReceipt = await context.command('strong', `/v1/activities/${course.practiceId}/complete`, {});
    const reflectionReceipt = await context.command('strong', `/v1/activities/${reflection.id}/complete`, { reflection: 'I compared the checking step with the example.' });
    await context.drain();
    const first = await analysis(baseline.resultId); const second = await analysis(baseline.resultId);
    const original = await stored(second);
    expect(original).toMatchObject({ learnerId: customerActor(12), courseId: course.courseId, reference: { id: context.referenceId } });
    expect(original.recentResults[0]).toMatchObject({ resultId: baseline.resultId, evidenceId: baseline.evidenceId, score: 3, maxScore: 10 });
    expect(original.observations.map(row => row.sourceObjectId).sort()).toEqual([practiceReceipt.id, reflectionReceipt.id].sort());
    expect(original.observations.map(row => row.kind).sort()).toEqual(['practice', 'reflection']);
    const saved = await snapshots([first, second]);
    await allowed(first, true, 'Numeric current peer'); await allowed(second, true, 'Numeric observed candidate');
    await pageEquals(saved, [first, second], 'Real observations and unrelated course cannot underinclude valid proposals');
    const variants: { label: string; change(value: InsightContext): void }[] = [
      { label: 'Saved learner differs', change: value => { value.learnerId = customerActor(13); } },
      { label: 'Saved course differs', change: value => { value.courseId = unrelated.courseId; } },
      { label: 'Saved objective differs', change: value => { value.reference.id = reference.id; } },
      { label: 'Saved result differs', change: value => { value.recentResults[0].resultId = otherLearner.resultId; } },
      { label: 'Saved observation kind differs', change: value => { value.observations[0].kind = value.observations[0].kind === 'practice' ? 'reflection' : 'practice'; } },
      { label: 'Saved observation event differs', change: value => { value.observations[0].sourceEventId = value.observations[1].sourceEventId; } },
      { label: 'Saved observation time differs', change: value => { value.observations[0].occurredAt = new Date(Date.parse(value.observations[0].occurredAt) + 1000).toISOString(); } },
    ];
    for (const variant of variants) {
      const changed = structuredClone(original); variant.change(changed);
      await corruptStored(second, changed, async () => {
        await allowed(second, false, variant.label); await allowed(first, true, variant.label + ' valid peer');
        await pageEquals(saved, [first], variant.label);
      });
    }
    await pageEquals(saved, [first, second], 'Numeric rollback restores both exact records');
  }), 60000);

  it('does not share an activity verdict across different saved instruction JSON or revision and rechecks a retired ancestor', () => journey(async () => {
    const course = await customerCourse(context, 'Shared option full saved meaning');
    const peerCourse = await customerCourse(context, 'Independent current practice peer');
    const baseline = await customerReleased(context, 'strong', course.courseId, 'Shared option baseline', 3);
    const peerBaseline = await customerReleased(context, 'observed', peerCourse.courseId, 'Independent practice baseline', 4);
    await context.drain();
    const first = await analysis(baseline.resultId); const second = await analysis(baseline.resultId); const peer = await analysis(peerBaseline.resultId);
    const original = await stored(second);
    expect(original.learningOptions).toHaveLength(1);
    expect(original.learningOptions[0]).toMatchObject({ activityId: course.practiceId, title: 'Teacher practice', instructions: 'Explain one step, then check it.', kind: 'practice', contentRevisionId: expect.any(String), contentRevision: expect.any(Number) });
    expect((await stored(first)).learningOptions).toEqual(original.learningOptions);
    const saved = await snapshots([first, second, peer]);
    for (const proposal of [first, second, peer]) await allowed(proposal, true, 'Original current practice');
    await pageEquals(saved, [first, second, peer], 'Identical option IDs retain each proposal payload');
    for (const [label, change] of [
      ['Changed saved instruction body', (value: InsightContext) => { value.learningOptions[0].instructions = 'A different saved instructional meaning.'; }],
      ['Changed saved revision', (value: InsightContext) => { value.learningOptions[0].contentRevision = value.learningOptions[0].contentRevision! + 1; }],
    ] as const) {
      const changed = structuredClone(original); change(changed);
      expect(changed.learningOptions[0].activityId).toBe(original.learningOptions[0].activityId);
      await corruptStored(second, changed, async () => {
        await allowed(second, false, label); await allowed(first, true, label + ' shared ID peer'); await allowed(peer, true, label + ' independent peer');
        await pageEquals(saved, [first, peer], label);
      });
    }
    const lessonResponse = await context.request('teacher', `/v1/learning-content/lesson/${course.lessonId}`);
    expect(lessonResponse.statusCode).toBe(200); const lesson = lessonResponse.json() as JsonRow & { revision: number };
    await rollbackFixture(async () => {
      await context.command('teacher', `/v1/learning-content/lesson/${course.lessonId}/retire`, { expectedRevision: lesson.revision, reason: 'Teacher withdraws the exact parent lesson.', confirmRetirement: true });
    }, async () => {
      await allowed(first, false, 'Retired lesson ancestor'); await allowed(second, false, 'Retired shared lesson ancestor'); await allowed(peer, true, 'Independent ancestor peer');
      await pageEquals(saved, [peer], 'Retired ancestor cannot borrow an unrelated published activity verdict');
    });
    await pageEquals(saved, [first, second, peer], 'Ancestor rollback preserves original sources');
  }), 60000);

  it('denies native missing details, incomparable prior support and numeric-only policy while retaining a valid human peer', () => journey(async () => {
    const course = await customerCourse(context, 'Native saved source boundary');
    const peerCourse = await customerCourse(context, 'Human numeric source peer');
    const rubric = await context.command('teacher', '/v1/rubrics', { courseId: course.courseId, title: 'Checking descriptors', version: 'mixed-native-v1', criteria: [{ key: 'check', title: 'Checking', levels: [{ key: 'shown', label: 'Shown', description: 'Explain the checking step.' }] }] });
    const assessment = await context.command('teacher', '/v1/assessments', { courseId: course.courseId, title: 'Native descriptor baseline', instructions: 'Explain a checking step.', maxScore: 10 });
    await context.command('teacher', `/v1/assessments/${assessment.id}/rubric`, { rubricId: rubric.id, expectedPolicyVersion: 1 });
    await context.command('teacher', `/v1/assessments/${assessment.id}/reference`, { referenceId: context.referenceId, expectedPolicyVersion: 2 });
    const submission = await context.command('strong', `/v1/assessments/${assessment.id}/submissions`, { content: 'Native descriptor source explanation.' });
    const mark = await context.command('teacher', `/v1/submissions/${submission.id}/results`, { nativeResult: { type: 'rubric', rubricId: rubric.id, criteria: [{ criterionKey: 'check', levelKey: 'shown' }] }, feedback: 'Reviewed criterion evidence.', expectedPolicyVersion: 3, expectedRevision: 0, sourceEvidence: true });
    const baseline = await context.command('teacher', `/v1/results/${mark.id}/release`, { expectedRevision: 1, parentVisible: false });
    const peerBaseline = await customerReleased(context, 'observed', peerCourse.courseId, 'Human current numeric baseline', 4);
    const policyResponse = await context.request('admin', '/v1/intelligence/policy'); expect(policyResponse.statusCode).toBe(200);
    await context.command('admin', '/v1/intelligence/policy', { purpose: 'NEXT_LEARNING_ACTION', dataClassification: 'SCHOOL_CUSTOM_NATIVE', fixtureEnabled: true, liveEnabled: false, allowedActions: ['GUIDED_PRACTICE', 'REVIEW_FEEDBACK'], expectedVersion: policyResponse.json().policy.version, confirmApproval: true, reason: 'Explicit descriptor-source fixture review.' });
    await context.drain();
    const first = await analysis(baseline.id); const second = await analysis(baseline.id);
    const peer = await human(peerBaseline.resultId, 'Independent human practice');
    const support = await context.command('teacher', `/v1/recommendations/${peer.id}/decision`, { decision: 'APPROVE', reason: 'Teacher reviewed separate numeric support.' });
    expect(typeof support.interventionId).toBe('string');
    const original = await stored(second);
    expect(original.recentResults[0]).toMatchObject({ resultId: baseline.id, nativeResult: baseline.nativeResult });
    expect(original.recentResults[0]).not.toHaveProperty('score'); expect(original.priorInterventions).toEqual([]);
    const saved = await snapshots([first, second, peer]);
    for (const proposal of [first, second, peer]) await allowed(proposal, true, 'Original native or human source');
    await pageEquals(saved, [first, second, peer], 'Native descriptor proposals remain visible');
    await rollbackFixture(async () => {
      // Corrupt missing immutable detail only inside the rollback fixture.
      await context.client.query('alter table app.intelligence_context_details disable trigger immutable_history');
      expect((await context.client.query('delete from app.intelligence_context_details where school_id=$1 and run_id=$2', [context.school, second.runId])).rowCount).toBe(1);
      await context.client.query('alter table app.intelligence_context_details enable trigger immutable_history');
    }, async () => {
      await allowed(second, false, 'Missing native detail'); await allowed(first, true, 'Native detail peer'); await allowed(peer, true, 'Human detail peer');
      await pageEquals(saved, [first, peer], 'Missing native detail cannot inherit the peer snapshot');
    });
    const prior = structuredClone(original);
    prior.priorInterventions = [{ id: support.interventionId as string, status: 'ASSIGNED', baselineResultId: peerBaseline.resultId, outcome: null }];
    await corruptStored(second, prior, async () => {
      await allowed(second, false, 'Native prior support needs comparable policy'); await allowed(first, true, 'Empty native prior peer'); await allowed(peer, true, 'Actual human support peer');
      await pageEquals(saved, [first, peer], 'Real numeric support does not become comparable native prior context');
    });
    await rollbackFixture(async () => {
      // Rollback-only current policy predicate fixture; no approved policy history is rewritten.
      expect((await context.client.query("update app.intelligence_policies set data_classification='SCHOOL_CUSTOM_NUMERIC'where school_id=$1", [context.school])).rowCount).toBe(1);
    }, async () => {
      await allowed(first, false, 'Native classification withdrawn'); await allowed(second, false, 'Second native classification withdrawn'); await allowed(peer, true, 'Human source is independent of generated native policy');
      await pageEquals(saved, [peer], 'Numeric-only current policy excludes native generated context');
    });
    await pageEquals(saved, [first, second, peer], 'Native policy/detail rollback restores exact payloads');
  }), 60000);
});
