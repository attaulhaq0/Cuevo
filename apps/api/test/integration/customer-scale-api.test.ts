import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { config as dotenv } from 'dotenv';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { learnerStateSchema, classLearningSummarySchema } from '@cuevo/contracts';
import type {QueryResult}from'pg';
import { createCustomerContext, customerActor, customerCourse, customerReleased, type CustomerContext, type CustomerRole } from './customer-test-context';
import {CooperativeFixtureScope}from'./cooperative-fixture-scope';
import { collectScaleRequest, finalizeScaleFixture, settleScaleCase, type ScaleMeasurement } from './customer-scale-measurement';
import { scaleSetupFailure, type ScaleQueryFailure } from './scale-query-diagnostics';

dotenv({ path: '.env.local', quiet: true });
const enabled = process.env.CUEVO_REQUIRE_INTEGRATION === '1';
describe.skipIf(!enabled)('independent pilot scale and dirty-data API acceptance', () => {
  let context: CustomerContext; let measuredCourse: Awaited<ReturnType<typeof customerCourse>>;
  let caseContext:CustomerContext;let caseScope:CooperativeFixtureScope|undefined;let setupContext:CustomerContext;let setupScope:CooperativeFixtureScope|undefined;
  const caseBudgets:{budgetMs:number;completed:boolean}[]=[];
  function guardedContext(scope:CooperativeFixtureScope):CustomerContext{const guard=<T>(action:()=>PromiseLike<T>)=>scope.operation(action);const query=context.client.query.bind(context.client)as(sql:string,values?:unknown[])=>Promise<QueryResult>;return{...context,request:(...args)=>guard(()=>context.request(...args)),command:(...args)=>guard(()=>context.command(...args)),drain:()=>guard(()=>context.drain()),client:new Proxy(context.client,{get(target,key){if(key==='query')return(sql:string,values?:unknown[])=>guard(()=>query(sql,values));return Reflect.get(target,key);}})}as CustomerContext;}
  function runCase(budgetMs:number,work:()=>Promise<void>){const scope=new CooperativeFixtureScope(budgetMs);caseScope=scope;caseContext=guardedContext(scope);const status={budgetMs,completed:false};caseBudgets.push(status);return scope.run(async()=>{await work();status.completed=true;});}
  const measurements: ScaleMeasurement[] = []; const classIds: string[] = [];
  let passedCases = 0; let failedCases = 0;
  const setupPhases:{phase:string;elapsedMs:number;releasedSources:number;complete:boolean}[]=[];
  const setupCommands:{operation:string;durationMs:number;sourceIndex:number}[]=[];
  let setupStarted=0;let releasedSetupSources=0;let setupComplete=false;
  let setupQueryFailure:ScaleQueryFailure|null=null;
  async function recordSetup(phase:string,started:number,complete=true){const value={phase,elapsedMs:performance.now()-started,releasedSources:releasedSetupSources,complete};setupPhases.push(value);await mkdir('.local/customer-readiness',{recursive:true});await writeFile('.local/customer-readiness/pilot-scale-setup.json',JSON.stringify({status:complete?'IN_PROGRESS':'INCOMPLETE',scope:'SYNTHETIC_ROLLBACK_REAL_API_SETUP',requestBudgetMs:5000,setupDeadlineMs:180000,elapsedMs:performance.now()-setupStarted,phases:setupPhases,commands:setupCommands},null,2));console.log(`Scale setup ${phase}: ${Math.round(value.elapsedMs)}ms, ${releasedSetupSources}/100 released sources.`);}
  async function timedCommand(sourceIndex:number,operation:string,role:CustomerRole,path:string,body:Record<string,unknown>){const started=performance.now();setupQueryFailure=null;try{return await setupContext.command(role,path,body);}catch(error){try{console.log(JSON.stringify(scaleSetupFailure(sourceIndex,releasedSetupSources,operation,setupQueryFailure)));}catch{/* Diagnostic failure cannot replace the original setup assertion. */}throw error;}finally{setupCommands.push({operation,durationMs:performance.now()-started,sourceIndex});}}
  async function timedReleasedSetup(index:number){const assessment=await timedCommand(index,'assessment.create','teacher','/v1/assessments',{courseId:measuredCourse.courseId,title:`Pilot assessment ${index}`,instructions:'Explain the school-authored example.',maxScore:10});await timedCommand(index,'assessment.reference','teacher',`/v1/assessments/${assessment.id}/reference`,{referenceId:context.referenceId,expectedPolicyVersion:1});const submission=await timedCommand(index,'submission.create','strong',`/v1/assessments/${assessment.id}/submissions`,{content:'Synthetic source explanation.'});const marking=await timedCommand(index,'assessment.marked','teacher',`/v1/submissions/${submission.id}/results`,{score:index%11,feedback:'Teacher-reviewed native evidence.',expectedPolicyVersion:2,expectedRevision:0,sourceEvidence:true});await timedCommand(index,'result.released','teacher',`/v1/results/${marking.id}/release`,{expectedRevision:1,parentVisible:true});}
  beforeAll(() => {setupScope=new CooperativeFixtureScope(180000);const scope=setupScope;return scope.run(async () => {
    setupStarted=performance.now();let phaseStarted=setupStarted;let phase='identity_and_rollback_tenant';
    try{await scope.operation(async()=>{context=await createCustomerContext({scaleQueryFailure:failure=>{setupQueryFailure=failure;}});setupContext=guardedContext(scope);});await recordSetup(phase,phaseStarted);phase='population_500_learners_30_classes';phaseStarted=performance.now();
    classIds.push(context.classId, context.secondClassId);
    for (let index = 2; index < 30; index++) { const id = randomUUID(); classIds.push(id); await setupContext.client.query('insert into app.classes(school_id,id,academic_year_id,year_group_id,name)values($1,$2,$3,$4,$5)', [context.school, id, context.year, context.group, index % 2 ? 'Duplicate class' : `صف طويل ${index} — Unicode punctuation !`]); await setupContext.client.query("insert into app.teacher_assignments(school_id,class_id,subject_id,teacher_actor_id,effective_from)values($1,$2,$3,$4,now()-interval '1 day')", [context.school, id, context.subject, customerActor(4)]); }
    // Imported synthetic population has no Auth credentials; every academic source still uses real API commands.
    await setupContext.client.query("insert into app.memberships(school_id,actor_id,role,effective_from)select $1,gen_random_uuid(),'student',now()-interval '1 day'from generate_series(1,488)", [context.school]);
    await setupContext.client.query("insert into app.people(school_id,actor_id,display_name,synthetic)select m.school_id,m.actor_id,case when row_number()over(order by actor_id)%3=0 then repeat('اسم ',40)else 'Same name — punctuation & Unicode' end,true from app.memberships m where school_id=$1 and role='student'and not exists(select 1 from app.people p where p.school_id=m.school_id and p.actor_id=m.actor_id)", [context.school]);
    await setupContext.client.query("insert into app.enrollments(school_id,class_id,student_actor_id,effective_from)select $1,($2::uuid[])[((row_number()over(order by m.actor_id)-1)%cardinality($2::uuid[])+1)::integer],m.actor_id,now()-interval '1 day'from app.memberships m where m.school_id=$1 and m.role='student'and not exists(select 1 from app.enrollments e where e.school_id=m.school_id and e.student_actor_id=m.actor_id)",[context.school,classIds]);
    await recordSetup(phase,phaseStarted);phase='course_authoring_and_publication';phaseStarted=performance.now();measuredCourse = await customerCourse(setupContext, 'Pilot native evidence');await recordSetup(phase,phaseStarted);
    for (let chunk = 0; chunk < 10; chunk++){phase=`real_api_release_batch_${chunk*10+1}_${chunk*10+10}`;phaseStarted=performance.now();for(let offset=0;offset<10;offset++){await timedReleasedSetup(chunk*10+offset);releasedSetupSources++;}await recordSetup(phase,phaseStarted);}
    phase='worker_drain_100_released_sources';phaseStarted=performance.now();await setupContext.drain();await recordSetup(phase,phaseStarted);
    measurements.push({kind:'SETUP',operation:'fixture_setup_500_learners_100_real_released_sources',samples:1,medianMs:performance.now()-setupStarted,p95Ms:performance.now()-setupStarted,maxPayloadBytes:0,rows:100});
    await writeFile('.local/customer-readiness/pilot-scale-setup.json',JSON.stringify({status:'SETUP_COMPLETED',scope:'SYNTHETIC_ROLLBACK_REAL_API_SETUP',requestBudgetMs:5000,setupDeadlineMs:180000,elapsedMs:performance.now()-setupStarted,phases:setupPhases,commands:setupCommands},null,2));
    }catch(error){await recordSetup(phase,phaseStarted,false);throw error;}
    // This bounded setup deadline covers 500 academic API writes and worker drain, not a single product request.
  }).then(()=>{setupComplete=true;});}, 180_000);
  beforeEach(async () => { await context.client.query('SAVEPOINT scale_case'); });
  afterEach(async testContext => {
    const passed = testContext.task.result?.state === 'pass';
    try {
      await settleScaleCase({ passed, cleanup: [() => caseScope?.cancelAndWait(),
        ...(passed ? [] : [() => context.client.query('ROLLBACK TO SAVEPOINT scale_case')]),
        () => context.client.query('RELEASE SAVEPOINT scale_case')],
      recordPassed: () => { passedCases++; }, recordFailed: () => { failedCases++; } });
    } finally { caseScope = undefined; }
  });
  afterAll(async () => {
    await finalizeScaleFixture({ setupComplete, passedCases, failedCases, measurements,
      prepare: [() => setupScope?.cancelAndWait(), () => caseScope?.cancelAndWait(), () => context?.client.query('RESET ROLE')],
      captureFixture: async () => context ? {
        students: (await context.client.query("select count(*)::integer count from app.memberships where school_id=$1 and role='student'", [context.school])).rows[0].count,
        classes: (await context.client.query('select count(*)::integer count from app.classes where school_id=$1', [context.school])).rows[0].count,
        assessments: (await context.client.query('select count(*)::integer count from app.assessments where school_id=$1', [context.school])).rows[0].count,
        messages: (await context.client.query('select count(*)::integer count from app.community_posts where school_id=$1', [context.school])).rows[0].count,
        notifications: (await context.client.query('select count(*)::integer count from app.community_announcements where school_id=$1', [context.school])).rows[0].count,
      } : null,
      cleanup: [() => context?.close()],
      writeArtifact: async receipt => {
        await mkdir('.local/customer-readiness', { recursive: true });
        await writeFile('.local/customer-readiness/pilot-scale.json', JSON.stringify({ ...receipt, setupComplete, passedCases, failedCases,
          scope: 'SYNTHETIC_ROLLBACK_API', productionCertification: false,
          fixtureTarget: { students: 500, classes: 30, assessments: 100, messages: 1000, notifications: 1000 }, setupPhases, caseBudgets, measurements }, null, 2));
      },
    });
  });
  const measure = async (role: CustomerRole, path: string, operation: string, repeats = 7) => {
    const value = await collectScaleRequest({ operation, repeats, request: () => caseContext.request(role, path),
      now: () => performance.now(), record: measurement => { measurements.push(measurement); } });
    expect(value.complete,`${operation} requires every planned sample`).toBe(true);expect(value.p95Ms, `${operation} must remain within the established 5s request budget`).toBeLessThan(5000); return value;
  };
  const pageAll = async (role: CustomerRole, path: string) => {
    const ids: string[] = []; const cursors = new Set<string>(); let cursor: string | null = null;
    do { const response = await caseContext.request(role, `${path}${cursor ? `&cursor=${cursor}` : ''}`); expect(response.statusCode).toBe(200); expect(Buffer.byteLength(response.body)).toBeLessThan(500000); const page = response.json() as { items: { id: string }[]; nextCursor: string | null }; expect(page.items.length).toBeLessThanOrEqual(25); ids.push(...page.items.map(item => item.id)); cursor = page.nextCursor; if (cursor) { expect(cursors.has(cursor)).toBe(false); cursors.add(cursor); } } while (cursor);
    expect(new Set(ids).size).toBe(ids.length); return ids;
  };

  it('500 learners, 30 classes and 100 assessments preserve bounded paging and measured native class/state reads', () => runCase(120000,async () => {
    expect((await caseContext.client.query("select count(*)::integer count from app.memberships where school_id=$1 and role='student'", [caseContext.school])).rows[0].count).toBe(500);
    expect((await caseContext.client.query('select count(*)::integer count from app.classes where school_id=$1',[caseContext.school])).rows[0].count).toBe(30);
    expect((await caseContext.client.query('select count(*)::integer count from app.assessments where school_id=$1',[caseContext.school])).rows[0].count).toBe(100);
    const current = await caseContext.request('strong', `/v1/learners/${customerActor(12)}/state`); expect(current.statusCode).toBe(200); const state = learnerStateSchema.parse(current.json()); expect(state.academic).toHaveLength(100); expect(state.academic.every(item => item.nativeResult.normalized === null)).toBe(true);
    const reportIds = await pageAll('strong', `/v1/learners/${customerActor(12)}/academic-report?limit=25`); expect(reportIds).toHaveLength(100);
    const classResponse = await caseContext.request('coordinator', `/v1/classes/${caseContext.classId}/learning-summary?limit=25`); expect(classResponse.statusCode).toBe(200); const summary = classLearningSummarySchema.parse(classResponse.json()); expect(summary.coverage).toBe('NOT_ESTABLISHED'); expect(summary.items.length).toBeLessThanOrEqual(25); expect(summary.nextCursor).not.toBeNull();
    await measure('strong', `/v1/learners/${customerActor(12)}/state`, 'learner_state_100_native_records'); await measure('coordinator', `/v1/classes/${caseContext.classId}/learning-summary?limit=25`, 'class_evidence_25_of_500_learners'); await measure('teacher', '/v1/marking?limit=25', 'marking_page_100_assessments');
  }), 120_000);

  it('1000 messages and 1000 approved notifications paginate uniquely without widened parent or peer access', () => runCase(60000,async () => {
    const room = await caseContext.command('teacher', '/v1/community/rooms', { classId: caseContext.classId, name: 'Pilot discussion', type: 'CLASS', memberIds: [] });
    // Historical volume is seeded through typed source tables in this rollback fixture; API mutations remain rate-limited.
    await caseContext.client.query("insert into app.community_posts(school_id,room_id,actor_id,body,created_at)select $1,$2,$3,'Synthetic historical message '||n,clock_timestamp()-make_interval(secs=>n)from generate_series(1,1000)n", [caseContext.school, room.id, customerActor(4)]);
    await caseContext.client.query("insert into app.community_announcements(school_id,class_id,title,body,parent_visible,actor_id)select $1,$2,'Synthetic notification '||n,'School-approved synthetic notice.',true,$3 from generate_series(1,1000)n", [caseContext.school, caseContext.classId, customerActor(4)]);
    const posts = await pageAll('strong', `/v1/community/rooms/${room.id}/posts?limit=25`); expect(posts).toHaveLength(1000);
    const notices = await pageAll('parent', '/v1/community/notifications?limit=25'); expect(notices).toHaveLength(1000);
    expect((await caseContext.request('parent', `/v1/community/rooms/${room.id}/posts?limit=25`)).statusCode).toBe(403);
    await measure('strong', `/v1/community/rooms/${room.id}/posts?limit=25`, 'community_page_1000_messages'); await measure('parent', '/v1/community/notifications?limit=25', 'parent_notification_page_1000_notices');
    const post = await caseContext.command('strong', `/v1/community/rooms/${room.id}/posts`, { body: 'A real API source after the large history.', replyToId: posts[0] }); expect(post.id).toEqual(expect.any(String));
    const excess = await caseContext.request('strong', `/v1/community/rooms/${room.id}/posts`, { body: 'x'.repeat(4001), replyToId: null }); expect(excess.statusCode).toBe(400); await caseContext.drain();
  }), 60_000);

  it('a new source beyond the old academic bound is processed and explicitly disclosed rather than poisoning state', () => runCase(30000,async () => {
    const latest = await customerReleased(caseContext, 'strong', measuredCourse.courseId, 'Record after the first hundred', 0); const started = performance.now(); await caseContext.drain(); measurements.push({ kind: 'WORKER_DRAIN', operation: 'worker_new_source_after_100_results', samples: 1, medianMs: performance.now() - started, p95Ms: performance.now() - started, maxPayloadBytes: 0, rows: 1 });
    const response = await caseContext.request('strong', `/v1/learners/${customerActor(12)}/state`); expect(response.statusCode).toBe(200); const state = learnerStateSchema.parse(response.json()); expect(state.academic).toHaveLength(100); expect(state.academic.some(item => item.resultId === latest.resultId)).toBe(true); expect(state.projection?.academic).toMatchObject({ totalCount: 101, returnedCount: 100, truncated: true });
    expect(await pageAll('strong', `/v1/learners/${customerActor(12)}/academic-report?limit=25`)).toHaveLength(101);
    expect((await caseContext.client.query("select count(*)::integer count from internal.outbox_events where school_id=$1 and state<>'COMPLETED'", [caseContext.school])).rows[0].count).toBe(0);
  }), 30_000);
  it('1001 verified observations retain exact counts and bounded source IDs while new events continue processing', () => runCase(120000,async () => {
    const actions = await caseContext.client.query("insert into app.activities(school_id,lesson_id,title,kind,instructions,sequence)select $1,$2,'Observed synthetic practice '||n,'practice','School-defined action.',n+10 from generate_series(1,1001)n returning id", [caseContext.school, measuredCourse.lessonId]);
    const sources: { completion: string; event: string }[] = [];
    for (const action of actions.rows) {
      const completion = randomUUID(); const event = randomUUID(); sources.push({ completion, event });
      await caseContext.client.query('insert into app.activity_completions(school_id,id,activity_id,learner_id)values($1,$2,$3,$4)', [caseContext.school, completion, action.id, customerActor(12)]);
      await caseContext.client.query("insert into internal.outbox_events(school_id,id,actor_id,type,entity_type,entity_id,version,metadata,deduplication_key,state,completed_at)values($1,$2::uuid,$3,'activity.complete','activity',$4,1,'{}',$2::text,'COMPLETED',clock_timestamp())", [caseContext.school, event, customerActor(12), completion]);
      await caseContext.client.query("insert into internal.processed_events(event_id,school_id,source_type,source_id)values($1,$2,'COMPLETION',$3)", [event, caseContext.school, completion]);
      await caseContext.client.query("insert into app.habit_observations(school_id,learner_id,kind,source_type,source_object_id,occurred_at,source_event_id)select $1,$2,'practice','ACTIVITY_COMPLETION',$3,completed_at,$4 from app.activity_completions where school_id=$1 and id=$3", [caseContext.school, customerActor(12), completion, event]);
    }
    // Historical fixture rows are newer than the last processed snapshot window. A real new event refreshes it.
    const next = await caseContext.command('teacher', `/v1/lessons/${measuredCourse.lessonId}/activities`, { title: 'New practice after 1001 sources', kind: 'practice', instructions: 'Still authorized.', sequence: 2000 }); await caseContext.command('strong', `/v1/activities/${next.id}/complete`, {}); await caseContext.drain();
    const readStart = performance.now(); const updated = await caseContext.request('strong', `/v1/learners/${customerActor(12)}/state`); expect(performance.now() - readStart).toBeLessThan(5000); expect(updated.statusCode).toBe(200); const state = learnerStateSchema.parse(updated.json()); expect(state.development.practice.count).toBe(1002); expect(state.development.practice.observationIds).toHaveLength(1000); expect(state.projection?.observations.practice).toMatchObject({ totalCount: 1002, returnedCount: 1000, truncated: true });
    expect((await caseContext.client.query("select count(*)::integer count from internal.outbox_events where school_id=$1 and state<>'COMPLETED'", [caseContext.school])).rows[0].count).toBe(0);
    expect(sources).toHaveLength(1001); await measure('strong', `/v1/learners/${customerActor(12)}/state`, 'state_1001_observed_sources');
  }), 120_000);
});
