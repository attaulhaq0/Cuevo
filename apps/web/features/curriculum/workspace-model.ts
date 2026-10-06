import { z } from 'zod';
import { curriculumVersionInputSchema,curriculumReferenceInputSchema,programmeInstanceInputSchema,programmeCourseLinkSchema,programmeLearnerInputSchema,curriculumOverlayInputSchema } from '@cuevo/contracts';
import { LearningApiError,type Command } from '../../shared/api/client.ts';
export type CurriculumReadContext={apiUrl:string;membership:{schoolId:string;userId:string;role:string;entitlements:string[]}|null;accessToken:string|null;accessGeneration:number;online:boolean;status:string};
export function curriculumReadScope(app:CurriculumReadContext,path:string,refresh:number):string|null{
 if(!app.online||app.status!=='ready'||!app.accessToken||!app.membership||!['admin','coordinator','teacher'].includes(app.membership.role)||!app.membership.entitlements.includes('curriculum'))return null;
 return JSON.stringify([app.apiUrl,app.membership.schoolId,app.membership.userId,app.membership.role,app.accessToken,app.accessGeneration,path,refresh]);
}
export function currentCurriculumRead<T>(read:{scope:string|null;value:T}|null|undefined,scope:string|null):T|null{return scope&&read?.scope===scope?read.value:null;}
export type CurriculumSourceRead = { path: string; scope: string | null; loading: boolean; ready: boolean; error: LearningApiError | null };
export type CurriculumSourceDenials = Record<string, { scope: string | null; denied: boolean }>;
/** A refresh cannot erase a known source denial. Only its validated current
 * response clears it; failed reads and another endpoint's success do not. */
export function updateCurriculumSourceDenials(previous: CurriculumSourceDenials, reads: readonly CurriculumSourceRead[]): CurriculumSourceDenials {
  let next = previous;
  for (const read of reads) {
    const prior = next[read.path], forbidden = read.error?.kind === 'denied' || read.error?.kind === 'unauthorized';
    const denied = forbidden || !!prior?.denied && !(read.ready && !read.loading && !read.error && read.scope !== null && prior.scope === read.scope);
    const scope = read.ready && prior?.denied && prior.scope !== read.scope ? prior.scope : read.scope;
    if (prior?.scope !== scope || prior.denied !== denied) { if (next === previous) next = { ...previous }; next[read.path] = { scope, denied }; }
  }
  return next;
}
export function curriculumHasSourceDenial(denials: CurriculumSourceDenials, reads: readonly CurriculumSourceRead[]): boolean { return reads.some(read => denials[read.path]?.denied); }
export type CurriculumConfigurationAction='version'|'reference'|'programme'|'course'|'learner'|'overlay'|'objectives'|'planning';
export type CurriculumConfigurationIntent={action:CurriculumConfigurationAction;courseId:string};
export function parseCurriculumConfigurationIntent(value:unknown):CurriculumConfigurationIntent|null{
 const parsed=z.object({action:z.enum(['version','reference','programme','course','learner','overlay','objectives','planning']),courseId:z.union([z.literal(''),z.uuid()])}).strict().safeParse(value);
 return parsed.success?parsed.data:null;
}
export function curriculumConfigurationRecovery(commands:readonly Command[]):CurriculumConfigurationIntent|null {
 const intents=commands.flatMap<CurriculumConfigurationIntent>(command=>{
  const course=command.path.match(/^\/v1\/curriculum\/courses\/([^/]+)(?:\/(objectives|plans))?$/);
  if(course&&z.uuid().safeParse(course[1]).success)return[{action:course[2]==='objectives'?'objectives' as const:course[2]==='plans'?'planning' as const:'course' as const,courseId:course[1]}];
  const action:CurriculumConfigurationAction|undefined=({'/v1/curriculum/versions':'version','/v1/curriculum/references':'reference','/v1/curriculum/programmes':'programme','/v1/curriculum/learners':'learner','/v1/curriculum/overlays':'overlay'} as Record<string,CurriculumConfigurationAction>)[command.path];
  return action?[{action,courseId:''}]:[];
 });return intents.length===1?intents[0]:null;
}
/** A human label must identify one available choice. Opaque identifiers never
 * disambiguate a customer-facing name. Unknown/duplicate labels stay disabled. */
export function curriculumChoices(items:{id:string;label:string}[]):{value:string;label:string;available:boolean}[]{
 return items.map(item=>({value:item.id,label:item.label.trim(),available:!!item.label.trim()&&items.filter(other=>other.label.trim()===item.label.trim()).length===1}));
}
const receiptSchema=z.object({id:z.uuid(),command:z.enum(['version.create','reference.create','programme.create','course.configure','learner.configure','overlay.configure']),schoolId:z.uuid(),academicReferenceId:z.uuid().nullable()}).strict();
/** Current configuration receipts echo command/school/source IDs, not newly
 * authored content. Exact saved values still require current source readback. */
export function validateCurriculumConfigurationReceipt(value:unknown,original:Command,schoolId:string):void{
 try{
  const receipt=receiptSchema.parse(value),path=original.path,body=original.body;
  if(receipt.schoolId!==schoolId)throw new LearningApiError('invalid');
  if(path==='/v1/curriculum/versions'){curriculumVersionInputSchema.parse(body);if(receipt.command!=='version.create'||receipt.academicReferenceId!==null)throw new LearningApiError('invalid');return;}
  if(path==='/v1/curriculum/references'){curriculumReferenceInputSchema.parse(body);if(receipt.command!=='reference.create'||receipt.academicReferenceId!==null)throw new LearningApiError('invalid');return;}
  if(path==='/v1/curriculum/programmes'){programmeInstanceInputSchema.parse(body);if(receipt.command!=='programme.create'||receipt.academicReferenceId!==null)throw new LearningApiError('invalid');return;}
  if(path==='/v1/curriculum/learners'){const input=programmeLearnerInputSchema.parse(body);if(receipt.command!=='learner.configure'||receipt.id!==input.programmeId||receipt.academicReferenceId!==null)throw new LearningApiError('invalid');return;}
  if(path==='/v1/curriculum/overlays'){curriculumOverlayInputSchema.parse(body);if(receipt.command!=='overlay.configure'||receipt.academicReferenceId!==null)throw new LearningApiError('invalid');return;}
  const match=path.match(/^\/v1\/curriculum\/courses\/([^/]+)$/);if(match){programmeCourseLinkSchema.parse(body);if(receipt.command!=='course.configure'||receipt.id!==match[1]||receipt.academicReferenceId===null)throw new LearningApiError('invalid');return;}
  throw new LearningApiError('invalid');
 }catch{throw new LearningApiError('invalid',true);}
}
