import { expect, type Locator, type Page, type Request, type Response } from '@playwright/test';
import { academicReportSchema } from '@cuevo/contracts';
import { openCurrentResult } from './result-reader';
type ParentScope={apiOrigin:string;schoolId:string;learnerId:string};
type Expected=ParentScope&{resultId:string};
type Report=ReturnType<typeof academicReportSchema.parse>;
type ObservedReport={report:Report;sequence:number};
type Outcome<T>={ok:true;value:T}|{ok:false;error:unknown};
const handled=<T>(promise:Promise<T>):Promise<Outcome<T>>=>promise.then(value=>({ok:true,value}),error=>({ok:false,error}));
const value=<T>(outcome:Outcome<T>):T=>{if(!outcome.ok)throw outcome.error;return outcome.value;};

/** Observe existing reads from one refresh; no request or retry is issued here. */
function observeCurrentParentReports(page:Page,expected:ParentScope){
 const origin=new URL(expected.apiOrigin);expect(origin.origin).toBe(expected.apiOrigin);expect(origin.username||origin.password).toBe('');
 const controller=new AbortController(),path=`/v1/learners/${expected.learnerId}/academic-report`;
 const requests=new Map<Request,{sequence:number;cursor:string|null;cancelled:boolean}>(),parsed=new Map<Request,Promise<Report>>(),completed=new Map<number,ObservedReport>(),listeners=new Set<()=>void>();
 let armed=false,sequence=0,latestFirst=0,authorization:string|undefined,failure:unknown,deadline=0;let deadlineTimer:ReturnType<typeof setTimeout>|undefined;const changed=()=>{for(const listen of listeners)listen();};
 const source=(request:Request)=>{const url=new URL(request.url());return request.method()==='GET'&&url.origin===expected.apiOrigin&&url.pathname===path;};
 const fail=(error:unknown)=>{if(failure===undefined)failure=error;controller.abort();changed();};
 const onRequest=(request:Request)=>{
  if(!armed||!source(request))return;
  const headers=request.headers(),token=headers.authorization??'',school=headers['x-school-id']??'';
  if(sequence>=64||school!==expected.schoolId||!/^Bearer [^\s]+$/.test(token)||authorization!==undefined&&token!==authorization){fail(new Error('Current Parent report request scope changed.'));return;}
  authorization??=token;const cursor=new URL(request.url()).searchParams.get('cursor'),current=++sequence;
  requests.set(request,{sequence:current,cursor,cancelled:false});if(cursor===null)latestFirst=current;changed();
 };
 const onResponse=(response:Response)=>{if(requests.has(response.request())&&!response.ok())fail(new Error('Current Parent report response was denied or unavailable.'));};
 const onFailed=(request:Request)=>{const current=requests.get(request);if(!current)return;current.cancelled=true;if(!/abort|cancel/i.test(request.failure()?.errorText??''))fail(new Error('Current Parent report request failed.'));};
 const onClose=()=>fail(new Error('Current Parent report page closed.'));page.on('close',onClose);page.on('request',onRequest);page.on('response',onResponse);page.on('requestfailed',onFailed);
 const parseOnce=(request:Request)=>{
  let task=parsed.get(request);if(task)return task;
  task=(async()=>{const response=await request.response();if(!response)throw new Error('Current Parent report response is unavailable.');expect(response.ok()).toBe(true);expect(await response.finished()).toBeNull();const report=academicReportSchema.parse(await response.json());expect(report.schoolId).toBe(expected.schoolId);expect(report.learnerId).toBe(expected.learnerId);expect(report.scope).toBe('CURRENT_RELEASED_PAGE');expect(report.coverage).toBe('NOT_ESTABLISHED');expect(report.items.every(row=>row.learnerId===expected.learnerId&&row.parentVisible)).toBe(true);return report;})();
  parsed.set(request,task);void task.catch(fail);return task;
 };
 const onFinished=(request:Request)=>{const current=requests.get(request);if(!current||current.cancelled||controller.signal.aborted)return;void parseOnce(request).then(report=>{if(!controller.signal.aborted){completed.set(current.sequence,{report,sequence:current.sequence});changed();}},fail);};
 page.on('requestfinished',onFinished);
 const observe=(matches:(report:Report,current:{sequence:number;cursor:string|null})=>boolean):Promise<Outcome<ObservedReport>>=>handled(new Promise<ObservedReport>((done,reject)=>{
  const listen=()=>{if(failure!==undefined){listeners.delete(listen);reject(failure);return;}if(controller.signal.aborted){listeners.delete(listen);reject(new Error('Current Parent report observation stopped.'));return;}const observed=[...completed.values()].filter(row=>row.sequence>=latestFirst).sort((a,b)=>b.sequence-a.sequence).find(row=>{const request=[...requests.values()].find(request=>request.sequence===row.sequence);return request&&!request.cancelled&&matches(row.report,request);});if(observed){listeners.delete(listen);done(observed);}};
  listeners.add(listen);listen();
 }));
 const currentChild=async()=>{const child=page.getByLabel('Child',{exact:true});await expect(child).toHaveCount(1);await expect(child).toHaveValue(expected.learnerId);};
 const settle=async(observation:ObservedReport)=>{await page.evaluate(()=>new Promise<void>(done=>requestAnimationFrame(()=>requestAnimationFrame(()=>done()))));await currentChild();await expect(page.getByRole('main').getByRole('status').filter({hasText:/^(Loading|جارٍ تحميل)/})).toHaveCount(0);if(failure!==undefined)throw failure;if(Date.now()>=deadline)throw new Error('Current Parent report observation exceeded its existing read budget.');return observation.sequence>=latestFirst;};
 return{observe,currentChild,settle,arm:()=>{armed=true;deadline=Date.now()+15000;deadlineTimer=setTimeout(()=>fail(new Error('Current Parent report observation exceeded its existing read budget.')),Math.max(0,deadline-Date.now()));},failure:()=>failure,stop:async()=>{if(deadlineTimer)clearTimeout(deadlineTimer);controller.abort();changed();page.off('request',onRequest);page.off('response',onResponse);page.off('requestfailed',onFailed);page.off('requestfinished',onFinished);page.off('close',onClose);await Promise.allSettled([...parsed.values()]);}};
}

