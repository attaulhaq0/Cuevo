import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { PoolClient } from 'pg';
import { DomainError, requireCapability, type ActorContext } from '@cuevo/domain';
import { referenceInputSchema, referenceLinkSchema, markingInputSchema, resultReleaseSchema, rubricInputSchema, assessmentRubricSchema, publishInputSchema, paginationSchema, idempotencyKeySchema, academicReportSchema } from '@cuevo/contracts';
import type { Database } from '../../platform/database/database';

const referenceFields = `r.id,r.title,r.code,v.version,r.status,v.source_type as "sourceType",r.created_by as "createdBy",r.approved_by as "approvedBy"`;
const rubricFields = `r.id,r.course_id as "courseId",r.title,r.version,r.criteria,r.source_type as "sourceType",r.created_by as "createdBy",r.created_at as "createdAt"`;
const markingFields = `m.id,m.submission_id as "submissionId",m.learner_id as "learnerId",m.revision,m.score::float8 as score,m.max_score::float8 as "maxScore",m.feedback,'REVIEW' as status,m.policy_version as "policyVersion",m.reference_id as "referenceId",'numeric' as model`;
const rubricMarkingFields = `m.id,m.submission_id as "submissionId",m.learner_id as "learnerId",m.revision,m.native_result as "nativeResult",m.feedback,'REVIEW' as status,m.policy_version as "policyVersion",m.reference_id as "referenceId",'rubric' as model`;
const resultFields = `r.id,r.submission_id as "submissionId",r.assessment_id as "assessmentId",r.learner_id as "learnerId",r.revision,r.score::float8 as score,r.max_score::float8 as "maxScore",r.feedback,'RELEASED' as status,r.policy_version as "policyVersion",r.reference_id as "referenceId",r.reference_version as "referenceVersion",r.evidence_id as "evidenceId",r.created_at as "createdAt",r.created_by as "actorId",r.parent_visible as "parentVisible",jsonb_build_object('type','numeric','score',r.score,'maxScore',r.max_score,'policyVersion',r.policy_version) as "nativeResult",a.title as "assessmentTitle",ref.title as "referenceTitle",'numeric' as model`;
const rubricResultFields = `r.id,r.submission_id as "submissionId",r.assessment_id as "assessmentId",r.learner_id as "learnerId",r.revision,null::float8 as score,null::float8 as "maxScore",r.feedback,'RELEASED' as status,r.policy_version as "policyVersion",r.reference_id as "referenceId",r.reference_version as "referenceVersion",r.evidence_id as "evidenceId",r.created_at as "createdAt",r.created_by as "actorId",r.parent_visible as "parentVisible",r.native_result as "nativeResult",a.title as "assessmentTitle",ref.title as "referenceTitle",'rubric' as model`;
const resultFrom = `app.result_revisions r join app.assessments a on a.school_id=r.school_id and a.id=r.assessment_id join app.school_custom_references ref on ref.school_id=r.school_id and ref.id=r.reference_id`;
const rubricResultFrom = `app.rubric_result_revisions r join app.assessments a on a.school_id=r.school_id and a.id=r.assessment_id join app.school_custom_references ref on ref.school_id=r.school_id and ref.id=r.reference_id`;
const evidenceFields = `id,source_type as "sourceType",source_object_id as "sourceObjectId",learner_id as "learnerId",actor_id as "actorId",created_at as "createdAt",quality,reference_id as "referenceId",reference_version as "referenceVersion",policy_version as "policyVersion",result_id as "resultId",revision,case when parent_visible then 'PARENT_APPROVED'else 'LEARNER_PRIVATE'end as visibility,review_status as "reviewStatus"`;
export type AcademicCommand = 'reference.create' | 'reference.approve' | 'assessment.reference' | 'rubric.create' | 'assessment.rubric' | 'marking.create' | 'result.release';
const schemas = { 'reference.create': referenceInputSchema, 'reference.approve': publishInputSchema, 'assessment.reference': referenceLinkSchema, 'rubric.create': rubricInputSchema, 'assessment.rubric': assessmentRubricSchema, 'marking.create': markingInputSchema, 'result.release': resultReleaseSchema };
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new DomainError('INVALID_INPUT', 400, 'Review the supplied academic fields.');
  return result.data;
}
function unavailable(): never { throw new DomainError('ACADEMIC_NOT_FOUND', 404, 'The academic record is unavailable for your current access.'); }
/** Rubric branches must never leak a placeholder assessment maximum as a native grade. */
function nativeResponse(row: Record<string, unknown>): Record<string, unknown> {
  if (row.model !== 'rubric') return row;
  const copy = { ...row }; delete copy.score; delete copy.maxScore;
  return copy;
}

