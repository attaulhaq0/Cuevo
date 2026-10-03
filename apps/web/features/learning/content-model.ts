import { LearningApiError } from '../../shared/api/client.ts';
import { learningContentSchema,type LearningContent,type LearningContentResource } from '@cuevo/contracts';
export type { LearningContent,LearningContentResource } from '@cuevo/contracts';
export function parseLearningContent(value:unknown):LearningContent{const result=learningContentSchema.safeParse(value);if(!result.success)throw new LearningApiError('invalid');return result.data;}
export function contentDraftBody(source:LearningContent,values:FormData){return{resource:source.resource,expectedRevision:source.draftRevision,title:String(values.get('title')),content:source.resource==='unit'?'':String(values.get('content')??''),kind:source.resource==='activity'?String(values.get('kind')):null,assessmentId:source.resource==='activity'&&values.get('assessmentId')?String(values.get('assessmentId')):null,reason:String(values.get('reason'))};}
export const contentResources:LearningContentResource[]=['course','unit','lesson','activity'];

export function parseContentTaskChoice(value:unknown):{id:string;title:string;courseId:string;submissionKind:string;intendedSubmissionKind:string;status:string}{if(!value||typeof value!=='object'||Array.isArray(value))throw new LearningApiError('invalid');const row=value as Record<string,unknown>;if(['id','title','courseId','submissionKind','intendedSubmissionKind','status'].some(key=>typeof row[key]!=='string'))throw new LearningApiError('invalid');return row as{id:string;title:string;courseId:string;submissionKind:string;intendedSubmissionKind:string;status:string};}
