import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { config as dotenv } from 'dotenv';
import { randomUUID } from 'node:crypto';
import { insightContextSchema, type InsightContext } from '@cuevo/contracts';
import { createCustomerContext, customerActor, customerCourse, customerReleased, customerAssessment, type CustomerContext, type CustomerRole } from './customer-test-context';
import { CooperativeFixtureScope } from './cooperative-fixture-scope';
import { cooperativeCustomerContext } from './cooperative-customer-context';
import { withFixtureCleanup } from './fixture-cleanup';
import { beforeName, canonicalAuthority, currentName, frozenAuthoritySql } from './intelligence-source-authority-oracle';

dotenv({ path: '.env.local', quiet: true });
type Source = { resultId: string; submissionId: string; assessmentId: string; evidenceId: string; learnerId: string; courseId: string; referenceId: string; version: string; parentAllowed: boolean | null; model: 'numeric' | 'rubric' };
type Authority = Record<'academic' | 'mark' | 'native' | 'baseline' | 'insight', boolean | null>;
type SourceOverrides = Partial<Source> & { school?: string | null };
const keys = ['academic', 'mark', 'native', 'baseline', 'insight'] as const;
const full: Authority = { academic: true, mark: true, native: true, baseline: true, insight: true };
const readOnly: Authority = { academic: true, mark: false, native: true, baseline: false, insight: false };
const denied: Authority = { academic: false, mark: false, native: false, baseline: false, insight: false };