export class AcademicService {
  constructor(private readonly database: Database) {}
  private capability(actor: ActorContext, roles: readonly ('admin' | 'coordinator' | 'teacher' | 'student' | 'parent')[]) {
    requireCapability(actor, actor.schoolId, 'assessment', roles);
    requireCapability(actor, actor.schoolId, 'curriculum', roles);
  }
  async list(actor: ActorContext, resource: 'references' | 'rubrics' | 'marking' | 'results', query: unknown) {
    this.capability(actor, resource === 'marking' ? ['admin', 'teacher'] : resource === 'rubrics' ? ['admin', 'coordinator', 'teacher', 'student'] : ['admin', 'coordinator', 'teacher', 'student', 'parent']);
    const page = parse(paginationSchema, query);
    return this.database.actorTransaction(actor.userId, actor.schoolId, async client => {
      if(resource==='results'){
        const response=(await client.query(`select internal.${actor.role==='parent'?'list_parent_current_results':'list_current_native_results'}($1,$2)as page`,[page.limit,page.cursor??null])).rows[0]?.page as{items:Record<string,unknown>[];nextCursor:string|null}|undefined;
        if(!response||!Array.isArray(response.items))throw new DomainError('REQUEST_UNAVAILABLE',503,'The approved parent projection is temporarily unavailable.');
        return{items:response.items.map(nativeResponse),nextCursor:response.nextCursor};
      }
      if(resource==='marking'){
        const response=(await client.query('select internal.read_current_marking_page($1,$2)as page',[page.limit,page.cursor??null])).rows[0]?.page as{items:Record<string,unknown>[];nextCursor:string|null}|undefined;
        if(!response||!Array.isArray(response.items))throw new DomainError('REQUEST_UNAVAILABLE',503,'The current marking source page is temporarily unavailable.');return{items:response.items.map(nativeResponse),nextCursor:response.nextCursor};
      }
      let select: string;
      if (resource === 'references') select = `select ${referenceFields} from app.school_custom_references r join app.school_custom_versions v on v.school_id=r.school_id and v.id=r.version_id where ($1::uuid is null or r.id>$1::uuid) order by r.id limit $2`;
      else select = `select ${rubricFields} from app.rubric_versions r where ($1::uuid is null or r.id>$1::uuid) order by r.id limit $2`;

      const rows = (await client.query(select, [page.cursor ?? null, page.limit + 1])).rows;
      const items = rows.slice(0, page.limit).map(nativeResponse);
      return { items, nextCursor: rows.length > page.limit ? String(items[items.length - 1]?.id) : null };
    });
  }
  async rubric(actor: ActorContext, id: string) {
    this.capability(actor, ['admin', 'coordinator', 'teacher', 'student']); parse(z.uuid(), id);
    return this.database.actorTransaction(actor.userId, actor.schoolId, async client => {
      const row = (await client.query(`select ${rubricFields} from app.rubric_versions r where r.id=$1`, [id])).rows[0];
      if (!row) unavailable(); return row;
    });
  }
  async report(actor:ActorContext,learnerId:string,query:unknown){
    this.capability(actor,['admin','coordinator','teacher','student','parent']);parse(z.uuid(),learnerId);const page=parse(paginationSchema,query);
    try{return await this.database.actorTransaction(actor.userId,actor.schoolId,async client=>{
      const response=(await client.query('select internal.list_current_native_results_scoped($1,$2,$3)as page',[page.limit,page.cursor??null,learnerId])).rows[0]?.page as{items:Record<string,unknown>[];nextCursor:string|null}|undefined;
      if(!response||!Array.isArray(response.items))throw new DomainError('REQUEST_UNAVAILABLE',503,'The current native report is unavailable.');
      const report=academicReportSchema.safeParse({schemaVersion:'1',schoolId:actor.schoolId,learnerId,generatedAt:new Date().toISOString(),scope:'CURRENT_RELEASED_PAGE',coverage:'NOT_ESTABLISHED',items:response.items.map(nativeResponse),nextCursor:response.nextCursor});
      if(!report.success)throw new DomainError('REQUEST_UNAVAILABLE',503,'The native report source requires review.');return report.data;
    });}catch(error){if(error instanceof DomainError)throw error;const code=typeof error==='object'&&error!==null&&'code'in error?String(error.code):'';throw new DomainError(code==='42501'?'FORBIDDEN':code==='22023'?'REPORT_REQUIRES_REVIEW':'REQUEST_UNAVAILABLE',code==='42501'?403:code==='22023'?409:503,'The current native report is unavailable for this selection.');}
  }
  async evidence(actor: ActorContext, id: string) {
    this.capability(actor, ['admin', 'coordinator', 'teacher', 'student', 'parent']); parse(z.uuid(), id);
    return this.database.actorTransaction(actor.userId, actor.schoolId, async client => {
      const row = (await client.query(`select ${evidenceFields},'numeric'as model from app.academic_evidence where id=$1 union all select ${evidenceFields},'rubric'as model from app.rubric_evidence where id=$1`, [id])).rows[0];
      if (!row) unavailable(); return row;
    });
  }
  async command(actor: ActorContext, command: AcademicCommand, target: string | undefined, body: unknown, key: unknown, requestId: string) {
    this.capability(actor, command === 'reference.approve' ? ['admin', 'coordinator'] : ['admin', 'teacher']);
    const input = parse(schemas[command] as z.ZodType<Record<string, unknown>>, body);
    const identity = parse(idempotencyKeySchema, key); if (target !== undefined) parse(z.uuid(), target);
    const fingerprint = createHash('sha256').update(JSON.stringify({ command, target: target ?? null, input })).digest('hex');
    try {
      return await this.database.actorTransaction(actor.userId, actor.schoolId, async client => {
        await this.authorize(client, actor, command, target, input);
        if (command === 'marking.create') {
          const context = (await client.query<{ approved: boolean }>(`select exists(select 1 from app.submissions s join app.assessments a on a.school_id=s.school_id and a.id=s.assessment_id join app.school_custom_references r on r.school_id=a.school_id and r.id=a.academic_reference_id where s.id=$1 and r.status='APPROVED')as approved`, [target])).rows[0];
          if (context?.approved !== true) throw new DomainError('ACADEMIC_REFERENCE_REQUIRED', 409, 'Link an approved school objective before marking this submission.');
        }
        const reservation = (await client.query('select internal.begin_command($1,$2,$3)as reservation', [identity, command, fingerprint])).rows[0]?.reservation as { state: string; response: unknown };
        if (reservation.state === 'COMPLETED') return reservation.response;
        if (reservation.state !== 'NEW') throw new DomainError('COMMAND_IN_PROGRESS', 409, 'The academic command is already in progress.');
        if (command === 'result.release') {
          await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [`${actor.schoolId}:release:${target}`]);
          const existing = (await client.query(`select *from(select ${resultFields} from ${resultFrom} where r.marking_id=$1 union all select ${rubricResultFields} from ${rubricResultFrom} where r.marking_id=$1)existing_native_result`, [target])).rows[0];
          if (existing) {
            if (existing.revision !== input.expectedRevision || existing.parentVisible !== input.parentVisible) throw new DomainError('ACADEMIC_CONFLICT', 409, 'The released revision or visibility cannot change.');
            const response = nativeResponse(existing);
            await client.query('select internal.finish_command($1,$2,$3,$4::jsonb)', [identity, command, fingerprint, JSON.stringify(response)]); return response;
          }
        }
        const result = await this.execute(client, command, target, input); const entityId = String(result.id);
        await client.query('select internal.append_audit($1,$2,$3,$4,$5,$6::jsonb)', [command, command.split('.')[0], entityId, requestId, 'succeeded', JSON.stringify({ academic: true, model: result.model ?? null })]);
        const event = command === 'result.release' ? result.model === 'rubric' ? 'rubric.result.released' : 'result.released' : command === 'marking.create' ? result.model === 'rubric' ? 'rubric.assessment.marked' : 'assessment.marked' : command === 'rubric.create' ? 'rubric.created' : command;
        const metadata = command === 'result.release' ? { learnerId: result.learnerId, referenceId: result.referenceId, resultId: result.id, evidenceId: result.evidenceId, revision: result.revision, policyVersion: result.policyVersion } : {};
        await client.query('select internal.enqueue_event($1,$2,$3,$4,$5::jsonb,$6)', [event, command.split('.')[0], entityId, Number(result.revision ?? 1), JSON.stringify(metadata), createHash('sha256').update(`${actor.userId}:${command}:${identity}`).digest('hex')]);
        await client.query('select internal.finish_command($1,$2,$3,$4::jsonb)', [identity, command, fingerprint, JSON.stringify(result)]); return result;
      });
    } catch (error) {
      if (error instanceof DomainError) throw error;
      const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
      if (code === '42501') throw new DomainError('FORBIDDEN', 403, 'Your current access does not permit this academic action.');
      if (['22023', '23505', '55000'].includes(code)) throw new DomainError('ACADEMIC_CONFLICT', 409, 'The academic source, version or revision requires review.');
      if (['23503', '23514', '23502'].includes(code)) throw new DomainError('INVALID_INPUT', 400, 'Review the academic source and configuration.');
      throw new DomainError('REQUEST_UNAVAILABLE', 503, 'Academic services are temporarily unavailable.');
    }
  }
  private async authorize(client: PoolClient, actor: ActorContext, command: AcademicCommand, target: string | undefined, input: Record<string, unknown>) {
    const scope = command === 'reference.create' ? `"authorization".current_role($1)in('teacher','admin')` : command === 'reference.approve' ? `"authorization".current_role($1)in('coordinator','admin')and exists(select 1 from app.school_custom_references where school_id=$1 and id=$2)` : command === 'rubric.create' ? `"authorization".can_manage_course($1,$2)` : command === 'assessment.reference' || command === 'assessment.rubric' ? `exists(select 1 from app.assessments where school_id=$1 and id=$2 and "authorization".can_manage_course($1,course_id))` : command === 'marking.create' ? `"authorization".current_submission_open($1,$2)` : `(exists(select 1 from app.marking_revisions where school_id=$1 and id=$2 and "authorization".current_submission_open($1,submission_id))or exists(select 1 from app.rubric_marking_revisions where school_id=$1 and id=$2 and "authorization".current_submission_open($1,submission_id)))`;
    const args = command === 'reference.create' ? [actor.schoolId] : [actor.schoolId, command === 'rubric.create' ? input.courseId : target];
    const result = await client.query<{ allowed: boolean }>(`select "authorization".academic_access($1)and(${scope})as allowed`, args);
    if (result.rows[0]?.allowed !== true) throw new DomainError('FORBIDDEN', 403, 'Your current access does not permit this academic action.');
  }
  private async execute(client: PoolClient, command: AcademicCommand, target: string | undefined, input: Record<string, unknown>): Promise<Record<string, unknown>> {
    const row = async (sql: string, args: unknown[]) => { const result = (await client.query(sql, args)).rows[0]; if (!result) unavailable(); return result as Record<string, unknown>; };
    const assessment = () => row(`select a.id,a.course_id as "courseId",a.title,a.instructions,a.max_score::float8 as "maxScore",a.model,a.status,a.due_at as "dueAt",a.policy_version as "policyVersion",a.academic_reference_id as "referenceId",ar.rubric_id as "rubricId"from app.assessments a left join app.assessment_rubrics ar on ar.school_id=a.school_id and ar.assessment_id=a.id where a.id=$1`, [target]).then(nativeResponse);
    let id: string;
    switch (command) {
      case 'reference.create': id = String((await row('select internal.create_school_reference($1,$2,$3)as id', [input.title, input.description, input.version])).id); break;
      case 'reference.approve': id = String((await row('select internal.approve_school_reference($1)as id', [target])).id); break;
      case 'rubric.create': id = String((await row('select internal.create_rubric($1,$2,$3,$4::jsonb)as id', [input.courseId, input.title, input.version, JSON.stringify(input.criteria)])).id); return row(`select ${rubricFields} from app.rubric_versions r where r.id=$1`, [id]);
      case 'assessment.reference': await client.query('select internal.link_assessment_reference($1,$2,$3)', [target, input.referenceId, input.expectedPolicyVersion]); return assessment();
      case 'assessment.rubric': await client.query('select internal.configure_assessment_rubric($1,$2,$3)', [target, input.rubricId, input.expectedPolicyVersion]); return assessment();
      case 'marking.create': {
        if (input.nativeResult !== undefined) {
          const native = input.nativeResult as { rubricId: string; criteria: unknown[] };
          id = String((await row('select internal.mark_rubric_submission($1,$2,$3::jsonb,$4,$5,$6,$7)as id', [target, native.rubricId, JSON.stringify(native.criteria), input.feedback, input.expectedPolicyVersion, input.expectedRevision, input.sourceEvidence])).id);
          return row(`select ${rubricMarkingFields} from app.rubric_marking_revisions m where m.id=$1`, [id]);
        }
        id = String((await row('select internal.mark_submission($1,$2,$3,$4,$5,$6)as id', [target, input.score, input.feedback, input.expectedPolicyVersion, input.expectedRevision, input.sourceEvidence])).id);
        return row(`select ${markingFields} from app.marking_revisions m where m.id=$1`, [id]);
      }
      case 'result.release': {
        const source = await row(`select 'numeric'as model from app.marking_revisions where id=$1 union all select 'rubric'as model from app.rubric_marking_revisions where id=$1`, [target]);
        const rubric = source.model === 'rubric';
        id = String((await row(`select internal.${rubric ? 'release_rubric_marking' : 'release_marking'}($1,$2,$3)as id`, [target, input.expectedRevision, input.parentVisible])).id);
        return nativeResponse(await row(`select ${rubric ? rubricResultFields : resultFields} from ${rubric ? rubricResultFrom : resultFrom} where r.id=$1`, [id]));
      }
    }
    return row(`select ${referenceFields} from app.school_custom_references r join app.school_custom_versions v on v.school_id=r.school_id and v.id=r.version_id where r.id=$1`, [id]);
  }
}


