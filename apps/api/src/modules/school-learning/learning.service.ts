import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { DomainError, requireCapability, type ActorContext } from '@cuevo/domain';
import { activityInputSchema, assessmentInputSchema, assessmentPreparationSchema,assessmentPublishSchema,completionInputSchema, courseInputSchema, courseDetailQuerySchema, idempotencyKeySchema, lessonInputSchema, paginationSchema, publishInputSchema, submissionInputSchema, submissionDraftSchema, submissionReturnSchema, resubmissionInputSchema, submissionCloseSchema, assessmentAvailabilitySchema, quizDefinitionSchema, quizPublishSchema, quizAttemptSchema, unitInputSchema } from '@cuevo/contracts';
import { z } from 'zod';
import type { Database } from '../../platform/database/database';
import{validateCourseAssessmentCommand}from'../curriculum/public';

const courseFields = 'id,class_id as "classId",subject_id as "subjectId",title,description,status,created_at as "createdAt"';
const assessmentFields = 'id,course_id as "courseId",title,instructions,max_score::float8 as "maxScore",model,status,due_at as "dueAt",policy_version as "policyVersion",available_from as "availableFrom",available_until as "availableUntil",allow_late as "allowLate",assignment_state as "assignmentState",availability_version as "availabilityVersion",submission_kind as "submissionKind",preparation_version as "preparationVersion",intended_submission_kind as "intendedSubmissionKind",intended_model as "intendedModel",academic_reference_id as "referenceId",internal.read_assessment_rubric_identity(school_id,id)as "rubricId"';
const completionFields = 'id,activity_id as "activityId",learner_id as "learnerId",completed_at as "completedAt",reflection';
const submissionFields = 's.id,s.assessment_id as "assessmentId",s.learner_id as "learnerId",s.content,coalesce(cs.state,s.status)as status,s.revision,s.submitted_at as "submittedAt",s.previous_submission_id as "previousSubmissionId",s.return_id as "sourceReturnId",a.title as "assessmentTitle",p.display_name as "learnerName",ret.id as "returnId",ret.feedback as "returnFeedback",ret.created_at as "returnedAt"';
const submissionFrom='app.submissions s join app.assessments a on a.school_id=s.school_id and a.id=s.assessment_id join app.people p on p.school_id=s.school_id and p.actor_id=s.learner_id left join app.current_submissions cs on cs.school_id=s.school_id and cs.submission_id=s.id left join app.submission_returns ret on ret.school_id=s.school_id and ret.submission_id=s.id';
const allowedReaders = ['admin','coordinator','teacher','student','parent'] as const;
const allowedAuthors = ['admin','teacher'] as const;
export type LearningCommand = 'course.create'|'course.publish'|'unit.create'|'lesson.create'|'activity.create'|'activity.complete'|'assessment.create'|'assessment.preparation'|'assessment.publish'|'assessment.availability'|'submission.create'|'submission.draft'|'submission.return'|'submission.resubmit'|'submission.close'|'quiz.create'|'quiz.publish'|'quiz.submit';
const schemas = { 'course.create': courseInputSchema, 'course.publish': publishInputSchema, 'unit.create': unitInputSchema, 'lesson.create': lessonInputSchema, 'activity.create': activityInputSchema, 'activity.complete': completionInputSchema, 'assessment.create': assessmentInputSchema,'assessment.preparation':assessmentPreparationSchema,'assessment.publish':assessmentPublishSchema, 'assessment.availability':assessmentAvailabilitySchema,'submission.create': submissionInputSchema,'submission.draft':submissionDraftSchema,'submission.return':submissionReturnSchema,'submission.resubmit':resubmissionInputSchema,'submission.close':submissionCloseSchema,'quiz.create':quizDefinitionSchema,'quiz.publish':quizPublishSchema,'quiz.submit':quizAttemptSchema };
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new DomainError('INVALID_INPUT',400,'Review the supplied fields.');
  return result.data;
}
function notFound(): never { throw new DomainError('LEARNING_NOT_FOUND',404,'The learning item is unavailable for your current access.'); }
function learningReadFailure(error:unknown):never{if(error instanceof DomainError)throw error;const code=typeof error==='object'&&error!==null&&'code'in error?String(error.code):'';if(code==='42501')throw new DomainError('FORBIDDEN',403,'Your current access does not permit this learning view.');if(code==='22023')throw new DomainError('LEARNING_CONFLICT',409,'The learning item is unavailable or requires review.');throw new DomainError('REQUEST_UNAVAILABLE',503,'School learning is temporarily unavailable.');}

