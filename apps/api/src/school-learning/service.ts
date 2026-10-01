import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { DomainError, requireCapability, type ActorContext } from '@cuevo/domain';
import { activityInputSchema, assessmentInputSchema, completionInputSchema, courseInputSchema, idempotencyKeySchema, lessonInputSchema, paginationSchema, publishInputSchema, submissionInputSchema, unitInputSchema } from '@cuevo/contracts';
import { z } from 'zod';
import type { Database } from '../database/database';

const courseFields = 'id,class_id as "classId",subject_id as "subjectId",title,description,status,created_at as "createdAt"';
const assessmentFields = 'id,course_id as "courseId",title,instructions,max_score::float8 as "maxScore",status,due_at as "dueAt",policy_version as "policyVersion"';
const completionFields = 'id,activity_id as "activityId",learner_id as "learnerId",completed_at as "completedAt",reflection';
const submissionFields = 's.id,s.assessment_id as "assessmentId",s.learner_id as "learnerId",s.content,s.status,s.revision,s.submitted_at as "submittedAt",a.title as "assessmentTitle",p.display_name as "learnerName"';
const allowedReaders = ['admin','coordinator','teacher','student','parent'] as const;
const allowedAuthors = ['admin','teacher'] as const;
export type LearningCommand = 'course.create'|'course.publish'|'unit.create'|'lesson.create'|'activity.create'|'activity.complete'|'assessment.create'|'submission.create';
const schemas = { 'course.create': courseInputSchema, 'course.publish': publishInputSchema, 'unit.create': unitInputSchema, 'lesson.create': lessonInputSchema, 'activity.create': activityInputSchema, 'activity.complete': completionInputSchema, 'assessment.create': assessmentInputSchema, 'submission.create': submissionInputSchema };
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new DomainError('INVALID_INPUT',400,'Review the supplied fields.');
  return result.data;
}
function notFound(): never { throw new DomainError('LEARNING_NOT_FOUND',404,'The learning item is unavailable for your current access.'); }

