import { expect, type Page, type Request, type Response } from '@playwright/test';

type Mode='setup'|'people'|'daily';
type Receipt={sequence:number;cursor:string|null;nextCursor:string|null;ids:string[];status:number;valid:boolean};
type Source={sequence:number;pending:Promise<Receipt>;receipt?:Receipt};
const uuid=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const modes:Record<Mode,readonly string[]>={setup:['years','terms','year-groups','classes','subjects'],people:['classes','subjects','people','enrollments','teacher-assignments','guardian-relationships'],daily:['classes','subjects','terms','people','years','year-groups','attendance','timetable','calendar','report-periods']};
const labels:Record<string,string>={years:'Academic years',terms:'Terms','year-groups':'Year groups',classes:'Classes',subjects:'Subjects',people:'People and access',enrollments:'Enrollments','teacher-assignments':'Teacher assignments','guardian-relationships':'Family relationships',attendance:'Attendance',timetable:'Timetable',calendar:'Calendar','report-periods':'Report periods'};
const observers=new WeakMap<Page,SchoolCurrentSources>();

/** Observes only existing School GET page metadata; it issues no request or mutation. */
export class SchoolCurrentSources {
 private sources=new Map<string,Source>();private sequence=0;private requests=new Map<Request,{resource:string;sequence:number;resolve:(value:Receipt)=>void}>();
 constructor(private page:Page,private apiOrigin='http://localhost:4000'){
  // A document request invalidates old observations before its School reads
  // start. SPA frame events can arrive after reads and must not erase them.
  page.on('request',request=>{if(request.isNavigationRequest()&&request.frame()===page.mainFrame())this.sources.clear();});
  page.on('request',request=>{const url=new URL(request.url()),resource=url.pathname.match(/^\/v1\/school\/([^/]+)$/)?.[1];if(request.method()!=='GET'||url.origin!==apiOrigin||!resource)return;if(resource==='context'){this.sources.clear();return;}if(!Object.values(modes).some(rows=>rows.includes(resource)))return;let resolve!:(value:Receipt)=>void;const pending=new Promise<Receipt>(done=>{resolve=done});const sequence=++this.sequence;this.requests.set(request,{resource,sequence,resolve});this.sources.set(resource,{sequence,pending});});
  page.on('response',response=>{void this.accept(response);});
  page.on('requestfailed',request=>{const current=this.requests.get(request);if(!current)return;current.resolve({sequence:current.sequence,cursor:null,nextCursor:null,ids:[],status:0,valid:false});this.requests.delete(request);});
 }
 private async accept(response:Response){const request=response.request(),current=this.requests.get(request);if(!current)return;let valid=false,ids:string[]=[],nextCursor:string|null=null;const cursor=new URL(request.url()).searchParams.get('cursor');try{if(await response.finished())throw new Error('Current body failed');const value:unknown=await response.json();if(value&&typeof value==='object'&&'items'in value&&Array.isArray(value.items)&&value.items.length<=100&&'nextCursor'in value&&(value.nextCursor===null||typeof value.nextCursor==='string'&&uuid.test(value.nextCursor))){ids=value.items.map((item:unknown)=>item&&typeof item==='object'&&'id'in item&&typeof item.id==='string'?item.id:'');valid=ids.every(id=>uuid.test(id))&&new Set(ids).size===ids.length&&(cursor===null||uuid.test(cursor))&&(cursor===null||value.nextCursor!==cursor);nextCursor=value.nextCursor as string|null;}}catch{/* A failed body is explicit invalid source evidence. */}const receipt={sequence:current.sequence,cursor,nextCursor,ids,status:response.status(),valid};const latest=this.sources.get(current.resource);if(latest?.sequence===current.sequence)latest.receipt=receipt;current.resolve(receipt);this.requests.delete(request);}
 async complete(mode:Mode){
  await this.page.evaluate(()=>new Promise<void>(done=>requestAnimationFrame(()=>requestAnimationFrame(()=>done()))));
  const workspace=this.page.locator('.school-workspace');await expect(workspace).toHaveCount(1);await expect(workspace).toBeVisible();
  const completed=new Map<string,number>();
  for(const resource of modes[mode]){
   await expect.poll(()=>this.sources.has(resource),{message:`Existing current School ${resource} read must be observed before completion`}).toBe(true);
   const seen=new Set<string>();let originalDirectory:string|null=null;
   for(let pageIndex=0;pageIndex<30;pageIndex++){
    const source=this.sources.get(resource)!;const receipt=await source.pending;expect(receipt.status,`Current School ${resource} request succeeds`).toBe(200);expect(receipt.valid,`Current School ${resource} bounded page schema/IDs/cursor is valid`).toBe(true);
    await expect(workspace.locator('[role="alert"]')).toHaveCount(0);
    await this.page.evaluate(()=>new Promise<void>(done=>requestAnimationFrame(()=>requestAnimationFrame(()=>done()))));
    if(this.sources.get(resource)?.sequence!==receipt.sequence)continue;
    const label=resource==='people'&&mode==='people'?'People':labels[resource];
    const more=workspace.getByRole('button',{name:`Load more: ${label}`,exact:true});
    const loading=workspace.getByRole('button',{name:`Loading more…: ${label}`,exact:true});
    if(!receipt.nextCursor){await expect(loading).toHaveCount(0);await expect(more).toHaveCount(0);completed.set(resource,receipt.sequence);break;}
    expect(seen.has(receipt.nextCursor),`Current School ${resource} cursor cannot repeat`).toBe(false);seen.add(receipt.nextCursor);
    // Active People sources use their directory Next; inactive sources expose
    // one named Load more. Switching to the intended relationship happens in
    // the caller, so this adapter never changes a selected record or editor.
    const activeLabels:Record<string,string>={people:'People',enrollments:'Enrollments','teacher-assignments':'Teacher assignments','guardian-relationships':'Family relationships'};
    if(mode==='people'&&activeLabels[resource]&&await workspace.locator('.school-access-directory__groups').getByRole('button',{name:activeLabels[resource],exact:true}).getAttribute('aria-pressed')==='true'){
     const directory=workspace.locator('.school-access-directory'),next=directory.locator('.school-access-pagination').getByRole('button',{name:'Next',exact:true});
     if(originalDirectory===null)originalDirectory=JSON.stringify(await directory.locator('li button').allTextContents());
     for(let localPage=0;localPage<5&&this.sources.get(resource)?.sequence===receipt.sequence;localPage++){await expect(next).toHaveCount(1);await expect(next).toBeEnabled();const signature=await directory.locator('li button').allTextContents();await next.click();await expect.poll(async()=>this.sources.get(resource)?.sequence!==receipt.sequence||JSON.stringify(await directory.locator('li button').allTextContents())!==JSON.stringify(signature),{message:'Current School directory page must commit before another Next'}).toBe(true);}
    }else{await expect(more).toHaveCount(1);await expect(more).toBeEnabled();await more.click();}
    await expect.poll(()=>this.sources.get(resource)?.sequence!==receipt.sequence,{message:`Only the current ${resource} continuation request can advance this source`}).toBe(true);
    const continued=await this.sources.get(resource)!.pending;expect(continued.cursor,`Current School ${resource} continuation uses the original source cursor`).toBe(receipt.nextCursor);
    if(pageIndex===29)throw new Error('Current School source continuation exceeded its bounded pages.');
   }
   // Return through existing Previous controls to the caller's original
   // loaded page. Completion must not strand its intended record behind us.
   if(originalDirectory!==null){const directory=workspace.locator('.school-access-directory');await expect(directory.getByRole('button',{name:'Loading current records…',exact:true})).toHaveCount(0);for(let step=0;JSON.stringify(await directory.locator('li button').allTextContents())!==originalDirectory;step++){expect(step,'Restore the original School loaded page within the bounded source pages').toBeLessThan(120);const previous=directory.locator('.school-access-pagination').getByRole('button',{name:'Previous',exact:true});await expect(previous).toBeEnabled();const signature=await directory.locator('li button').allTextContents();await previous.click();await expect.poll(async()=>JSON.stringify(await directory.locator('li button').allTextContents())!==JSON.stringify(signature),{message:'The original School directory page must commit'}).toBe(true);}}
  }
  await expect(workspace.locator('.cuevo-workspace-state[data-state="loading"], [aria-busy="true"]')).toHaveCount(0);await expect(workspace.getByRole('status').filter({hasText:/Loading school records|Loading current records/})).toHaveCount(0);await expect(workspace.locator('[role="alert"]')).toHaveCount(0);
  // These existing controls are admitted only after the actual owner commits
  // its complete source dependencies; an absent continuation is insufficient.
  const admission=mode==='setup'?workspace.getByRole('button',{name:'Create academic year',exact:true}):mode==='daily'?workspace.getByRole('button',{name:'Create calendar event',exact:true}):workspace.getByRole('button',{name:'Prepare a new relationship',exact:true});
  await expect(admission).toHaveCount(1);await expect(admission).toBeEnabled();
  for(const resource of modes[mode])expect(this.sources.get(resource)?.sequence,`Current School ${resource} completion must still belong to the admitted frame`).toBe(completed.get(resource));
 }
}
export function observeSchoolCurrentSources(page:Page,apiOrigin?:string){const current=observers.get(page);if(current)return current;const observer=new SchoolCurrentSources(page,apiOrigin);observers.set(page,observer);return observer;}
export function hasSchoolCurrentSources(page:Page){return observers.has(page);}
export async function completeObservedSchoolSources(page:Page,mode:Mode){const observer=observers.get(page);if(!observer)throw new Error('Current School source observation must start before navigation.');await observer.complete(mode);}