export class SchoolLearningService {
  constructor(private readonly database: Database) {}
  async assessment(actor:ActorContext,id:string){
    requireCapability(actor,actor.schoolId,'assessment',allowedReaders);parse(z.uuid(),id);
    try{return await this.database.actorTransaction(actor.userId,actor.schoolId,async client=>{
      const item=(await client.query(`select ${assessmentFields} from app.assessments where school_id=$1 and id=$2`,[actor.schoolId,id])).rows[0];if(!item)throw new DomainError('FORBIDDEN',403,'The assessment is unavailable for current access.');
      item.courseTitle=(await client.query('select title from app.courses where school_id=$1 and id=$2',[actor.schoolId,item.courseId])).rows[0]?.title??null;
      if(item.model==='rubric')delete item.maxScore;
      if(actor.role==='student'){const sources=(await client.query('select internal.read_own_assessment_submissions($1::uuid[])as items',[[id]])).rows[0]?.items as Record<string,unknown>[];if(!Array.isArray(sources))throw new DomainError('REQUEST_UNAVAILABLE',503,'Current work could not be confirmed.');item.currentSubmission=sources[0]??null;}
      return item;
    });}catch(error){learningReadFailure(error);}
  }
  async list(actor: ActorContext, resource: 'classes'|'people'|'subjects'|'courses'|'assessments'|'submissions', query: unknown) {
    requireCapability(actor,actor.schoolId,resource==='assessments'||resource==='submissions'?'assessment':'learning',resource==='submissions'?['admin','teacher','student']:allowedReaders);
    const page = parse(paginationSchema,query);
    if(resource==='submissions')return this.database.actorTransaction(actor.userId,actor.schoolId,async client=>{
      const response=(await client.query('select internal.read_submission_page($1,$2,$3)as page',[page.limit,page.cursor??null,null])).rows[0]?.page as{items:Record<string,unknown>[];nextCursor:string|null}|undefined;
      if(!response||!Array.isArray(response.items))throw new DomainError('REQUEST_UNAVAILABLE',503,'The current submission page is temporarily unavailable.');return response;
    });
    const entries = {
      classes: { select:'class.id,class.name,class.year_group_id as "yearGroupId",year_group.name as "yearGroupName",academic_year.name as "academicYearName"', from:'app.classes class join app.year_groups year_group on year_group.school_id=class.school_id and year_group.id=class.year_group_id join app.academic_years academic_year on academic_year.school_id=class.school_id and academic_year.id=class.academic_year_id', id:'class.id' },
      subjects: { select:'id,name', from:'app.subjects', id:'id' },
      people: { select:`p.actor_id as "userId",p.display_name as "displayName",m.role,coalesce((select array_agg(label order by label)from(select distinct class.name||' · '||year.name label from app.enrollments enrollment join app.classes class on class.school_id=enrollment.school_id and class.id=enrollment.class_id join app.academic_years year on year.school_id=class.school_id and year.id=class.academic_year_id where enrollment.school_id=p.school_id and enrollment.student_actor_id=p.actor_id and enrollment.status='active'and enrollment.effective_from<=now()and(enrollment.effective_to is null or enrollment.effective_to>now())and class.status='active'and"authorization".can_view_class(p.school_id,class.id)order by label limit 20)labels),array[]::text[])as "classLabels"`, from:'app.people p join app.memberships m on m.school_id=p.school_id and m.actor_id=p.actor_id', id:'p.actor_id' },
      courses: { select:courseFields, from:'app.courses', id:'id' },
      assessments: { select:'(select course.title from app.courses course where course.school_id=a.school_id and course.id=a.course_id)as "courseTitle",a.id,a.course_id as "courseId",a.title,a.instructions,a.max_score::float8 as "maxScore",a.model,a.status,a.due_at as "dueAt",a.policy_version as "policyVersion",a.available_from as "availableFrom",a.available_until as "availableUntil",a.allow_late as "allowLate",a.assignment_state as "assignmentState",a.availability_version as "availabilityVersion",a.submission_kind as "submissionKind",a.preparation_version as "preparationVersion",a.intended_submission_kind as "intendedSubmissionKind",a.intended_model as "intendedModel",a.academic_reference_id as "referenceId",internal.read_assessment_rubric_identity(a.school_id,a.id)as "rubricId"', from:'app.assessments a', id:'a.id' },
    }[resource];
    return this.database.actorTransaction(actor.userId,actor.schoolId,async client => {
      const rows = (await client.query(`select ${entries.select} from ${entries.from} where ($1::uuid is null or ${entries.id}>$1::uuid)${resource==='courses'?" and internal.learning_content_visible('course',id)":''} order by ${entries.id} limit $2`,[page.cursor??null,page.limit+1])).rows;
      let more=rows.length>page.limit; let items=rows.slice(0,page.limit).map(row=>{if(resource==='assessments'&&row.model==='rubric'){const native={...row};delete native.maxScore;return native;}return row;});
      if(resource==='courses'&&items.length){const current=(await client.query('select internal.read_learning_content_set($1::jsonb)as items',[JSON.stringify(items.map(item=>({resource:'course',id:item.id})))])).rows[0]?.items as Record<string,unknown>[];if(!Array.isArray(current))notFound();const byId=new Map(current.map(item=>[item.sourceId,item]));items=items.map(item=>{const content=byId.get(item.id);if(!content)notFound();return{...item,title:content.title,description:content.content,contentRevision:content.revision,contentState:content.state};});}
      if(resource==='assessments'){
        if(actor.role==='student'&&items.length){
          const sources=(await client.query('select internal.read_own_assessment_submissions($1::uuid[])as items',[items.map(item=>item.id)])).rows[0]?.items as Record<string,unknown>[]|undefined;
          if(!Array.isArray(sources))throw new DomainError('REQUEST_UNAVAILABLE',503,'Your current assignment work is temporarily unavailable.');
          const byAssessment=new Map(sources.map(source=>[source.assessmentId,source]));items=items.map(item=>({...item,currentSubmission:byAssessment.get(item.id)??null}));
        }
        // Keep whole sources; ordinary long essays shorten the page rather than look unsubmitted.
        let bytes=Buffer.byteLength(JSON.stringify({items:[],nextCursor:'0'.repeat(36)}));const bounded:Record<string,unknown>[]=[];
        for(const item of items){const size=Buffer.byteLength(JSON.stringify(item))+(bounded.length?1:0);if(bytes+size>500000){if(!bounded.length)throw new DomainError('LEARNING_DETAIL_TOO_LARGE',413,'This assignment requires smaller content.');more=true;break;}bounded.push(item);bytes+=size;}
        items=bounded;
      }
      return { items,nextCursor:more?String(items[items.length-1]?.[resource==='people'?'userId':'id']):null };
    });
  }
  async submissionHistory(actor:ActorContext,id:string,query:unknown){
    requireCapability(actor,actor.schoolId,'assessment',['admin','teacher','student']);parse(z.uuid(),id);const page=parse(paginationSchema,query);
    return this.database.actorTransaction(actor.userId,actor.schoolId,async client=>{const response=(await client.query('select internal.read_submission_page($1,$2,$3)as page',[page.limit,page.cursor??null,id])).rows[0]?.page as{items:Record<string,unknown>[];nextCursor:string|null}|undefined;if(!response||!Array.isArray(response.items))throw new DomainError('REQUEST_UNAVAILABLE',503,'The submission history page is temporarily unavailable.');return response;});
  }
  async draft(actor:ActorContext,id:string){requireCapability(actor,actor.schoolId,'assessment',['student']);parse(z.uuid(),id);return this.database.actorTransaction(actor.userId,actor.schoolId,async client=>{await client.query('select internal.require_assessment_available($1)',[id]);const row=(await client.query('select id,assessment_id as "assessmentId",content,revision,updated_at as "updatedAt" from app.submission_drafts where assessment_id=$1',[id])).rows[0];return row?{...row,status:'DRAFT'}:{id:null,assessmentId:id,content:'',revision:0,status:'DRAFT',updatedAt:null};});}
  async quiz(actor:ActorContext,id:string,author:boolean){requireCapability(actor,actor.schoolId,'assessment',author?['admin','teacher']:['admin','coordinator','teacher','student']);parse(z.uuid(),id);try{return await this.database.actorTransaction(actor.userId,actor.schoolId,async client=>{if(!author)return(await client.query('select internal.read_published_quiz($1)as quiz',[id])).rows[0]?.quiz;const rows=(await client.query('select id,assessment_id as "assessmentId",version,questions,created_at as "createdAt",exists(select 1 from app.published_quizzes pq where pq.school_id=q.school_id and pq.quiz_id=q.id)as published from app.quiz_versions q where assessment_id=$1 order by created_at desc,id limit 31',[id])).rows;if(rows.length>30)throw new DomainError('LEARNING_DETAIL_TOO_LARGE',413,'This quiz history requires a smaller view.');return{items:rows,nextCursor:null};});}catch(error){learningReadFailure(error);}}
  async quizAttempts(actor:ActorContext,id:string,query:unknown){requireCapability(actor,actor.schoolId,'assessment',['admin','teacher','student']);parse(z.uuid(),id);const page=parse(paginationSchema,query);return this.database.actorTransaction(actor.userId,actor.schoolId,async client=>{const rows=(await client.query('select id,quiz_id as "quizId",assessment_id as "assessmentId",learner_id as "learnerId",submission_id as "submissionId",checked_answers as "checkedAnswers",created_at as "createdAt",\'CHECKED_NOT_GRADED\'as status from app.quiz_attempts where assessment_id=$1 and($2::uuid is null or id>$2)order by id limit $3',[id,page.cursor??null,page.limit+1])).rows;const items=rows.slice(0,page.limit);return{items,nextCursor:rows.length>page.limit?String(items[items.length-1]?.id):null};});}
  async detail(actor: ActorContext,id: string,query:unknown={}) {
    requireCapability(actor,actor.schoolId,'learning',allowedReaders); parse(z.uuid(),id);
    const page=parse(courseDetailQuerySchema,query);
    return this.database.actorTransaction(actor.userId,actor.schoolId,async client => {
      const course=(await client.query(`select ${courseFields} from app.courses where id=$1 and internal.learning_content_visible('course',id)`,[id])).rows[0]; if(!course)notFound();
      const unitAnchor=page.unitCursor?(await client.query('select sequence,id from app.units where course_id=$1 and id=$2 and internal.learning_content_visible(\'unit\',id)',[id,page.unitCursor])).rows[0]:null;if(page.unitCursor&&!unitAnchor)notFound();
      const unitRows=(await client.query('select unit.id,unit.title,unit.sequence,coalesce((select max(sequence)+1 from app.lessons where unit_id=unit.id),1)as "nextLessonSequence"from app.units unit where unit.course_id=$1 and internal.learning_content_visible(\'unit\',unit.id)and($2::integer is null or(unit.sequence,unit.id)>($2,$3::uuid))order by unit.sequence,unit.id limit $4',[id,unitAnchor?.sequence??null,unitAnchor?.id??null,page.limit+1])).rows;
      const units=unitRows.slice(0,page.limit).map(unit=>({...unit,lessons:[]as Record<string,unknown>[] }));
      const selected=page.unitId?(await client.query('select id,title,sequence,coalesce((select max(sequence)+1 from app.lessons where unit_id=unit.id),1)as "nextLessonSequence"from app.units unit where course_id=$1 and id=$2 and internal.learning_content_visible(\'unit\',unit.id)',[id,page.unitId])).rows[0]:units[0];if(page.unitId&&!selected)notFound();
      if(selected&&!units.some(unit=>unit.id===selected.id))units.unshift({...selected,lessons:[]});
      let nextLessonCursor:string|null=null;
      if(selected){
        const anchor=page.lessonCursor?(await client.query('select id,sequence from app.lessons where unit_id=$1 and id=$2 and internal.learning_content_visible(\'lesson\',id)',[selected.id,page.lessonCursor])).rows[0]:null;if(page.lessonCursor&&!anchor)notFound();
        const rows=(await client.query('select id,title,sequence,body,status from app.lessons where unit_id=$1 and internal.learning_content_visible(\'lesson\',id)and($2::integer is null or(sequence,id)>($2,$3::uuid))order by sequence,id limit $4',[selected.id,anchor?.sequence??null,anchor?.id??null,page.limit+1])).rows;
        const lessons=rows.slice(0,page.limit).map(lesson=>({...lesson,activities:[]as Record<string,unknown>[] }));
        if(rows.length>page.limit)nextLessonCursor=String(lessons.at(-1)!.id);
        if(lessons.length){
          const activities=(await client.query('select activity.id,activity.lesson_id,activity.title,activity.kind,activity.instructions,activity.sequence,case when $2::boolean then(select jsonb_build_object(\'id\',completion.id,\'completedAt\',completion.completed_at)from app.activity_completions completion where completion.school_id=activity.school_id and completion.activity_id=activity.id and completion.learner_id=$3)else null end as completion from app.activities activity where activity.lesson_id=any($1::uuid[])and internal.learning_content_visible(\'activity\',activity.id)order by activity.lesson_id,activity.sequence,activity.id limit 1001',[lessons.map(lesson=>lesson.id),actor.role==='student',actor.userId])).rows;
          if(activities.length>1000)throw new DomainError('LEARNING_DETAIL_TOO_LARGE',413,'This lesson page has too many activities. Review a smaller learning unit.');
          for(const lesson of lessons)lesson.activities=activities.filter(activity=>activity.lesson_id===lesson.id).map(activity=>{const row={...activity};delete row.lesson_id;return row;});
        }
        units.find(unit=>unit.id===selected.id)!.lessons=lessons;
      }
      const targets=[{resource:'course',id},...units.flatMap(unit=>[{resource:'unit',id:unit.id},...unit.lessons.flatMap((lesson:Record<string,unknown>)=>[{resource:'lesson',id:lesson.id},...(lesson.activities as Record<string,unknown>[]).map(activity=>({resource:'activity',id:activity.id}))])])];
      const contents=(await client.query('select internal.read_learning_content_set($1::jsonb)as items',[JSON.stringify(targets)])).rows[0]?.items as Record<string,unknown>[];if(!Array.isArray(contents))notFound();const contentMap=new Map(contents.map(item=>[String(item.resource)+':'+String(item.sourceId),item]));const courseContent=contentMap.get('course:'+id);if(!courseContent)notFound();course.title=courseContent.title;course.description=courseContent.content;course.contentRevision=courseContent.revision;course.contentState=courseContent.state;
      for(const unit of units){const content=contentMap.get('unit:'+unit.id);if(!content)notFound();unit.title=content.title;unit.contentRevision=content.revision;unit.contentState=content.state;for(const lesson of unit.lessons as Record<string,unknown>[]){const content=contentMap.get('lesson:'+lesson.id);if(!content)notFound();lesson.title=content.title;lesson.body=content.content;lesson.contentRevision=content.revision;lesson.contentState=content.state;for(const activity of lesson.activities as Record<string,unknown>[]){const content=contentMap.get('activity:'+activity.id);if(!content)notFound();activity.title=content.title;activity.instructions=content.content;activity.kind=content.kind;activity.assessmentId=content.assessmentId;activity.contentRevision=content.revision;activity.contentState=content.state;}}}
      const nextUnitSequence=(await client.query('select coalesce(max(sequence)+1,1)sequence from app.units where course_id=$1',[id])).rows[0].sequence;
      const result={...course,units,selectedUnitId:selected?.id??null,nextUnitCursor:unitRows.length>page.limit?String(unitRows[page.limit-1].id):null,nextLessonCursor,nextUnitSequence};
      if(['admin','coordinator'].includes(actor.role)&&actor.entitlements.includes('curriculum')){
        const context=(await client.query('select version,programme_id as "programmeId",reference_id as "referenceId"from app.programme_course_contexts where school_id=$1 and course_id=$2',[actor.schoolId,id])).rows[0];
        Object.assign(result,{curriculumContext:context??{version:1,programmeId:null,referenceId:null}});
      }
      if(Buffer.byteLength(JSON.stringify(result))>500000)throw new DomainError('LEARNING_DETAIL_TOO_LARGE',413,'This learning page requires smaller lesson content.');return result;
    });
  }
  async command(actor:ActorContext,command:LearningCommand,targetId:string|undefined,body:unknown,key:unknown,requestId:string){
    requireCapability(actor,actor.schoolId,command.startsWith('assessment')||command.startsWith('submission')||command.startsWith('quiz')?'assessment':'learning',['activity.complete','submission.create','submission.draft','submission.resubmit','quiz.submit'].includes(command)?['student']:allowedAuthors);
    const input=parse(schemas[command] as z.ZodType<Record<string,unknown>>,body); const idempotency=parse(idempotencyKeySchema,key);
    if(targetId!==undefined)parse(z.uuid(),targetId);
    const fingerprint=createHash('sha256').update(JSON.stringify({command,targetId:targetId??null,input})).digest('hex');
    try{return await this.database.actorTransaction(actor.userId,actor.schoolId,async client=>{
      await this.authorizeCommand(client,actor,command,targetId,input);
      if(command!=='course.create'){
        const course=command==='assessment.create'?input.courseId:['course.publish','unit.create'].includes(command)?targetId:command==='lesson.create'?(await client.query('select "authorization".unit_course($1,$2)as id',[actor.schoolId,targetId])).rows[0]?.id:['activity.create'].includes(command)?(await client.query('select "authorization".lesson_course($1,$2)as id',[actor.schoolId,targetId])).rows[0]?.id:command==='activity.complete'?(await client.query('select "authorization".activity_course($1,$2)as id',[actor.schoolId,targetId])).rows[0]?.id:['submission.resubmit','submission.return','submission.close'].includes(command)?(await client.query('select assessment.course_id as id from app.submissions submission join app.assessments assessment on assessment.school_id=submission.school_id and assessment.id=submission.assessment_id where submission.school_id=$1 and submission.id=$2',[actor.schoolId,targetId])).rows[0]?.id:(await client.query('select "authorization".assessment_course($1,$2)as id',[actor.schoolId,targetId])).rows[0]?.id;
        if(!course)notFound();await client.query('select internal.require_curriculum_academic_write($1)',[course]);if(['assessment.create','assessment.preparation','assessment.publish'].includes(command))await validateCourseAssessmentCommand(client,String(course),command,input,targetId);
      }
      if(['submission.create','submission.draft','quiz.submit'].includes(command))await client.query('select internal.require_assessment_available($1)',[targetId]);
      if(command==='submission.resubmit'){const source=(await client.query('select assessment_id from app.submissions where id=$1 and learner_id=$2',[targetId,actor.userId])).rows[0];if(!source)notFound();await client.query('select internal.require_assessment_available($1)',[source.assessment_id]);}
      const reservation=(await client.query<{state:string;response:unknown}>('select internal.begin_command($1,$2,$3) as reservation',[idempotency,command,fingerprint])).rows[0] as unknown as {reservation:{state:string;response:unknown}};
      if(reservation.reservation.state==='COMPLETED')return reservation.reservation.response;
      if(reservation.reservation.state!=='NEW')throw new DomainError('COMMAND_IN_PROGRESS',409,'This operation is already in progress. Retry with the same key.');
      const result=await this.execute(client,actor,command,targetId,input);
      if(command.startsWith('assessment.')&&result.model==='rubric')delete result.maxScore;
      const entityId=String(result.id);
      await client.query('select internal.append_audit($1,$2,$3,$4,$5,$6::jsonb)',[command,command.split('.')[0],entityId,requestId,'succeeded','{}']);
      const eventKey=createHash('sha256').update(`${actor.userId}:${command}:${idempotency}`).digest('hex');
      const event=command==='submission.draft'?'submission.draft_saved':command==='submission.return'?'submission.returned':command==='submission.resubmit'?'submission.resubmitted':command==='submission.close'?'submission.closed':command==='quiz.create'?'quiz.created':command==='quiz.publish'?'quiz.published':command==='quiz.submit'?'quiz.submitted':command;
      const entityType=command==='submission.return'?'submission_return':command==='submission.close'?'submission_closure':command==='quiz.submit'?'quiz_attempt':command.split('.')[0];
      await client.query('select internal.enqueue_event($1,$2,$3,$4,$5::jsonb,$6)',[event,entityType,entityId,Number(result.revision??1),JSON.stringify({schoolAuthored:true}),eventKey]);
      await client.query('select internal.finish_command($1,$2,$3,$4::jsonb)',[idempotency,command,fingerprint,JSON.stringify(result)]);
      return result;
    });}catch(error){
      if(error instanceof DomainError)throw error;
      const code=typeof error==='object'&&error!==null&&'code'in error?String(error.code):'';
      if(code==='42501')throw new DomainError('FORBIDDEN',403,'Your current access does not permit this action.');
      if(code==='22023'||code==='23505'||code==='55000')throw new DomainError('LEARNING_CONFLICT',409,'This operation conflicts with an existing record or request.');
      if(code==='23503'||code==='23514'||code==='23502')throw new DomainError('INVALID_INPUT',400,'Review the supplied learning configuration.');
      throw new DomainError('REQUEST_UNAVAILABLE',503,'School learning is temporarily unavailable.');
    }
  }
  private async authorizeCommand(client:PoolClient,actor:ActorContext,command:LearningCommand,target:string|undefined,input:Record<string,unknown>):Promise<void>{
    const helper=command==='course.create'?'"authorization".can_teach_subject($1,$2,$3)':command==='activity.complete'?'"authorization".can_learn_course($1,"authorization".activity_course($1,$2))':['submission.create','submission.draft','quiz.submit'].includes(command)?'"authorization".can_learn_course($1,"authorization".assessment_course($1,$2))':command==='submission.resubmit'?'exists(select 1 from app.submissions s where s.school_id=$1 and s.id=$2 and s.learner_id="authorization".actor_id()and"authorization".can_learn_course($1,"authorization".assessment_course($1,s.assessment_id)))':['submission.return','submission.close'].includes(command)?'"authorization".can_mark_submission($1,$2)':command.startsWith('assessment.')&&command!=='assessment.create'||command.startsWith('quiz')?'"authorization".can_manage_course($1,"authorization".assessment_course($1,$2))':command==='unit.create'||command==='course.publish'||command==='assessment.create'?'"authorization".can_manage_course($1,$2)':command==='lesson.create'?'"authorization".can_manage_course($1,"authorization".unit_course($1,$2))':'"authorization".can_manage_course($1,"authorization".lesson_course($1,$2))';
    const args=command==='course.create'?[actor.schoolId,input.classId,input.subjectId]:[actor.schoolId,command==='assessment.create'?input.courseId:target];
    const capability=command.startsWith('assessment')||command.startsWith('submission')||command.startsWith('quiz')?'assessment':'learning';
    const result=await client.query<{allowed:boolean}>(`select (${helper}) and "authorization".has_entitlement($1,'${capability}') as allowed`,args);
    if(result.rows[0]?.allowed!==true)throw new DomainError('FORBIDDEN',403,'Your current access does not permit this action.');
  }
  private async execute(client:PoolClient,actor:ActorContext,command:LearningCommand,target:string|undefined,input:Record<string,unknown>):Promise<Record<string,unknown>>{
    const school=actor.schoolId;
    const row=async(sql:string,values:unknown[])=>{const result=(await client.query(sql,values)).rows[0];if(!result)notFound();return result as Record<string,unknown>;};
    switch(command){
      case 'course.create':return row(`insert into app.courses(school_id,class_id,subject_id,created_by,title,description) values($1,$2,$3,$4,$5,$6) returning ${courseFields}`,[school,input.classId,input.subjectId,actor.userId,input.title,input.description]);
      case 'course.publish':return row(`update app.courses set status='PUBLISHED' where school_id=$1 and id=$2 returning ${courseFields}`,[school,target]);
      case 'unit.create':return row('insert into app.units(school_id,course_id,title,sequence,content_preparation) values($1,$2,$3,$4,$5) returning id,title,sequence',[school,target,input.title,input.sequence,input.preparation??false]);
      case 'lesson.create':return row('insert into app.lessons(school_id,unit_id,title,sequence,body,content_preparation) values($1,$2,$3,$4,$5,$6) returning id,title,sequence,body,status',[school,target,input.title,input.sequence,input.body,input.preparation??false]).then(result=>({...result,activities:[]}));
      case 'activity.create':return row('insert into app.activities(school_id,lesson_id,title,kind,instructions,sequence,content_preparation) values($1,$2,$3,$4,$5,$6,$7) returning id,title,kind,instructions,sequence',[school,target,input.title,input.kind,input.instructions,input.sequence,input.preparation??false]);
      case 'activity.complete':return row(`insert into app.activity_completions(school_id,activity_id,learner_id,reflection) values($1,$2,$3,$4) returning ${completionFields}`,[school,target,actor.userId,input.reflection??null]);
      case 'assessment.create':return row(`insert into app.assessments(school_id,course_id,created_by,title,instructions,max_score,due_at,status,assignment_state,intended_submission_kind,intended_model) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning ${assessmentFields.replace('internal.read_assessment_rubric_identity(school_id,id)','null::uuid ')}`,[school,input.courseId,actor.userId,input.title,input.instructions,input.maxScore,input.dueAt??null,input.preparation?'DRAFT':'PUBLISHED',input.preparation?'CLOSED':'OPEN',input.intendedSubmissionKind??'TEXT',input.intendedModel??'numeric']);
      case 'assessment.preparation':await client.query('select internal.prepare_assessment($1,$2,$3,$4,$5,$6,$7,$8)',[target,input.title,input.instructions,input.dueAt,input.maxScore,input.referenceId,input.rubricId,input.expectedPreparationVersion]);return row(`select ${assessmentFields} from app.assessments where id=$1`,[target]);
      case 'assessment.publish':await client.query('select internal.publish_prepared_assessment($1,$2,$3,$4)',[target,input.expectedPreparationVersion,input.expectedPolicyVersion,input.expectedAvailabilityVersion]);return row(`select ${assessmentFields} from app.assessments where id=$1`,[target]);
      case 'submission.create':{
        const submitted=await row('select internal.create_learning_submission($1,$2)as id',[target,input.content]);
        return row(`select ${submissionFields} from ${submissionFrom} where s.id=$1`,[submitted.id]);
      }
      case 'submission.draft':{const saved=await row('select internal.save_submission_draft($1,$2,$3)as id',[target,input.content,input.expectedRevision]);return row('select id,assessment_id as "assessmentId",content,revision,updated_at as "updatedAt",\'DRAFT\'as status from app.submission_drafts where id=$1',[saved.id]);}
      case 'submission.return':{const saved=await row('select internal.return_learning_submission($1,$2,$3)as id',[target,input.feedback,input.expectedRevision]);return row('select id,submission_id as "submissionId",assessment_id as "assessmentId",learner_id as "learnerId",source_revision as "sourceRevision",feedback,actor_id as "actorId",created_at as "createdAt",\'RETURNED\'as status from app.submission_returns where id=$1',[saved.id]);}
      case 'submission.resubmit':{const saved=await row('select internal.resubmit_learning_submission($1,$2,$3,$4)as id',[target,input.returnId,input.content,input.expectedRevision]);return row(`select ${submissionFields} from ${submissionFrom} where s.id=$1`,[saved.id]);}
      case 'submission.close':{const saved=await row('select internal.close_learning_submission($1,$2)as id',[target,input.expectedRevision]);return row('select id,submission_id as "submissionId",learner_id as "learnerId",created_at as "createdAt",\'CLOSED\'as status from app.submission_closures where id=$1',[saved.id]);}
      case 'assessment.availability':await client.query('select internal.configure_assessment_availability($1,$2,$3,$4,$5,$6)',[target,input.availableFrom,input.availableUntil,input.allowLate,input.state,input.expectedAvailabilityVersion]);return row(`select ${assessmentFields} from app.assessments where id=$1`,[target]);
      case 'quiz.create':{const saved=await row('select internal.create_quiz_version($1,$2,$3::jsonb)as id',[target,input.version,JSON.stringify(input.questions)]);return row('select id,assessment_id as "assessmentId",version,questions,created_at as "createdAt",false as published from app.quiz_versions where id=$1',[saved.id]);}
      case 'quiz.publish':await client.query('select internal.publish_quiz_version($1,$2,$3)',[target,input.quizId,input.expectedPolicyVersion]);return row('select id,assessment_id as "assessmentId",version,true as published from app.quiz_versions where id=$1',[input.quizId]);
      case 'quiz.submit':{const saved=await row('select internal.submit_quiz_attempt($1,$2,$3::jsonb)as id',[target,input.quizId,JSON.stringify(input.answers)]);return row('select id,quiz_id as "quizId",assessment_id as "assessmentId",learner_id as "learnerId",submission_id as "submissionId",checked_answers as "checkedAnswers",created_at as "createdAt",\'CHECKED_NOT_GRADED\'as status from app.quiz_attempts where id=$1',[saved.id]);}
    }
  }
}