export class SchoolLearningService {
  constructor(private readonly database: Database) {}
  async list(actor: ActorContext, resource: 'classes'|'people'|'subjects'|'courses'|'assessments'|'submissions', query: unknown) {
    requireCapability(actor,actor.schoolId,resource==='assessments'||resource==='submissions'?'assessment':'learning',resource==='submissions'?['admin','teacher','student']:allowedReaders);
    const page = parse(paginationSchema,query);
    const entries = {
      classes: { select:'id,name,year_group_id as "yearGroupId"', from:'app.classes', id:'id' },
      subjects: { select:'id,name', from:'app.subjects', id:'id' },
      people: { select:'p.actor_id as "userId",p.display_name as "displayName",m.role', from:'app.people p join app.memberships m on m.school_id=p.school_id and m.actor_id=p.actor_id', id:'p.actor_id' },
      courses: { select:courseFields, from:'app.courses', id:'id' },
      assessments: { select:assessmentFields, from:'app.assessments', id:'id' },
      submissions: { select:submissionFields, from:'app.submissions s join app.assessments a on a.school_id=s.school_id and a.id=s.assessment_id join app.people p on p.school_id=s.school_id and p.actor_id=s.learner_id', id:'s.id' },
    }[resource];
    return this.database.actorTransaction(actor.userId,actor.schoolId,async client => {
      const rows = (await client.query(`select ${entries.select} from ${entries.from} where ($1::uuid is null or ${entries.id}>$1::uuid) order by ${entries.id} limit $2`,[page.cursor??null,page.limit+1])).rows;
      const more=rows.length>page.limit; const items=rows.slice(0,page.limit);
      return { items,nextCursor:more?String(items[items.length-1]?.[resource==='people'?'userId':'id']):null };
    });
  }
  async detail(actor: ActorContext,id: string) {
    requireCapability(actor,actor.schoolId,'learning',allowedReaders); parse(z.uuid(),id);
    return this.database.actorTransaction(actor.userId,actor.schoolId,async client => {
      const course=(await client.query(`select ${courseFields} from app.courses where id=$1`,[id])).rows[0]; if(!course)notFound();
      const units=(await client.query('select id,title,sequence from app.units where course_id=$1 order by sequence,id limit 101',[id])).rows;
      let total=units.length;let bytes=0;
      const budget=()=>{if(total>100||bytes>500000)throw new DomainError('LEARNING_DETAIL_TOO_LARGE',413,'This course is too large to open as one view. Ask its teacher to divide the content.');};
      budget();
      for(const unit of units){
        unit.lessons=(await client.query('select id,title,sequence,body,status from app.lessons where unit_id=$1 order by sequence,id limit $2',[unit.id,101-total])).rows;
        total+=unit.lessons.length;bytes+=Buffer.byteLength(JSON.stringify(unit.lessons));budget();
        for(const lesson of unit.lessons){lesson.activities=(await client.query('select id,title,kind,instructions,sequence from app.activities where lesson_id=$1 order by sequence,id limit $2',[lesson.id,101-total])).rows;total+=lesson.activities.length;bytes+=Buffer.byteLength(JSON.stringify(lesson.activities));budget();}
      }
      return {...course,units};
    });
  }
  async command(actor:ActorContext,command:LearningCommand,targetId:string|undefined,body:unknown,key:unknown,requestId:string){
    requireCapability(actor,actor.schoolId,command.startsWith('assessment')||command.startsWith('submission')?'assessment':'learning',command==='activity.complete'||command==='submission.create'?['student']:allowedAuthors);
    const input=parse(schemas[command] as z.ZodType<Record<string,unknown>>,body); const idempotency=parse(idempotencyKeySchema,key);
    if(targetId!==undefined)parse(z.uuid(),targetId);
    const fingerprint=createHash('sha256').update(JSON.stringify({command,targetId:targetId??null,input})).digest('hex');
    try{return await this.database.actorTransaction(actor.userId,actor.schoolId,async client=>{
      await this.authorizeCommand(client,actor,command,targetId,input);
      const reservation=(await client.query<{state:string;response:unknown}>('select internal.begin_command($1,$2,$3) as reservation',[idempotency,command,fingerprint])).rows[0] as unknown as {reservation:{state:string;response:unknown}};
      if(reservation.reservation.state==='COMPLETED')return reservation.reservation.response;
      if(reservation.reservation.state!=='NEW')throw new DomainError('COMMAND_IN_PROGRESS',409,'This operation is already in progress. Retry with the same key.');
      const result=await this.execute(client,actor,command,targetId,input);
      const entityId=String(result.id);
      await client.query('select internal.append_audit($1,$2,$3,$4,$5,$6::jsonb)',[command,command.split('.')[0],entityId,requestId,'succeeded','{}']);
      const eventKey=createHash('sha256').update(`${actor.userId}:${command}:${idempotency}`).digest('hex');
      await client.query('select internal.enqueue_event($1,$2,$3,$4,$5::jsonb,$6)',[command,command.split('.')[0],entityId,1,JSON.stringify({schoolAuthored:true}),eventKey]);
      await client.query('select internal.finish_command($1,$2,$3,$4::jsonb)',[idempotency,command,fingerprint,JSON.stringify(result)]);
      return result;
    });}catch(error){
      if(error instanceof DomainError)throw error;
      const code=typeof error==='object'&&error!==null&&'code'in error?String(error.code):'';
      if(code==='42501')throw new DomainError('FORBIDDEN',403,'Your current access does not permit this action.');
      if(code==='22023'||code==='23505')throw new DomainError('LEARNING_CONFLICT',409,'This operation conflicts with an existing record or request.');
      if(code==='23503'||code==='23514'||code==='23502')throw new DomainError('INVALID_INPUT',400,'Review the supplied learning configuration.');
      throw new DomainError('REQUEST_UNAVAILABLE',503,'School learning is temporarily unavailable.');
    }
  }
  private async authorizeCommand(client:PoolClient,actor:ActorContext,command:LearningCommand,target:string|undefined,input:Record<string,unknown>):Promise<void>{
    const helper=command==='course.create'?'"authorization".can_teach_subject($1,$2,$3)':command==='activity.complete'?'"authorization".can_learn_course($1,"authorization".activity_course($1,$2))':command==='submission.create'?'"authorization".can_learn_course($1,"authorization".assessment_course($1,$2))':command==='unit.create'||command==='course.publish'||command==='assessment.create'?'"authorization".can_manage_course($1,$2)':command==='lesson.create'?'"authorization".can_manage_course($1,"authorization".unit_course($1,$2))':'"authorization".can_manage_course($1,"authorization".lesson_course($1,$2))';
    const args=command==='course.create'?[actor.schoolId,input.classId,input.subjectId]:[actor.schoolId,command==='assessment.create'?input.courseId:target];
    const capability=command==='assessment.create'||command==='submission.create'?'assessment':'learning';
    const result=await client.query<{allowed:boolean}>(`select (${helper}) and "authorization".has_entitlement($1,'${capability}') as allowed`,args);
    if(result.rows[0]?.allowed!==true)throw new DomainError('FORBIDDEN',403,'Your current access does not permit this action.');
  }
  private async execute(client:PoolClient,actor:ActorContext,command:LearningCommand,target:string|undefined,input:Record<string,unknown>):Promise<Record<string,unknown>>{
    const school=actor.schoolId;
    const row=async(sql:string,values:unknown[])=>{const result=(await client.query(sql,values)).rows[0];if(!result)notFound();return result as Record<string,unknown>;};
    switch(command){
      case 'course.create':return row(`insert into app.courses(school_id,class_id,subject_id,created_by,title,description) values($1,$2,$3,$4,$5,$6) returning ${courseFields}`,[school,input.classId,input.subjectId,actor.userId,input.title,input.description]);
      case 'course.publish':return row(`update app.courses set status='PUBLISHED' where school_id=$1 and id=$2 returning ${courseFields}`,[school,target]);
      case 'unit.create':return row('insert into app.units(school_id,course_id,title,sequence) values($1,$2,$3,$4) returning id,title,sequence',[school,target,input.title,input.sequence]);
      case 'lesson.create':return row('insert into app.lessons(school_id,unit_id,title,sequence,body) values($1,$2,$3,$4,$5) returning id,title,sequence,body,status',[school,target,input.title,input.sequence,input.body]).then(result=>({...result,activities:[]}));
      case 'activity.create':return row('insert into app.activities(school_id,lesson_id,title,kind,instructions,sequence) values($1,$2,$3,$4,$5,$6) returning id,title,kind,instructions,sequence',[school,target,input.title,input.kind,input.instructions,input.sequence]);
      case 'activity.complete':return row(`insert into app.activity_completions(school_id,activity_id,learner_id,reflection) values($1,$2,$3,$4) returning ${completionFields}`,[school,target,actor.userId,input.reflection??null]);
      case 'assessment.create':return row(`insert into app.assessments(school_id,course_id,created_by,title,instructions,max_score,due_at) values($1,$2,$3,$4,$5,$6,$7) returning ${assessmentFields}`,[school,input.courseId,actor.userId,input.title,input.instructions,input.maxScore,input.dueAt??null]);
      case 'submission.create':{
        const submitted=await row('insert into app.submissions(school_id,assessment_id,learner_id,content) values($1,$2,$3,$4) returning id',[school,target,actor.userId,input.content]);
        return row(`select ${submissionFields} from app.submissions s join app.assessments a on a.school_id=s.school_id and a.id=s.assessment_id join app.people p on p.school_id=s.school_id and p.actor_id=s.learner_id where s.id=$1`,[submitted.id]);
      }
    }
  }
}
