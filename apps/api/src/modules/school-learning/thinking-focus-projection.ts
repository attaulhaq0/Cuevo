import { z } from 'zod';
import { DomainError } from '@cuevo/domain';
import { thinkingFocusResponseSchema, thinkingFocusTargetSchema, type ThinkingFocusResponse } from '@cuevo/contracts';

export type ThinkingFocusBasis = {kind:'activity'|'assessment';id:string;courseId:string;title?:unknown;instructions?:unknown;contentRevision?:unknown;preparationVersion?:unknown;policyVersion?:unknown;rubricId?:unknown;rubricVersion?:unknown};
const absentSchema=z.object({target:thinkingFocusTargetSchema,courseId:z.uuid(),classification:z.null()}).strict();
function unavailable():never{throw new DomainError('REQUEST_UNAVAILABLE',503,'Task focus source metadata could not be confirmed.');}
export function checkedThinkingFocus(value:unknown,basis:ThinkingFocusBasis,compact=false):ThinkingFocusResponse|null {
  if(value===null)return null;
  const result=thinkingFocusResponseSchema.safeParse(value);if(!result.success)unavailable();const row=result.data;
  if(row.target.kind!==basis.kind.toUpperCase()||row.target.id!==basis.id||row.target.criterionKey!==null||row.courseId!==basis.courseId)unavailable();
  if(basis.title!==undefined&&row.source.title!==basis.title||!compact&&basis.instructions!==undefined&&row.source.instructions!==basis.instructions)unavailable();
  if(basis.kind==='activity'){if(basis.contentRevision!==undefined&&row.source.contentRevision!==basis.contentRevision)unavailable();}
  else {
    if(basis.preparationVersion!==undefined&&row.source.preparationVersion!==basis.preparationVersion||basis.policyVersion!==undefined&&row.source.policyVersion!==basis.policyVersion)unavailable();
    if(basis.rubricId===null&&row.source.rubricVersion!==null||typeof basis.rubricId==='string'&&(!row.source.rubricVersion||!row.source.rubricVersion.startsWith(basis.rubricId+':'))||basis.rubricVersion!==undefined&&row.source.rubricVersion!==basis.rubricVersion)unavailable();
  }
  return row;
}
/** An authorized absence receipt is different from a missing or malformed row. */
export function checkedThinkingFocusSet(value:unknown,bases:ThinkingFocusBasis[]):Map<string,ThinkingFocusResponse|null> {
  if(!Array.isArray(value)||value.length!==bases.length||bases.length>100)unavailable();
  const expected=new Map(bases.map(basis=>[`${basis.kind.toUpperCase()}:${basis.id}`,basis]));if(expected.size!==bases.length)unavailable();
  const result=new Map<string,ThinkingFocusResponse|null>();
  for(const raw of value){const absent=absentSchema.safeParse(raw);if(absent.success){const key=`${absent.data.target.kind}:${absent.data.target.id}`,basis=expected.get(key);if(!basis||result.has(basis.id)||absent.data.target.criterionKey!==null||absent.data.courseId!==basis.courseId)unavailable();result.set(basis.id,null);continue;}
    const parsed=thinkingFocusResponseSchema.safeParse(raw);if(!parsed.success)unavailable();const basis=expected.get(`${parsed.data.target.kind}:${parsed.data.target.id}`);if(!basis||result.has(basis.id))unavailable();result.set(basis.id,checkedThinkingFocus(raw,basis,true));
  }
  if(result.size!==bases.length)unavailable();return result;
}
