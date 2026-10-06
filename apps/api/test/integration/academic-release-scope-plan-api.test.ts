import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { QueryResult } from 'pg';
import { createCustomerContext, customerActor, customerAssessment, customerCourse, type CustomerContext } from './customer-test-context';
import { scaleSqlStage } from './scale-query-diagnostics';

type PlanNode = { 'Relation Name'?: string; 'Actual Rows': number; 'Actual Loops': number; 'Rows Removed by Filter'?: number; Plans?: PlanNode[] };
function assessmentVisits(node: PlanNode): number {
  return (node['Relation Name'] === 'assessments' ? (node['Actual Rows'] + (node['Rows Removed by Filter'] ?? 0)) * node['Actual Loops'] : 0)
    + (node.Plans ?? []).reduce((count, child) => count + assessmentVisits(child), 0);
}

describe.skipIf(process.env.CUEVO_REQUIRE_INTEGRATION !== '1')('native release exact-source SQL plan and authorization', () => {
  let context: CustomerContext; let course: Awaited<ReturnType<typeof customerCourse>>; let numericMarkId: string; let rubricMarkId: string;
  beforeAll(async () => {
    context = await createCustomerContext(); course = await customerCourse(context, 'Exact native release source');
    // Historical volume stays inside the same synthetic rollback tenant. Every tested release uses real protected API commands.
    await context.client.query("insert into app.assessments(school_id,course_id,title,instructions,max_score,created_by)select $1,$2,'Historical synthetic task '||n,'School-authored context.',10,$3 from generate_series(1,50)n", [context.school, course.courseId, customerActor(4)]);
  }, 60_000);
  afterAll(async () => { await context?.close(); });

  for (const model of ['numeric', 'rubric'] as const) it(`${model} release and retry read at most the exact assessment while preserving native receipt and current scope`, async () => {
    const assessmentId = await customerAssessment(context, course.courseId, `Selected ${model} task`);
    let rubricId: string | undefined;
    if (model === 'rubric') {
      const rubric = await context.command('teacher', '/v1/rubrics', { courseId: course.courseId, title: 'School explanation rubric', version: 'school-1', criteria: [{ key: 'explanation', title: 'Explanation', levels: [{ key: 'developing', label: 'Developing', description: 'Explain one step.' }] }] });
      rubricId = rubric.id;
      await context.command('teacher', `/v1/assessments/${assessmentId}/rubric`, { rubricId, expectedPolicyVersion: 2 });
    }
    const submission = await context.command('strong', `/v1/assessments/${assessmentId}/submissions`, { content: 'Synthetic immutable explanation.' });
    const mark = await context.command('teacher', `/v1/submissions/${submission.id}/results`, { ...(model === 'numeric' ? { score: 0 } : { nativeResult: { type: 'rubric', rubricId, criteria: [{ criterionKey: 'explanation', levelKey: 'developing' }] } }), feedback: 'Human-reviewed native evidence.', expectedPolicyVersion: model === 'numeric' ? 2 : 3, expectedRevision: 0, sourceEvidence: true });
    if (model === 'numeric') numericMarkId = mark.id; else rubricMarkId = mark.id;
    const query = context.client.query.bind(context.client) as (sql: string, values?: unknown[]) => Promise<QueryResult>;
    const captured: { stage: string; sql: string; values: unknown[] }[] = [];
    const spy = vi.spyOn(context.client, 'query').mockImplementation(((sql: string, values?: unknown[]) => {
      const stage = scaleSqlStage(sql);
      if (stage === 'RELEASE_EXISTING' || stage === 'RELEASE_PROJECTION') captured.push({ stage, sql, values: values ?? [] });
      return query(sql, values);
    }) as typeof context.client.query);
    const key = randomUUID(); let released: Record<string, unknown>;
    try {
      const first = await context.request('teacher', `/v1/results/${mark.id}/release`, { expectedRevision: 1, parentVisible: true }, key);
      expect(first.statusCode).toBe(200); released = first.json();
      expect((await context.request('teacher', `/v1/results/${mark.id}/release`, { expectedRevision: 1, parentVisible: true }, key)).json()).toEqual(released);
      expect((await context.request('teacher', `/v1/results/${mark.id}/release`, { expectedRevision: 1, parentVisible: true })).json()).toEqual(released);
    } finally { spy.mockRestore(); }
    expect(released!).toMatchObject({ assessmentId, referenceId: context.referenceId, assessmentTitle: `Selected ${model} task`, model, revision: 1, parentVisible: true, nativeResult: { type: model } });
    if (model === 'numeric') expect(released!).toMatchObject({ score: 0, maxScore: 10 });
    else { expect(released!).not.toHaveProperty('score'); expect(released!).not.toHaveProperty('maxScore'); expect(released!.nativeResult).toMatchObject({ rubricId, normalized: null }); }
    expect(captured.map(row => row.stage).sort()).toEqual(['RELEASE_EXISTING', 'RELEASE_EXISTING', 'RELEASE_PROJECTION']);

    await context.client.query('SAVEPOINT release_plan_scope');
    try {
      await context.client.query('set local role cuevo_api'); await context.client.query("set local statement_timeout='5s'");
      await context.client.query("select set_config('app.actor_id',$1,true),set_config('app.school_id',$2,true)", [customerActor(4), context.school]);
      for (const statement of captured) {
        const explain = await context.client.query('explain(analyze,format json) ' + statement.sql, statement.values);
        const plan = (explain.rows[0]['QUERY PLAN'] as [{ Plan: PlanNode }])[0].Plan;
        expect(assessmentVisits(plan), `${model} ${statement.stage} must admit only its exact source assessment`).toBeLessThanOrEqual(1);
        expect((await context.client.query(statement.sql, [randomUUID(), context.school])).rows).toEqual([]);
        expect((await context.client.query(statement.sql, [statement.values[0], randomUUID()])).rows).toEqual([]);
      }
    } finally { await context.client.query('ROLLBACK TO SAVEPOINT release_plan_scope'); await context.client.query('RELEASE SAVEPOINT release_plan_scope'); }

    const sourceId = released!.id;
    expect((await context.client.query("select(select count(*)from internal.audit_events where school_id=$1 and entity_id=$2 and action='result.release')::integer audits,(select count(*)from internal.outbox_events where school_id=$1 and entity_id=$2 and type in('result.released','rubric.result.released'))::integer events", [context.school, sourceId])).rows[0]).toEqual({ audits: 1, events: 1 });
    expect((await context.request('otherTeacher', `/v1/results/${mark.id}/release`, { expectedRevision: 1, parentVisible: true })).statusCode).toBe(403);
    expect((await context.request('parent', `/v1/results/${mark.id}/release`, { expectedRevision: 1, parentVisible: true })).statusCode).toBe(403);
    await context.client.query('SAVEPOINT release_revoked_scope');
    try {
      await context.client.query("update app.teacher_assignments set status='revoked'where school_id=$1 and teacher_actor_id=$2", [context.school, customerActor(4)]);
      expect((await context.request('teacher', `/v1/results/${mark.id}/release`, { expectedRevision: 1, parentVisible: true }, key)).statusCode).toBe(403);
      await context.client.query('set local role cuevo_api');
      await context.client.query("set local statement_timeout='5s'");
      await context.client.query("select set_config('app.actor_id',$1,true),set_config('app.school_id',$2,true)", [customerActor(4), context.school]);
      for (const statement of captured) expect((await context.client.query(statement.sql, statement.values)).rows).toEqual([]);
    } finally { await context.client.query('ROLLBACK TO SAVEPOINT release_revoked_scope'); await context.client.query('RELEASE SAVEPOINT release_revoked_scope'); }
  }, 30_000);
  it('refuses ambiguous cross-model marking identity before a receipt, audit or event can be selected', async () => {
    await context.client.query('SAVEPOINT malformed_native_mark_identity');
    try {
      await context.client.query("select set_config('app.actor_id',$1,true),set_config('app.school_id',$2,true)", [customerActor(4), context.school]);
      await context.client.query('insert into app.rubric_marking_revisions(school_id,id,submission_id,learner_id,revision,rubric_id,native_result,feedback,policy_version,reference_id,source_object_id,created_by)select school_id,$2,submission_id,learner_id,revision+1,rubric_id,native_result,feedback,policy_version,reference_id,source_object_id,created_by from app.rubric_marking_revisions where school_id=$1 and id=$3', [context.school, numericMarkId, rubricMarkId]);
      const count = async () => (await context.client.query("select(select count(*)from app.result_revisions where school_id=$1)::integer numeric,(select count(*)from app.rubric_result_revisions where school_id=$1)::integer rubric,(select count(*)from internal.audit_events where school_id=$1 and action='result.release')::integer audits,(select count(*)from internal.outbox_events where school_id=$1 and type in('result.released','rubric.result.released'))::integer events", [context.school])).rows[0];
      const before = await count();
      expect((await context.request('teacher', `/v1/results/${numericMarkId}/release`, { expectedRevision: 1, parentVisible: true })).statusCode).toBe(503);
      expect(await count()).toEqual(before);
    } finally { await context.client.query('ROLLBACK TO SAVEPOINT malformed_native_mark_identity'); await context.client.query('RELEASE SAVEPOINT malformed_native_mark_identity'); }
  });
});