describe.skipIf(process.env.CUEVO_REQUIRE_INTEGRATION !== '1')('canonical intelligence authority against a frozen pre-repair graph', () => {
  let owner: CustomerContext;
  let context: CustomerContext;
  let scope: CooperativeFixtureScope | undefined;
  let numeric: Source; let rubric: Source;
  beforeAll(async () => {
    owner = await createCustomerContext(); context = owner;
    const oracle = await frozenAuthoritySql();
    for (const sql of oracle.frozen) await context.client.query(sql);
    for (const helper of canonicalAuthority) {
      await context.client.query(`revoke execute on function ${beforeName(helper.name)}(${helper.types})from public`);
      await context.client.query(`grant execute on function ${beforeName(helper.name)}(${helper.types})to cuevo_api`);
      // This temporary wrapper is only an entry to today's protected helper,
      // never an expectation. The frozen graph has its own nested calls.
      await context.client.query(`create function ${currentName(helper.name)}(${helper.parameters})returns boolean language sql security definer set search_path=''as $$select ${helper.name}(${helper.args})$$`);
      await context.client.query(`revoke execute on function ${currentName(helper.name)}(${helper.types})from public`);
      await context.client.query(`grant execute on function ${currentName(helper.name)}(${helper.types})to cuevo_api`);
    }
    await context.client.query("revoke execute on function pg_temp.before_intelligence_context(uuid),pg_temp.before_insight_outcome_allowed(uuid,uuid,uuid,uuid,uuid,text),pg_temp.before_original_native_insight_context(uuid),pg_temp.before_original_teacher_insight_context(uuid)from public");
    await context.client.query('grant execute on function pg_temp.before_original_teacher_insight_context(uuid)to cuevo_api');
    await context.client.query("create function pg_temp.current_context(target uuid)returns jsonb language sql security definer set search_path=''as $$select internal.teacher_insight_context(target)$$");
    await context.client.query('revoke execute on function pg_temp.current_context(uuid)from public');
    await context.client.query('grant execute on function pg_temp.current_context(uuid)to cuevo_api');
    const numericCourse = await customerCourse(context, 'Frozen numeric source authority');
    const zero = await customerReleased(context, 'strong', numericCourse.courseId, 'Reviewed zero source', 0);
    numeric = await source(zero.resultId, 'numeric');
    const nativeCourse = await customerCourse(context, 'Frozen native source authority');
    const definition = await context.command('teacher', '/v1/rubrics', { courseId: nativeCourse.courseId, title: 'Checking criterion', version: 'authority-native-v1', criteria: [{ key: 'check', title: 'Checking', levels: [{ key: 'shown', label: 'Shown', description: 'Show a checking step.' }] }] });
    const assessment = await context.command('teacher', '/v1/assessments', { courseId: nativeCourse.courseId, title: 'Reviewed descriptor source', instructions: 'Explain a checking step.', maxScore: 10 });
    await context.command('teacher', `/v1/assessments/${assessment.id}/rubric`, { rubricId: definition.id, expectedPolicyVersion: 1 });
    await context.command('teacher', `/v1/assessments/${assessment.id}/reference`, { referenceId: context.referenceId, expectedPolicyVersion: 2 });
    const submitted = await context.command('observed', `/v1/assessments/${assessment.id}/submissions`, { content: 'Synthetic native checking evidence.' });
    const mark = await context.command('teacher', `/v1/submissions/${submitted.id}/results`, { nativeResult: { type: 'rubric', rubricId: definition.id, criteria: [{ criterionKey: 'check', levelKey: 'shown' }] }, feedback: 'Teacher reviewed the exact criterion.', expectedPolicyVersion: 3, expectedRevision: 0, sourceEvidence: true });
    const released = await context.command('teacher', `/v1/results/${mark.id}/release`, { expectedRevision: 1, parentVisible: false });
    rubric = await source(released.id, 'rubric');
    await context.drain();
  }, 90000);
  afterEach(async () => { await scope?.cancelAndWait(); context = owner; scope = undefined; });
  afterAll(async () => { await owner?.close(); });
  function journey(work: () => Promise<void>) {
    scope = new CooperativeFixtureScope(90000); context = cooperativeCustomerContext(owner, scope);
    return scope.run(work);
  }
  async function source(resultId: string, model: Source['model']): Promise<Source> {
    const result = (await context.client.query('select result.*,assessment.course_id from internal.improvement_result_sources result join app.assessments assessment on assessment.school_id=result.school_id and assessment.id=result.assessment_id where result.school_id=$1 and result.id=$2', [context.school, resultId])).rows[0];
    expect(result).toBeDefined();
    return { resultId, submissionId: result.submission_id, assessmentId: result.assessment_id, evidenceId: result.evidence_id, learnerId: result.learner_id, courseId: result.course_id, referenceId: result.reference_id, version: result.reference_version, parentAllowed: result.parent_visible, model };
  }
  async function scoped<T>(role: CustomerRole, work: () => Promise<T>) {
    await context.client.query('SAVEPOINT frozen_authority_read');
    try {
      await context.client.query('set local role cuevo_api');
      await context.client.query("set local statement_timeout='5s'");
      const roles: Partial<Record<CustomerRole, number>> = { teacher: 4, admin: 1, coordinator: 2, otherTeacher: 5, parent: 72, strong: 12, observed: 13 };
      const actor = roles[role]; if (actor === undefined) throw Error('Parity role has no explicit actor');
      await context.client.query("select set_config('app.actor_id',$1,true),set_config('app.school_id',$2,true)", [customerActor(actor), context.school]);
      return await work();
    } finally {
      await withFixtureCleanup(() => owner.client.query('ROLLBACK TO SAVEPOINT frozen_authority_read'), [() => owner.client.query('RELEASE SAVEPOINT frozen_authority_read')]);
    }
  }
  async function compare(record: Source, role: CustomerRole, requireCurrent: boolean | null, expected?: Authority, overrides: SourceOverrides = {}) {
    const input = { ...record, ...overrides }; const school = overrides.school === undefined ? context.school : overrides.school;
    const tuples = [
      [school, input.learnerId, input.parentAllowed, input.assessmentId], [school, input.submissionId], [school, input.resultId, requireCurrent],
      [school, input.resultId], [school, input.resultId, input.learnerId, input.courseId, input.referenceId, input.version, requireCurrent],
    ];
    return scoped(role, async () => {
      const verdicts = {} as Authority;
      for (const [index, helper] of canonicalAuthority.entries()) {
        const args = tuples[index]; const placeholders = args.map((_, ordinal) => '$' + (ordinal + 1)).join(',');
        const result = (await context.client.query(`with verdicts as materialized(select ${beforeName(helper.name)}(${placeholders})as expected,${currentName(helper.name)}(${placeholders})as actual)select *,expected is not distinct from actual as identical from verdicts`, args)).rows[0];
        expect(result.identical, `${record.model} ${role} ${keys[index]} current=${requireCurrent}: ${JSON.stringify(result)}`).toBe(true);
        verdicts[keys[index]] = result.actual;
        if (expected) expect(result.expected, `${record.model} ${role} frozen ${keys[index]} current=${requireCurrent}`).toBe(expected[keys[index]]);
      }
      return verdicts;
    });
  }
  async function rollback(work: () => Promise<void>) {
    await context.client.query('SAVEPOINT frozen_authority_fixture');
    try { await work(); }
    finally { await withFixtureCleanup(() => owner.client.query('ROLLBACK TO SAVEPOINT frozen_authority_fixture'), [() => owner.client.query('RELEASE SAVEPOINT frozen_authority_fixture')]); }
  }
  async function contextParity(baselineId: string): Promise<InsightContext> {
    return scoped('teacher', async () => {
      const old = (await context.client.query('select pg_temp.before_original_teacher_insight_context($1)context', [baselineId])).rows[0].context;
      const current = (await context.client.query('select pg_temp.current_context($1)context', [baselineId])).rows[0].context;
      expect(current).toEqual(old); return insightContextSchema.parse(current);
    });
  }

  it('preserves current numeric zero and rubric authority, distinct null semantics and every role', () => journey(async () => {
    for (const record of [numeric, rubric]) {
      for (const requireCurrent of [true, false, null]) {
        await compare(record, 'teacher', requireCurrent, { ...full, native: requireCurrent !== null });
        await compare(record, 'admin', requireCurrent, { ...full, native: requireCurrent !== null });
      }
      await compare(record, 'coordinator', true, readOnly);
      await compare(record, 'otherTeacher', true, denied);
    }
    await compare(numeric, 'strong', true, readOnly);
    await compare(numeric, 'observed', true, denied);
    await compare(numeric, 'parent', true, readOnly);
    await compare(rubric, 'observed', true, readOnly);
    await compare(rubric, 'strong', true, denied);
    await compare(rubric, 'parent', true, denied);
    // Unknown parent input is distinct from missing current-source input.
    await compare(numeric, 'parent', true, { ...denied, native: true }, { parentAllowed: null });
    await compare(numeric, 'teacher', true, full, { parentAllowed: null });
    const visible = await context.request('teacher', `/v1/results/${numeric.resultId}/source`); expect(visible.statusCode).toBe(200);
    expect(visible.json().nativeResult).toMatchObject({ type: 'numeric', score: 0, maxScore: 10, normalized: null });
    const native = await context.request('teacher', `/v1/results/${rubric.resultId}/source`); expect(native.statusCode).toBe(200);
    expect(native.json().nativeResult).toMatchObject({ type: 'rubric', criteria: [{ criterionKey: 'check', levelKey: 'shown', levelLabel: 'Shown' }] });
    expect(native.body).not.toContain('maxScore');
    const missing = randomUUID();
    for (const record of [numeric, rubric]) {
      await compare(record, 'teacher', true, denied, { school: missing });
      await compare(record, 'teacher', true, denied, { school: null });
      await compare(record, 'teacher', true, denied, { resultId: missing, submissionId: missing, assessmentId: missing });
      for (const change of [{ learnerId: missing }, { courseId: missing }, { referenceId: missing }, { version: 'unapproved-version' }]) {
        const result = await compare(record, 'teacher', true, undefined, change); expect(result.insight).toBe(false);
      }
    }
  }), 100000);

  it('preserves pointer, exact evidence, current membership, course and entitlement denials', () => journey(async () => {
    for (const record of [numeric, rubric]) {
      const resultTable = record.model === 'numeric' ? 'app.current_results' : 'app.current_rubric_results';
      await rollback(async () => {
        expect((await context.client.query(`delete from ${resultTable} where school_id=$1 and result_id=$2`, [context.school, record.resultId])).rowCount).toBe(1);
        await compare(record, 'teacher', true, { ...full, native: false, baseline: false, insight: false });
        await compare(record, 'teacher', false, { ...full, baseline: false, insight: false });
        await compare(record, 'teacher', null, { ...full, native: false, baseline: false, insight: false });
      });
      await rollback(async () => {
        expect((await context.client.query('delete from app.current_submissions where school_id=$1 and submission_id=$2', [context.school, record.submissionId])).rowCount).toBe(1);
        await compare(record, 'teacher', true, { ...full, native: false, baseline: false, insight: false });
        await compare(record, 'teacher', false, { ...full, baseline: false, insight: false });
      });
      const evidenceTable = record.model === 'numeric' ? 'app.academic_evidence' : 'app.rubric_evidence';
      for (const change of ['source_object_id=$3', 'learner_id=$3', 'policy_version=policy_version+1', "reference_version='unsupported-evidence-version'"]) {
        await rollback(async () => {
          // Deliberately corrupt immutable evidence only inside this private
          // rollback fixture; supported commands never change historical bytes.
          expect((await context.client.query('show session_replication_role')).rows[0].session_replication_role).toBe('origin');
          // Corrupt relational evidence identities deliberately, including an
          // otherwise FK-rejected learner tuple, then restore ordinary triggers
          // before either authority graph reads it. Rollback restores all data.
          await context.client.query("set local session_replication_role='replica'");
          const args = change.includes('$3') ? [context.school, record.evidenceId, change.startsWith('learner') ? (record.learnerId === numeric.learnerId ? rubric.learnerId : numeric.learnerId) : (record.submissionId === numeric.submissionId ? rubric.submissionId : numeric.submissionId)] : [context.school, record.evidenceId];
          expect((await context.client.query(`update ${evidenceTable} set ${change} where school_id=$1 and id=$2`, args)).rowCount).toBe(1);
          await context.client.query("set local session_replication_role='origin'");
          await compare(record, 'teacher', true, { ...full, native: false, baseline: false, insight: false });
        });
      }
    }
    for (const change of ["status='revoked'", "effective_from=now()+interval'1 day'", "effective_to=now()-interval'1 minute'"]) {
      await rollback(async () => {
        expect((await context.client.query(`update app.enrollments set ${change} where school_id=$1 and class_id=$2 and student_actor_id=$3`, [context.school, context.classId, numeric.learnerId])).rowCount).toBe(1);
        await compare(numeric, 'teacher', true, denied);
        await compare(numeric, 'admin', true, { ...full, mark: false, native: false, baseline: false, insight: false });
        // Staff retained-source read and new current-source command authority differ.
        await compare(numeric, 'admin', false, { ...full, mark: false, baseline: false, insight: false });
        await compare(rubric, 'teacher', true, full);
      });
    }
    await rollback(async () => {
      expect((await context.client.query("update app.memberships set status='suspended'where school_id=$1 and actor_id=$2", [context.school, numeric.learnerId])).rowCount).toBe(1);
      await compare(numeric, 'teacher', true, denied); await compare(rubric, 'teacher', true, full);
    });
    await rollback(async () => {
      expect((await context.client.query("update app.teacher_assignments set status='revoked'where school_id=$1 and teacher_actor_id=$2", [context.school, customerActor(4)])).rowCount).toBe(2);
      await compare(numeric, 'teacher', true, denied); await compare(rubric, 'teacher', true, denied);
    });
    for (const entitlement of ['assessment', 'learning', 'curriculum', 'improvement']) {
      await rollback(async () => {
        expect((await context.client.query('update app.entitlements set enabled=false where school_id=$1 and code=$2', [context.school, entitlement])).rowCount).toBe(1);
        await compare(numeric, 'teacher', true, entitlement === 'improvement' ? { ...full, baseline: false, insight: false } : denied);
      });
    }
    await rollback(async () => {
      expect((await context.client.query("update app.classes set status='archived'where school_id=$1 and id=$2", [context.school, context.classId])).rowCount).toBe(1);
      await compare(numeric, 'teacher', true, denied);
    });
    await compare(numeric, 'teacher', true, full); await compare(rubric, 'teacher', true, full);
  }), 100000);

  it('uses current parent sharing and exact current child scope while preserving immutable release facts', () => journey(async () => {
    await rollback(async () => {
      const publication = (parentVisible: boolean, revision: number) => ({ parentVisible, expectedPublicationRevision: revision, expectedResultRevision: 1, reason: 'Explicit parent sharing review independent of grade authority.', confirmPublication: true });
      await context.command('teacher', `/v1/results/${numeric.resultId}/publication`, publication(false, 0));
      await compare(numeric, 'parent', true, denied, { parentAllowed: false });
      await compare(numeric, 'teacher', true, full, { parentAllowed: false });
      expect((await context.request('parent', `/v1/results/${numeric.resultId}/source`)).statusCode).toBe(403);
      expect((await context.client.query('select parent_visible from app.result_revisions where school_id=$1 and id=$2', [context.school, numeric.resultId])).rows[0].parent_visible).toBe(true);
      await context.command('teacher', `/v1/results/${numeric.resultId}/publication`, publication(true, 1));
      await compare(numeric, 'parent', true, readOnly);
      await context.command('teacher', `/v1/results/${rubric.resultId}/publication`, publication(true, 0));
      await compare(rubric, 'parent', true, readOnly, { parentAllowed: true });
      expect((await context.request('parent', `/v1/results/${rubric.resultId}/source`)).statusCode).toBe(200);
      expect((await context.client.query('select parent_visible from app.rubric_result_revisions where school_id=$1 and id=$2', [context.school, rubric.resultId])).rows[0].parent_visible).toBe(false);
      await context.client.query("update app.enrollments set status='revoked'where school_id=$1 and class_id=$2 and student_actor_id=$3", [context.school, context.classId, numeric.learnerId]);
      await compare(numeric, 'parent', true, { ...readOnly, native: false });
      await compare(numeric, 'parent', false, readOnly);
      await context.client.query("update app.parent_relationships set status='revoked'where school_id=$1 and parent_actor_id=$2 and student_actor_id=$3", [context.school, customerActor(72), numeric.learnerId]);
      await compare(numeric, 'parent', false, denied); await compare(rubric, 'parent', true, readOnly, { parentAllowed: true });
    });
  }), 100000);

  it('preserves a genuine nonempty measured prior intervention and denies corrected contributing sources', () => journey(async () => {
    const course = await customerCourse(context, 'Measured prior source parity');
    const baseline = await customerReleased(context, 'strong', course.courseId, 'Prior reviewed baseline', 0);
    const human = await context.command('teacher', '/v1/recommendations', { baselineResultId: baseline.resultId, observation: 'Released zero on the native ten-point scale.', interpretation: 'One recorded source requires teacher review.', recommendation: 'Review the school checking example.', rationale: 'Teacher selected the source-backed practice.', uncertainty: 'The observed outcome does not prove cause.', activityTitle: 'Teacher checking example', instructions: 'Explain one checking step.' });
    const approved = await context.command('teacher', `/v1/recommendations/${human.id}/decision`, { decision: 'APPROVE', reason: 'Teacher reviewed the exact current evidence.' });
    expect(typeof approved.interventionId).toBe('string'); const interventionId = approved.interventionId as string;
    await context.command('strong', `/v1/interventions/${interventionId}/complete`, { reflection: 'I explained and checked the step.' });
    const assessmentId = await customerAssessment(context, course.courseId, 'Measured prior reassessment');
    await context.command('teacher', `/v1/interventions/${interventionId}/reassessment`, { assessmentId });
    const submission = await context.command('strong', `/v1/assessments/${assessmentId}/submissions`, { content: 'A new reassessed checking explanation.' });
    const marking = await context.command('teacher', `/v1/submissions/${submission.id}/results`, { score: 4, feedback: 'Teacher reassessed the new evidence.', expectedPolicyVersion: 2, expectedRevision: 0, sourceEvidence: true });
    const followup = await context.command('teacher', `/v1/results/${marking.id}/release`, { expectedRevision: 1, parentVisible: true });
    const outcome = await context.command('teacher', `/v1/interventions/${interventionId}/measure`, { followUpResultId: followup.id, minimumChange: 2 });
    expect(outcome).toMatchObject({ status: 'improved', difference: 4, limitation: 'OBSERVED_CHANGE_NOT_CAUSAL_PROOF' });
    await context.drain();
    const fresh = await customerReleased(context, 'strong', course.courseId, 'Current review after measurement', 5); await context.drain();
    const complete = await contextParity(fresh.resultId);
    expect(complete.priorInterventions).toHaveLength(1);
    expect(complete.priorInterventions[0]).toMatchObject({ id: interventionId, baselineResultId: baseline.resultId, outcome: { id: outcome.id, status: 'improved', difference: 4, minimumChange: 2, baselineResultId: baseline.resultId, followUpResultId: followup.id } });
    expect(complete.recentResults.map(row => row.resultId)).toEqual([fresh.resultId, followup.id, baseline.resultId]);
    const proposal = await context.command('teacher', '/v1/intelligence/analyze', { baselineResultId: fresh.resultId });
    const stored = await context.request('teacher', `/v1/intelligence/runs/${proposal.intelligenceRunId}/context`); expect(stored.statusCode).toBe(200); expect(stored.json().context).toEqual(complete);
    for (const contributing of [await source(baseline.resultId, 'numeric'), await source(followup.id, 'numeric')]) {
      await rollback(async () => {
        const corrected = await context.command('teacher', `/v1/submissions/${contributing.submissionId}/results`, { score: contributing.resultId === baseline.resultId ? 1 : 6, feedback: 'Teacher corrected the contributing native evidence.', expectedPolicyVersion: 2, expectedRevision: 1, sourceEvidence: true });
        await context.command('teacher', `/v1/results/${corrected.id}/release`, { expectedRevision: 2, parentVisible: true });
        await compare(contributing, 'teacher', false, { ...full, baseline: false, insight: false });
        const current = await contextParity(fresh.resultId);
        expect(current.priorInterventions.some(row => row.id === interventionId)).toBe(false);
        expect((await context.request('teacher', `/v1/intelligence/runs/${proposal.intelligenceRunId}/context`)).statusCode).toBe(403);
        expect((await context.request('teacher', `/v1/recommendations/${proposal.id}/decision`, { decision: 'APPROVE', reason: 'The corrected contributing source must deny this old proposal.' })).statusCode).toBe(403);
        expect((await context.client.query('select count(*)::integer count from app.interventions where school_id=$1 and recommendation_id=$2', [context.school, proposal.id])).rows[0].count).toBe(0);
      });
    }
    expect((await contextParity(fresh.resultId)).priorInterventions).toEqual(complete.priorInterventions);
  }), 100000);
});