async function settledReport(observer:ReturnType<typeof observeCurrentParentReports>,initial:ObservedReport,matches:(report:Report,current:{sequence:number;cursor:string|null})=>boolean){let observed=initial;for(;;){if(await observer.settle(observed))return observed;observed=value(await observer.observe(matches));}}

/** Publication and exact-result reads share the same complete current-page owner. */
export async function readCurrentParentAcademicReport(page:Page,expected:ParentScope,refresh:()=>Promise<unknown>):Promise<Report>{
 const observer=observeCurrentParentReports(page,expected),first=observer.observe((_report,current)=>current.cursor===null);
 try{await observer.currentChild();observer.arm();const[firstOutcome]=await Promise.all([first,refresh()]);if(observer.failure()!==undefined)throw observer.failure();const observed=await settledReport(observer,value(firstOutcome),(_report,current)=>current.cursor===null);return observed.report;}finally{await observer.stop();await first;}
}
export async function readRefreshedParentResult(page:Page,expected:Expected,refresh:()=>Promise<unknown>):Promise<{reader:Locator;report:Report}>{
 const observer=observeCurrentParentReports(page,expected),first=observer.observe((_report,current)=>current.cursor===null),matches=(report:Report)=>report.items.some(row=>row.id===expected.resultId),exact=observer.observe(matches);
 try{await observer.currentChild();observer.arm();const[firstOutcome]=await Promise.all([first,refresh()]);if(observer.failure()!==undefined)throw observer.failure();await settledReport(observer,value(firstOutcome),(_report,current)=>current.cursor===null);const[reader,exactOutcome]=await Promise.all([openCurrentResult(page,expected.resultId),exact]);if(observer.failure()!==undefined)throw observer.failure();const observed=await settledReport(observer,value(exactOutcome),matches);return{reader,report:observed.report};}finally{await observer.stop();await Promise.all([first,exact]);}
}
