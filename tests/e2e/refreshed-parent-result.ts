import { expect, type Locator, type Page, type Response } from '@playwright/test';
import { academicReportSchema } from '@cuevo/contracts';
import { openCurrentResult } from './result-reader';
type Expected={apiOrigin:string;schoolId:string;learnerId:string;resultId:string};
type Outcome<T>={ok:true;value:T}|{ok:false;error:unknown};
const handled=<T>(promise:Promise<T>):Promise<Outcome<T>>=>promise.then(value=>({ok:true,value}),error=>({ok:false,error}));
const value=<T>(outcome:Outcome<T>):T=>{if(!outcome.ok)throw outcome.error;return outcome.value;};
export async function readRefreshedParentResult(page:Page,expected:Expected,refresh:()=>Promise<unknown>):Promise<{reader:Locator;report:ReturnType<typeof academicReportSchema.parse>}> {
 const origin=new URL(expected.apiOrigin);expect(origin.origin).toBe(expected.apiOrigin);expect(origin.username||origin.password).toBe('');
 const controller=new AbortController(),path=`/v1/learners/${expected.learnerId}/academic-report`;
 const source=(response:Response)=>{const url=new URL(response.url());return response.request().method()==='GET'&&url.origin===expected.apiOrigin&&url.pathname===path;};
 const parse=async(response:Response)=>{expect(response.ok()).toBe(true);expect(await response.finished()).toBeNull();const report=academicReportSchema.parse(await response.json());expect(report.schoolId).toBe(expected.schoolId);expect(report.learnerId).toBe(expected.learnerId);expect(report.scope).toBe('CURRENT_RELEASED_PAGE');expect(report.coverage).toBe('NOT_ESTABLISHED');expect(report.items.every(row=>row.learnerId===expected.learnerId&&row.parentVisible)).toBe(true);return report;};
 const parsing=new Map<Response,Promise<ReturnType<typeof academicReportSchema.parse>>>();
 const parseOnce=(response:Response)=>{let task=parsing.get(response);if(!task){task=parse(response);parsing.set(response,task);}return task;};
 const first=handled(page.waitForEvent('response',{signal:controller.signal,predicate:response=>source(response)&&!new URL(response.url()).searchParams.has('cursor')}).then(parseOnce));
 const exact=handled(page.waitForEvent('response',{signal:controller.signal,predicate:async response=>source(response)&&(await parseOnce(response)).items.some(row=>row.id===expected.resultId)}).then(parseOnce));
 try {
  const [firstOutcome]=await Promise.all([first,refresh()]);value(firstOutcome);
  await expect(page.getByRole('main').getByRole('status').filter({hasText:/^Loading/})).toHaveCount(0);
  const [reader,exactOutcome]=await Promise.all([openCurrentResult(page,expected.resultId),exact]);return{reader,report:value(exactOutcome)};
 } finally {controller.abort();await Promise.all([first,exact]);}
}
