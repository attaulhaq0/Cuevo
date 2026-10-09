import { z } from 'zod';
import { verificationSteps } from './steps';

const phaseNames = new Set<string>([...verificationSteps.map(step=>step.name),'backend-build','web-build','critical-integration','critical-browser','source-freeze']);
const common = z.object({profile:z.enum(['full','routine','full-runtime','main-staging']),phase:z.string().refine(value=>phaseNames.has(value))});
const schema = z.discriminatedUnion('event',[
 common.extend({event:z.literal('START')}).strict(),
 common.extend({event:z.literal('END'),exitCode:z.number().int().nullable(),durationMs:z.number().int().nonnegative()}).strict(),
]);
/** Safe progress contains only source-owned phase labels and actual timing.
 * Raw output stays with the existing runner and never enters this summary. */
export function verificationProgress(value:unknown){
 const input=schema.parse(value);
 if(input.event==='START')return{stdout:`START ${input.profile} ${input.phase}`,summary:`| ${input.phase} | START | — |\n`};
 const result=input.exitCode===0?'PASSED':input.exitCode===null?'UNCONFIRMED':'FAILED';
 return{stdout:`END ${input.profile} ${input.phase} ${result} ${input.durationMs}ms`,summary:`| ${input.phase} | ${result} | ${input.durationMs} ms |\n`};
}
