import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config as dotenv } from 'dotenv';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { insightContextSchema } from '@cuevo/contracts';
import { createCustomerContext, customerActor, customerCourse, customerReleased, type CustomerContext } from './customer-test-context';

dotenv({ path: '.env.local', quiet: true });
const sourceHashes = [
  {
    "path": "supabase/migrations/20261001124250_teacher_insight_learning_context.sql",
    "sha256": "ae41ddc4471445a928f46a6a04c392e32b76fdebaeb1df77ab8d0d00a1247eba"
  },
  {
    "path": "supabase/migrations/20261001125823_insight_current_source_scope.sql",
    "sha256": "b997e601b59c8160535c55d737911ba5c8891cbfb2fc49ab871ce50865f092b8"
  },
  {
    "path": "supabase/migrations/20261001205816_actionable_insight_saved_source_authority.sql",
    "sha256": "cdb28e2306b699a7e45e070d5e99bc26d2fce9c435b5b5d31449512a243953c6"
  },
  {
    "path": "supabase/migrations/20261002023742_intelligence_native_context.sql",
    "sha256": "621533f1d39c19dfb44d1d93e71b1bab5fbe871caf6e0660719e7ecb9b229f2f"
  },
  {
    "path": "supabase/migrations/20261002025837_intelligence_published_content_provenance.sql",
    "sha256": "12f84578136dc5aa594d367ec932e8229750bfcbf42a2e1816c1b5a8aed367e1"
  }
];
// These lock the unchanged published Git blobs. The first two earlier hashes
// (c7669b2b... / 3105db64...) recorded mixed-CRLF primary checkout bytes;
// normalizing only CRLF to LF yields the canonical hashes above. Both parent
// branches and the pre-integration ancestor contain these exact canonical blobs.
describe.skipIf(process.env.CUEVO_REQUIRE_INTEGRATION !== '1')('teacher insight exact context selection parity', () => {
  let context: CustomerContext;
  beforeAll(async () => {
    context = await createCustomerContext();
    for (const source of sourceHashes) expect(createHash('sha256').update(await readFile(source.path)).digest('hex')).toBe(source.sha256);
    // Exact original context bodies reconstructed only from the hash-locked applied sources above.
    await context.client.query(`create function pg_temp.original_native_insight_context(baseline_id uuid)returns jsonb language plpgsql security definer set search_path=''as $$declare school uuid:="authorization".school_id();baseline internal.improvement_result_sources;course app.courses;reference app.school_custom_references;recent jsonb;observations jsonb;options jsonb;answer jsonb;begin
 perform internal.intelligence_context(baseline_id);select*into baseline from internal.improvement_result_sources where school_id=school and id=baseline_id;select c.*into course from app.assessments assessment join app.courses c on c.school_id=assessment.school_id and c.id=assessment.course_id where assessment.school_id=school and assessment.id=baseline.assessment_id;select*into reference from app.school_custom_references where school_id=school and id=baseline.reference_id;
 if baseline.model is distinct from'rubric'or course.id is null or not"authorization".can_read_course(school,course.id)or not"authorization".programme_course_allowed(school,course.id,baseline.learner_id)then raise exception 'Native insight source denied'using errcode='42501';end if;
 select coalesce(jsonb_agg(source order by priority,created_at desc,id),'[]'::jsonb)into recent from(select result.id,result.created_at,case when result.id=baseline_id then 0 else 1 end priority,jsonb_build_object('resultId',result.id,'evidenceId',result.evidence_id,'referenceId',result.reference_id,'referenceVersion',result.reference_version,'nativeResult',result.native_result)source from internal.improvement_result_sources result join app.assessments assessment on assessment.school_id=result.school_id and assessment.id=result.assessment_id where result.school_id=school and result.learner_id=baseline.learner_id and result.model='rubric'and assessment.course_id=course.id and result.reference_id=baseline.reference_id and result.reference_version=baseline.reference_version and internal.native_academic_source_allowed(school,result.id,true)order by(result.id=baseline_id)desc,result.created_at desc,result.id limit 10)bounded;
 select coalesce(jsonb_agg(source order by occurred_at desc,id),'[]'::jsonb)into observations from(select observed.id,observed.occurred_at,jsonb_build_object('id',observed.id,'kind',observed.kind,'sourceObjectId',observed.source_object_id,'sourceEventId',observed.source_event_id,'occurredAt',observed.occurred_at)source from internal.authorized_observation_sources(school,baseline.learner_id,clock_timestamp()-interval '14 days',null)authorized join app.habit_observations observed on observed.school_id=school and observed.id=authorized.id and observed.source_event_id=authorized.source_event_id where internal.observation_source_allowed(school,observed.id)and((observed.source_type='ACTIVITY_COMPLETION'and exists(select 1 from app.activity_completions completion join app.activities activity on activity.school_id=completion.school_id and activity.id=completion.activity_id join app.lessons lesson on lesson.school_id=activity.school_id and lesson.id=activity.lesson_id join app.units unit on unit.school_id=lesson.school_id and unit.id=lesson.unit_id where completion.school_id=school and completion.id=observed.source_object_id and unit.course_id=course.id))or(observed.source_type='SUBMISSION_REVISION'and exists(select 1 from app.submissions submission join app.assessments assessment on assessment.school_id=submission.school_id and assessment.id=submission.assessment_id where submission.school_id=school and submission.id=observed.source_object_id and assessment.course_id=course.id)))order by observed.occurred_at desc,observed.id limit 20)bounded;
 select coalesce(jsonb_agg(source order by sequence,id),'[]'::jsonb)into options from(select activity.id,activity.sequence,jsonb_build_object('activityId',activity.id,'title',activity.title,'instructions',activity.instructions,'kind',activity.kind)source from app.activities activity join app.lessons lesson on lesson.school_id=activity.school_id and lesson.id=activity.lesson_id join app.units unit on unit.school_id=lesson.school_id and unit.id=lesson.unit_id where activity.school_id=school and unit.course_id=course.id and course.status='PUBLISHED'and activity.kind in('practice','reflection','reading')and length(activity.instructions)<=4000 order by activity.sequence,activity.id limit 10)bounded;
 options:=internal.insight_published_options(school,course.id);answer:=jsonb_build_object('schemaVersion','1','learnerId',baseline.learner_id,'courseId',course.id,'classId',course.class_id,'reference',jsonb_build_object('id',reference.id,'version',baseline.reference_version,'title',reference.title),'recentResults',recent,'observations',observations,'priorInterventions','[]'::jsonb,'learningOptions',options,'coverage','BOUNDED_AUTHORIZED_CONTEXT');if octet_length(answer::text)>65536 then raise exception 'Native context requires smaller source'using errcode='22023';end if;return answer;
end$$;`);
    await context.client.query(`create function pg_temp.original_teacher_insight_context(baseline_id uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare school uuid:="authorization".school_id();baseline app.result_revisions;course app.courses;reference app.school_custom_references;recent jsonb;observations jsonb;prior jsonb;options jsonb;answer jsonb;window_days integer;
begin
 if exists(select 1 from internal.improvement_result_sources native where native.school_id="authorization".school_id()and native.id=baseline_id and native.model='rubric')then return pg_temp.original_native_insight_context(baseline_id);end if;perform internal.intelligence_context(baseline_id);
 select*into baseline from app.result_revisions where school_id=school and id=baseline_id;
 select c.*into course from app.assessments a join app.courses c on c.school_id=a.school_id and c.id=a.course_id where a.school_id=school and a.id=baseline.assessment_id;
 if not"authorization".can_read_course(school,course.id)or not"authorization".programme_course_allowed(school,course.id,baseline.learner_id)then raise exception 'Insight course denied'using errcode='42501';end if;
 select development_window_days into window_days from app.learner_state_policies where school_id=school;select*into reference from app.school_custom_references where school_id=school and id=baseline.reference_id;
 select coalesce(jsonb_agg(source order by created_at desc,id),'[]'::jsonb)into recent from(
  select r.id,r.created_at,jsonb_build_object('resultId',r.id,'evidenceId',r.evidence_id,'referenceId',r.reference_id,'referenceVersion',r.reference_version,'score',r.score,'maxScore',r.max_score)source
  from app.current_results current_result join app.result_revisions r on r.school_id=current_result.school_id and r.id=current_result.result_id join app.assessments a on a.school_id=r.school_id and a.id=r.assessment_id
  where r.school_id=school and r.learner_id=baseline.learner_id and a.course_id=course.id and r.reference_id=baseline.reference_id and r.reference_version=baseline.reference_version and r.max_score=baseline.max_score and internal.insight_result_allowed(school,r.id,baseline.learner_id,course.id,baseline.reference_id,baseline.reference_version,true)
  order by(r.id=baseline_id)desc,r.created_at desc,r.id limit 10
 )bounded;
 select coalesce(jsonb_agg(source order by occurred_at desc,id),'[]'::jsonb)into observations from(
  select o.id,o.occurred_at,jsonb_build_object('id',o.id,'kind',o.kind,'sourceObjectId',o.source_object_id,'sourceEventId',o.source_event_id,'occurredAt',o.occurred_at)source
  from app.habit_observations o join internal.processed_events pe on pe.school_id=o.school_id and pe.event_id=o.source_event_id join internal.authorized_observation_sources(school,baseline.learner_id,clock_timestamp()-make_interval(days=>window_days),null)authorized_observation on authorized_observation.id=o.id and authorized_observation.source_event_id=o.source_event_id and authorized_observation.kind=o.kind and authorized_observation.occurred_at=o.occurred_at
  where o.school_id=school and o.learner_id=baseline.learner_id and window_days is not null and o.occurred_at>=clock_timestamp()-make_interval(days=>window_days)
  and((o.source_type='ACTIVITY_COMPLETION'and exists(select 1 from app.activity_completions completion join app.activities activity on activity.school_id=completion.school_id and activity.id=completion.activity_id join app.lessons lesson on lesson.school_id=activity.school_id and lesson.id=activity.lesson_id join app.units unit on unit.school_id=lesson.school_id and unit.id=lesson.unit_id where completion.school_id=school and completion.id=o.source_object_id and completion.learner_id=baseline.learner_id and unit.course_id=course.id))or(o.source_type='SUBMISSION_REVISION'and exists(select 1 from app.submissions s join app.assessments a on a.school_id=s.school_id and a.id=s.assessment_id where s.school_id=school and s.id=o.source_object_id and s.learner_id=baseline.learner_id and a.course_id=course.id)))
  order by o.occurred_at desc,o.id limit 20
 )bounded;
 select coalesce(jsonb_agg(source order by created_at desc,id),'[]'::jsonb)into prior from(
  select i.id,i.created_at,jsonb_build_object('id',i.id,'status',i.status,'baselineResultId',i.baseline_result_id,'outcome',case when outcome.id is null then null else jsonb_build_object('id',outcome.id,'status',outcome.status,'difference',outcome.difference,'minimumChange',outcome.minimum_change,'baselineResultId',outcome.baseline_result_id,'followUpResultId',outcome.follow_up_result_id)end)source
  from app.interventions i join app.result_revisions r on r.school_id=i.school_id and r.id=i.baseline_result_id join app.assessments a on a.school_id=r.school_id and a.id=r.assessment_id left join app.outcome_measurements outcome on outcome.school_id=i.school_id and outcome.intervention_id=i.id and exists(select 1 from app.result_revisions followup join app.assessments followup_assessment on followup_assessment.school_id=followup.school_id and followup_assessment.id=followup.assessment_id where followup.school_id=school and followup.id=outcome.follow_up_result_id and followup.learner_id=baseline.learner_id and followup.reference_id=r.reference_id and followup.reference_version=r.reference_version and followup.max_score=r.max_score and followup_assessment.id=i.follow_up_assessment_id and followup_assessment.course_id=course.id and"authorization".programme_course_allowed(school,followup_assessment.course_id,baseline.learner_id))
  where i.school_id=school and i.learner_id=baseline.learner_id and a.course_id=course.id and internal.insight_result_allowed(school,r.id,baseline.learner_id,course.id,baseline.reference_id,baseline.reference_version,true) and not exists(select 1 from app.outcome_measurements prior_outcome where prior_outcome.school_id=i.school_id and prior_outcome.intervention_id=i.id and not internal.insight_outcome_allowed(school,prior_outcome.id,baseline.learner_id,course.id,baseline.reference_id,baseline.reference_version)) and(i.follow_up_assessment_id is null or exists(select 1 from app.assessments reassessment where reassessment.school_id=school and reassessment.id=i.follow_up_assessment_id and reassessment.course_id=course.id and"authorization".programme_course_allowed(school,reassessment.course_id,baseline.learner_id))) and r.reference_id=baseline.reference_id and r.reference_version=baseline.reference_version
  order by i.created_at desc,i.id limit 10
 )bounded;
 select coalesce(jsonb_agg(source order by sequence,id),'[]'::jsonb)into options from(
  select activity.id,activity.sequence,jsonb_build_object('activityId',activity.id,'title',activity.title,'instructions',activity.instructions,'kind',activity.kind)source from app.activities activity join app.lessons lesson on lesson.school_id=activity.school_id and lesson.id=activity.lesson_id join app.units unit on unit.school_id=lesson.school_id and unit.id=lesson.unit_id
  where activity.school_id=school and unit.course_id=course.id and course.status='PUBLISHED'and activity.kind in('practice','reflection','reading')and length(activity.instructions)<=4000 order by activity.sequence,activity.id limit 10
 )bounded;
 options:=internal.insight_published_options(school,course.id);answer:=jsonb_build_object('schemaVersion','1','learnerId',baseline.learner_id,'courseId',course.id,'classId',course.class_id,'reference',jsonb_build_object('id',reference.id,'version',baseline.reference_version,'title',reference.title),'recentResults',recent,'observations',observations,'priorInterventions',prior,'learningOptions',options,'coverage','BOUNDED_AUTHORIZED_CONTEXT');
 if octet_length(answer::text)>65536 then raise exception 'Insight requires smaller context'using errcode='22023';end if;return answer;
end$$;`);
    await context.client.query('revoke execute on function pg_temp.original_teacher_insight_context(uuid),pg_temp.original_native_insight_context(uuid)from public');
    await context.client.query(`create function pg_temp.current_teacher_insight_context(target uuid)returns jsonb language sql security definer set search_path=''as $$select internal.teacher_insight_context(target)$$`);
    await context.client.query('revoke execute on function pg_temp.current_teacher_insight_context(uuid)from public');
    await context.client.query('grant execute on function pg_temp.original_teacher_insight_context(uuid),pg_temp.current_teacher_insight_context(uuid)to cuevo_api');
  }, 60000);
  afterAll(async () => { await context?.close(); });

  async function compare(baseline: string) {
    await context.client.query('SAVEPOINT context_parity_read'); await context.client.query('set local role cuevo_api');
    try {
      await context.client.query("set local statement_timeout='5s'");
      await context.client.query("select set_config('app.actor_id',$1,true),set_config('app.school_id',$2,true)", [customerActor(4), context.school]);
      const expected = (await context.client.query('select pg_temp.original_teacher_insight_context($1)context', [baseline])).rows[0].context;
      const current = (await context.client.query('select pg_temp.current_teacher_insight_context($1)context', [baseline])).rows[0].context;
      expect(current).toEqual(expected); expect(insightContextSchema.safeParse(current).success).toBe(true);
      expect(current.recentResults.some((row: { resultId: string }) => row.resultId === baseline)).toBe(true);
      expect(current.recentResults.length).toBeLessThanOrEqual(10); return current;
    } finally { await context.client.query('ROLLBACK TO SAVEPOINT context_parity_read'); await context.client.query('RELEASE SAVEPOINT context_parity_read'); }
  }

  it('preserves complete numeric/context/published option meaning and selects valid results after denied rows', async () => {
    const course = await customerCourse(context, 'Insight source parity');
    const sources: Awaited<ReturnType<typeof customerReleased>>[] = [];
    for (let index = 0; index < 4; index++) sources.push(await customerReleased(context, 'strong', course.courseId, 'Original source ' + index, index));
    await context.drain(); const baseline = sources[0];
    const initial = await compare(baseline.resultId); expect(initial.recentResults).toHaveLength(4);
    expect(initial.learningOptions).toEqual(expect.arrayContaining([expect.objectContaining({ activityId: course.practiceId, instructions: 'Explain one step, then check it.', contentRevisionId: expect.any(String), contentRevision: expect.any(Number) })]));
    const draftSource = (await context.request('teacher', '/v1/learning-content/activity/' + course.practiceId)).json();
    const draft = await context.command('teacher', '/v1/learning-content/activity/' + course.practiceId + '/draft', { resource: 'activity', title: draftSource.title, content: 'A newly published exact instruction.', kind: 'practice', assessmentId: null, expectedRevision: draftSource.revision, reason: 'Current teacher edits the source.' });
    expect((await compare(baseline.resultId)).learningOptions).toEqual(initial.learningOptions);
    const published=await context.command('teacher', '/v1/learning-content/activity/' + course.practiceId + '/publish', { expectedRevision: draft.revision, confirmPublication: true });
    expect((await compare(baseline.resultId)).learningOptions).toEqual(expect.arrayContaining([expect.objectContaining({ activityId: course.practiceId, instructions: 'A newly published exact instruction.', contentRevision: published.revision })]));

    // All later sources are genuine released records in another current learner's class context.
    // Scalar candidate filtering must reject these before private helper work, never lose the older selected learner.
    for (let index = 0; index < 3; index++) await customerReleased(context, 'observed', course.courseId, 'Other learner later source ' + index, 2);
    const after = await compare(baseline.resultId); expect(after.recentResults.map((row: { resultId: string }) => row.resultId).sort()).toEqual(sources.map(source => source.resultId).sort());
    const proposal = await context.command('teacher', '/v1/intelligence/analyze', { baselineResultId: baseline.resultId });
    const saved = (await context.request('teacher', '/v1/intelligence/runs/' + proposal.intelligenceRunId + '/context')).json().context;
    expect(saved).toEqual(after); // Context source fields, not a rebuilt top-N guess.
    await context.client.query('SAVEPOINT denied_before_top_ten');
    try {
      const denied: Awaited<ReturnType<typeof customerReleased>>[]=[];
      for(let index=0;index<11;index++)denied.push(await customerReleased(context,'strong',course.courseId,'Later source with withdrawn current submission '+index,2));
      // Explicit mutable current-pointer withdrawal fixture; immutable result/evidence history remains intact.
      await context.client.query('delete from app.current_submissions where school_id=$1 and submission_id=any($2::uuid[])',[context.school,denied.map(source=>source.submissionId)]);
      await context.client.query('SAVEPOINT actual_context_read');await context.client.query('set local role cuevo_api');
      await context.client.query("set local statement_timeout='5s'");await context.client.query("select set_config('app.actor_id',$1,true),set_config('app.school_id',$2,true)",[customerActor(4),context.school]);
      const actual=(await context.client.query('select pg_temp.current_teacher_insight_context($1)context',[baseline.resultId])).rows[0].context;
      await context.client.query('ROLLBACK TO SAVEPOINT actual_context_read');await context.client.query('RELEASE SAVEPOINT actual_context_read');
      expect(actual.recentResults.map((row:{resultId:string})=>row.resultId).sort()).toEqual(sources.map(source=>source.resultId).sort());
      expect(actual.recentResults.some((row:{resultId:string})=>denied.some(source=>source.resultId===row.resultId))).toBe(false);
    } finally {await context.client.query('ROLLBACK TO SAVEPOINT denied_before_top_ten');}
    await context.client.query('SAVEPOINT withdrawn_current_source');
    try {
      await context.client.query("update app.enrollments set status='revoked'where school_id=$1 and student_actor_id=$2", [context.school, customerActor(12)]);
      expect((await context.request('teacher', '/v1/intelligence/analyze', { baselineResultId: baseline.resultId })).statusCode).toBe(403);
      expect((await context.request('teacher', '/v1/intelligence/runs/' + proposal.intelligenceRunId + '/context')).statusCode).toBe(403);
    } finally { await context.client.query('ROLLBACK TO SAVEPOINT withdrawn_current_source'); }
  }, 180000);

  it('preserves native rubric descriptors, exact published revisions and source denial without scalar facts', async () => {
    const course = await customerCourse(context, 'Native context parity');
    const rubric = await context.command('teacher', '/v1/rubrics', { courseId: course.courseId, title: 'Checking source criterion', version: 'context-native-v1', criteria: [{ key: 'check', title: 'Checking', levels: [{ key: 'shown', label: 'Shown', description: 'Show a checking step.' }, { key: 'connected', label: 'Connected', description: 'Connect the checking step.' }] }] });
    const ids: string[] = [];
    for (let index = 0; index < 3; index++) {
      const assessment = await context.command('teacher', '/v1/assessments', { courseId: course.courseId, title: 'Native source ' + index, instructions: 'Explain a check.', maxScore: 10 });
      await context.command('teacher', '/v1/assessments/' + assessment.id + '/rubric', { rubricId: rubric.id, expectedPolicyVersion: 1 });
      await context.command('teacher', '/v1/assessments/' + assessment.id + '/reference', { referenceId: context.referenceId, expectedPolicyVersion: 2 });
      const submission = await context.command('observed', '/v1/assessments/' + assessment.id + '/submissions', { content: 'Synthetic native explanation.' });
      const mark = await context.command('teacher', '/v1/submissions/' + submission.id + '/results', { nativeResult: { type: 'rubric', rubricId: rubric.id, criteria: [{ criterionKey: 'check', levelKey: index ? 'connected' : 'shown' }] }, feedback: 'Reviewed native checking evidence.', expectedPolicyVersion: 3, expectedRevision: 0, sourceEvidence: true });
      const released = await context.command('teacher', '/v1/results/' + mark.id + '/release', { expectedRevision: 1, parentVisible: false }); ids.push(released.id);
    }
    await context.drain(); const current = await compare(ids[0]); expect(current.recentResults).toHaveLength(3); expect(current.priorInterventions).toEqual([]);
    for (const source of current.recentResults) { expect(source.nativeResult.type).toBe('rubric'); expect(source).not.toHaveProperty('score'); expect(source).not.toHaveProperty('maxScore'); }
    const policy = (await context.request('admin', '/v1/intelligence/policy')).json().policy;
    await context.command('admin', '/v1/intelligence/policy', { purpose: 'NEXT_LEARNING_ACTION', dataClassification: 'SCHOOL_CUSTOM_NATIVE', fixtureEnabled: true, liveEnabled: false, allowedActions: ['GUIDED_PRACTICE', 'REVIEW_FEEDBACK'], expectedVersion: policy.version, confirmApproval: true, reason: 'Explicit native fixture approval.' });
    const proposal = await context.command('teacher', '/v1/intelligence/analyze', { baselineResultId: ids[0] });
    expect((await context.request('teacher', '/v1/intelligence/runs/' + proposal.intelligenceRunId + '/context')).json().context).toEqual(current);
    expect((await context.request('parent', '/v1/intelligence/runs/' + proposal.intelligenceRunId + '/context')).statusCode).toBe(403);
  }, 90000);
});
