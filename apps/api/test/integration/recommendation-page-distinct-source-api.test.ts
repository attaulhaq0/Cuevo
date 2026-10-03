import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config as dotenv } from 'dotenv';
import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { SchoolLearningService } from '../../src/modules/school-learning/learning.service';
import { AcademicService } from '../../src/modules/academic/academic.service';
import type { ActorContext } from '@cuevo/domain';
import type { Database } from '../../src/platform/database/database';
import { createCustomerContext, customerActor, customerCourse, type CustomerContext } from './customer-test-context';

dotenv({ path: '.env.local', quiet: true });

/** Independent baselines exercise distinct authority groups; shared-context volume is a separate test. */
describe.skipIf(process.env.CUEVO_REQUIRE_INTEGRATION !== '1')('current recommendation page with fifty distinct saved sources', () => {
  let context: CustomerContext | undefined;
  beforeAll(async () => { context = await createCustomerContext(); }, 60000);
  afterAll(async () => { await context?.close(); });

  it('measures the normal page budget without lowering the requested page or relaxing SQL limits', async () => {
    const active = context!;
    const started = performance.now();
    const samples: { path: 'RAW_RLS' | 'CURRENT_API'; limit: number; elapsedMs: number; status: string; delivered: number | null }[] = [];
    let baselineCount = 0; let proposalCount = 0; let releasedBaselineCount = 0; let completedAnalysisCount = 0; let cleanupCompleted = false;
    let stage = 'COURSE_SETUP'; let failureCode: string | null = null; let failureHttpStatus: number | null = null;
    const querySamples: { operation: string; elapsedMs: number; status: string }[] = [];
    const componentSamples: { component: string; elapsedMs: number; status: string; count: number | null }[] = [];
    const operationCounts = new Map<string, number>();
    const measuredClient = active.client as unknown as { query: (...args: unknown[]) => Promise<unknown> };
    const originalQuery = measuredClient.query.bind(active.client);
    measuredClient.query = async (...args: unknown[]) => {
      const text = typeof args[0] === 'string' ? args[0] : '';
      const operation = ['begin_teacher_insight_run', 'complete_intelligence_run', 'read_current_recommendation_page', 'process_learner_event'].find(name => text.includes('internal.' + name + '('));
      const record = (status: string) => {
        if (!operation) return;
        const count = operationCounts.get(operation) ?? 0;
        operationCounts.set(operation, count + 1);
        if (operation !== 'process_learner_event' || count < 5) querySamples.push({ operation, elapsedMs: Math.round(performance.now() - start), status });
      };
      const start = performance.now();
      try {
        const result = await originalQuery(...args);
        record('OK');
        return result;
      } catch (error) {
        const code = error instanceof Object && 'code' in error ? String(error.code) : 'UNKNOWN';
        record(['57014', '42501', 'P0002', '22023'].includes(code) ? code : 'UNCONFIRMED');
        throw error;
      }
    };
    let phaseStarted = started;
    let phaseBudgetMs = 150000;
    const deadline = () => { if (performance.now() - phaseStarted > phaseBudgetMs) throw Error('Distinct-source ' + stage + ' exceeded its cooperative phase fixture bound.'); };
    const sourceTransaction = async <T>(actor: string, run: () => Promise<T>) => {
      await active.client.query('SAVEPOINT distinct_source_command');
      try {
        await active.client.query('set local role cuevo_api'); await active.client.query("set local statement_timeout='5s'");
        await active.client.query("select set_config('app.actor_id',$1,true),set_config('app.school_id',$2,true)", [actor, active.school]);
        const result = await run(); await active.client.query('reset role'); await active.client.query("set local statement_timeout='0'"); await active.client.query('RELEASE SAVEPOINT distinct_source_command'); return result;
      } catch (error) { await active.client.query('ROLLBACK TO SAVEPOINT distinct_source_command'); await active.client.query('RELEASE SAVEPOINT distinct_source_command'); throw error; }
    };
    try {
      const course = await customerCourse(active, 'Distinct source proposal page');
      const baselines: string[] = [];
      const database = { actorTransaction: <T>(actor: string, selectedSchool: string, run: (client: typeof active.client) => Promise<T>) => {
        if (selectedSchool !== active.school) throw Error('Source setup refuses another fixture school.');
        return sourceTransaction(actor, () => run(active.client));
      } } as unknown as Database;
      const membership = async (actor: string): Promise<ActorContext> => sourceTransaction(actor, async () => {
        const row = (await active.client.query('select membership_id,actor_id,school_id,role,entitlement_codes from "authorization".current_memberships()where school_id=$1', [active.school])).rows[0];
        if (!row || row.actor_id !== actor) throw Error('Current source setup membership required.');
        return { userId: row.actor_id, schoolId: row.school_id, role: row.role, membershipId: row.membership_id, entitlements: row.entitlement_codes };
      });
      const teacher = await membership(customerActor(4)); const student = await membership(customerActor(12));
      const learning = new SchoolLearningService(database); const academic = new AcademicService(database);
      const receipt = (value: unknown) => { if (!value || typeof value !== 'object' || !('id' in value) || typeof value.id !== 'string') throw Error('Confirmed source command receipt required.'); return value.id; };
      const profileContext = async (baselineId: string) => {
        const definition = (await active.client.query("select pg_get_functiondef('internal.teacher_insight_context(uuid)'::regprocedure)definition")).rows[0].definition as string;
        const source = (await active.client.query('select result.learner_id,result.reference_id,result.reference_version,result.max_score,assessment.course_id from app.result_revisions result join app.assessments assessment on assessment.school_id=result.school_id and assessment.id=result.assessment_id where result.school_id=$1 and result.id=$2', [active.school, baselineId])).rows[0];
        const starts = [definition.indexOf(' with candidates as materialized('), definition.indexOf(' select coalesce(jsonb_agg(source order by occurred_at'), definition.indexOf(' select coalesce(jsonb_agg(source order by created_at desc,id)', definition.indexOf(' select coalesce(jsonb_agg(source order by occurred_at')), definition.indexOf('options:=internal.insight_published_options')];
        const queries: { component: string; sql: string; args: unknown[] }[] = [{ component: 'BASELINE_CONTEXT', sql: 'select internal.intelligence_context($1)is not null count', args: [baselineId] }];
        for (let index = 0; index < 3; index++) {
          let sql = definition.slice(starts[index], starts[index + 1]);
          if (starts[index] < 0 || starts[index + 1] <= starts[index]) throw Error('Exact context diagnostic source selection changed.');
          sql = sql.replace('into recent from', 'as payload from').replace('into observations from', 'as payload from').replace('into prior from', 'as payload from')
            .replaceAll('baseline.learner_id', '$2::uuid').replaceAll('baseline.reference_id', '$4::uuid').replaceAll('baseline.reference_version', '$5::text').replaceAll('baseline.max_score', '$6::numeric').replaceAll('baseline_id', '$7::uuid').replaceAll('course.id', '$3::uuid').replaceAll('window_days', '$8::integer').replaceAll('=school', '=$1::uuid').replaceAll('(school,', '($1::uuid,');
          queries.push({ component: ['RECENT_RESULTS', 'OBSERVATIONS', 'PRIOR_INTERVENTIONS'][index], sql, args: [active.school, source.learner_id, source.course_id, source.reference_id, source.reference_version, source.max_score, baselineId, 14] });
        }
        queries.push({ component: 'PUBLISHED_OPTIONS', sql: 'select internal.insight_published_options($1,$2)payload', args: [active.school, source.course_id] }, { component: 'COMPOSITE_CONTEXT', sql: 'select internal.teacher_insight_context($1)payload', args: [baselineId] });
        for (const query of queries) {
          await active.client.query('SAVEPOINT distinct_context_component'); const start = performance.now();
          try {
            // Owner executes only existing private read authority with the exact failed teacher context.
            await active.client.query('reset role'); await active.client.query("set local statement_timeout='5s'");
            await active.client.query("select set_config('app.actor_id',$1,true),set_config('app.school_id',$2,true)", [customerActor(4), active.school]);
            const value = (await active.client.query(query.sql, query.args)).rows[0];
            componentSamples.push({ component: query.component, elapsedMs: Math.round(performance.now() - start), status: 'OK', count: Array.isArray(value?.payload) ? value.payload.length : value?.payload?.recentResults?.length ?? null });
          } catch (error) {
            const code = error instanceof Object && 'code' in error ? String(error.code) : 'UNKNOWN';
            componentSamples.push({ component: query.component, elapsedMs: Math.round(performance.now() - start), status: ['57014', '42501', 'P0002', '22023'].includes(code) ? code : 'UNCONFIRMED', count: null });
          } finally { await active.client.query('ROLLBACK TO SAVEPOINT distinct_context_component'); await active.client.query('RELEASE SAVEPOINT distinct_context_component'); }
        }
      };
      // Source setup uses production services/SQL actor transactions; generation/page below use actual Auth/API.
      // Exactly fifty teacher-reviewed releases and fifty authorized fixture analyses; no owner-imported proposals.
      for (let index = 0; index < 50; index++) {
        stage = 'RELEASE_BASELINE';
        deadline();
        const key = 'distinct-source-' + index;
        const assessment = receipt(await learning.command(teacher, 'assessment.create', undefined, { courseId: course.courseId, title: 'Independent source ' + (index + 1), instructions: 'Explain the school-authored example.', maxScore: 10 }, key + '-assessment', 'distinct-source-setup'));
        await academic.command(teacher, 'assessment.reference', assessment, { referenceId: active.referenceId, expectedPolicyVersion: 1 }, key + '-reference', 'distinct-source-setup');
        const submission = receipt(await learning.command(student, 'submission.create', assessment, { content: 'Synthetic source explanation.' }, key + '-submission', 'distinct-source-setup'));
        const mark = receipt(await academic.command(teacher, 'marking.create', submission, { score: 3, feedback: 'Teacher-reviewed native evidence.', expectedPolicyVersion: 2, expectedRevision: 0, sourceEvidence: true }, key + '-mark', 'distinct-source-setup'));
        baselines.push(receipt(await academic.command(teacher, 'result.release', mark, { expectedRevision: 1, parentVisible: true }, key + '-release', 'distinct-source-setup')));
        releasedBaselineCount++;
      }
      stage = 'DRAIN_SOURCE_EVENTS';
      await active.drain();
      phaseStarted = performance.now();
      phaseBudgetMs = 250000;
      for (const baselineResultId of baselines) {
        stage = 'ANALYZE_CURRENT_SOURCE'; deadline();
        const response = await active.request('teacher', '/v1/intelligence/analyze', { baselineResultId });
        if (response.statusCode !== 200) {
          failureHttpStatus = response.statusCode;
          const code = response.json().code;
          failureCode = ['FORBIDDEN', 'INTELLIGENCE_INSUFFICIENT_EVIDENCE', 'INTELLIGENCE_REQUIRES_REVIEW', 'INTELLIGENCE_UNAVAILABLE', 'INTELLIGENCE_OUTCOME_UNKNOWN', 'INTELLIGENCE_TIMEOUT', 'COMMAND_IN_PROGRESS'].includes(code) ? code : 'UNCONFIRMED';
          await profileContext(baselineResultId);
          throw Error('Distinct-source analysis setup returned HTTP ' + response.statusCode + ' ' + failureCode + '.');
        }
        completedAnalysisCount++;
      }
      stage = 'COUNT_CONFIRMED_PROPOSALS';
      const population = (await active.client.query('select count(*)::integer proposals,count(distinct baseline_result_id)::integer baselines from app.recommendations where school_id=$1', [active.school])).rows[0];
      baselineCount = population.baselines; proposalCount = population.proposals;
      for (const limit of [1, 50]) {
        stage = 'RAW_PAGE_MEASUREMENT';
        await active.client.query('SAVEPOINT distinct_raw_read');
        const start = performance.now();
        try {
          await active.client.query('set local role cuevo_api');
          await active.client.query("set local statement_timeout='5s'");
          await active.client.query("select set_config('app.actor_id',$1,true),set_config('app.school_id',$2,true)", [customerActor(4), active.school]);
          const raw = await active.client.query('select r.id from app.recommendations r where r.school_id=$1 order by r.id limit $2', [active.school, limit + 1]);
          samples.push({ path: 'RAW_RLS', limit, elapsedMs: Math.round(performance.now() - start), status: 'OK', delivered: Math.min(limit, raw.rowCount ?? 0) });
        } catch (error) {
          const code = error instanceof Object && 'code' in error ? String(error.code) : 'UNKNOWN';
          samples.push({ path: 'RAW_RLS', limit, elapsedMs: Math.round(performance.now() - start), status: code === '57014' ? 'STATEMENT_TIMEOUT' : 'UNCONFIRMED', delivered: null });
        } finally { await active.client.query('ROLLBACK TO SAVEPOINT distinct_raw_read'); await active.client.query('RELEASE SAVEPOINT distinct_raw_read'); }
      }
      for (const limit of [1, 10, 50]) {
        stage = 'CURRENT_PAGE_MEASUREMENT';
        const start = performance.now();
        const response = await active.request('teacher', '/v1/recommendations?limit=' + limit);
        samples.push({ path: 'CURRENT_API', limit, elapsedMs: Math.round(performance.now() - start), status: response.statusCode === 200 ? 'OK' : 'HTTP_' + response.statusCode, delivered: response.statusCode === 200 ? response.json().items.length : null });
      }
    } finally {
      measuredClient.query = originalQuery;
      try {
        const population = (await active.client.query('select count(*)::integer proposals,count(distinct baseline_result_id)::integer baselines from app.recommendations where school_id=$1', [active.school])).rows[0];
        baselineCount = population.baselines; proposalCount = population.proposals;
      } catch { if (failureCode === null) failureCode = 'COUNT_UNCONFIRMED'; }
      // Cooperative setup bounds allow every pending request to finish before the rollback/connection cleanup.
      const closing = context; context = undefined; await closing?.close(); cleanupCompleted = true;
      await mkdir('.local/performance-investigation', { recursive: true });
      await writeFile('.local/performance-investigation/recommendation-distinct-source-profile.json', JSON.stringify({ classification: 'LOCAL_SYNTHETIC_ROLLBACK_ONLY', sourceSetup: 'PRODUCTION_SERVICES_SQL_ACTOR_TRANSACTIONS', generationAndPages: 'ACTUAL_AUTH_API', statementBudgetMs: 5000, sourcePhaseBoundMs: 150000, analysisPhaseBoundMs: 250000, caseBoundMs: 480000, releasedBaselineCount, completedAnalysisCount, baselineCount, proposalCount, stage, failureCode, failureHttpStatus, elapsedMs: Math.round(performance.now() - started), samples, querySamples, componentSamples, operationCounts: Object.fromEntries(operationCounts), cleanupCompleted }, null, 2) + '\n');
    }
    expect(baselineCount).toBe(50); expect(proposalCount).toBe(50);
    const currentPages = samples.filter(item => item.path === 'CURRENT_API');
    expect(currentPages.map(sample => sample.limit)).toEqual([1, 10, 50]);
    for (const sample of currentPages) {
      expect(sample.status, JSON.stringify(sample)).toBe('OK');
      expect(sample.delivered, JSON.stringify(sample)).toBe(sample.limit);
      expect(sample.elapsedMs, JSON.stringify(sample)).toBeLessThan(5000);
    }
  }, 480000);
});
