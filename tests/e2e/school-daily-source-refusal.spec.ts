import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root=resolve(import.meta.dirname,'../..');
const id=(n:number)=>`ec000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
async function mount(page:import('@playwright/test').Page,locale:'en'|'ar',failure:'denied'|'unavailable'|'unauthorized'){
 const day=new Date().toISOString().slice(0,10),calls:string[]=[];
 const bundle=await build({bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',stdin:{resolveDir:root,loader:'tsx',contents:`
import React from 'react';import{createRoot}from'react-dom/client';import{SchoolWorkspace}from'./apps/web/features/school/components/school-workspace';import{CommandJournal}from'./apps/web/shared/api/client';import{FormDrafts}from'./apps/web/shared/session/form-drafts';import{getDictionary}from'./apps/web/shared/i18n/locale';
globalThis.dailyRefusalApp={locale:'${locale}',dictionary:getDictionary('${locale}'),membership:{schoolId:'${id(1)}',userId:'${id(10)}',role:'teacher',entitlements:['school.operations']},status:'ready',online:true,apiUrl:'https://daily.fixture.invalid',accessToken:'fictional',accessGeneration:1,formDrafts:new FormDrafts(),commandJournal:new CommandJournal(),refreshAccess(){},reportDiagnostic(){},selectedChildId:null};createRoot(document.getElementById('root')).render(<main className="workspace"><SchoolWorkspace/></main>);
`},plugins:[{name:'current-session-input',setup(b){b.onLoad({filter:/shared[\\/]session[\\/]providers\.tsx$/},()=>({loader:'js',contents:'export function useApp(){return globalThis.dailyRefusalApp}'}));b.onLoad({filter:/\.(webp|svg|png)$/},args=>({loader:'js',contents:'export default '+JSON.stringify({src:'data:image/webp;base64,'+readFileSync(args.path).toString('base64')})}));}}]});
 const context={school:{id:id(1),name:'Current school',countryCode:'QA',languages:['en','ar']},policy:{version:1,parentAttendanceVisible:false,parentUpcomingVisible:false,studentMessagingEnabled:false,recognitionEnabled:false,leaderboardEnabled:false,analyticsEnabled:false},intelligence:{fixtureSchoolApproved:false,liveSchoolApproved:false,availability:'SERVER_CONFIG_AND_APPROVED_POLICY_REQUIRED'}};
 const rows:Record<string,unknown[]>={years:[{id:id(2),name:'2026–2027',selectionStatus:'READY'}],'year-groups':[{id:id(3),name:'Year 1',selectionStatus:'READY'}],classes:[{id:id(4),name:'Cedar',academicYearId:id(2),yearGroupId:id(3),academicYearName:'2026–2027',yearGroupName:'Year 1',status:'active',selectionStatus:'READY'}],subjects:[{id:id(5),name:'Mathematics',selectionStatus:'READY'}],attendance:[{id:id(20),learnerId:id(11),classId:id(4),learnerName:'Private current learner',className:'Cedar',occurredOn:day,status:'present',note:'Private current attendance note',revision:1,recordedAt:day+'T08:00:00Z'}],calendar:[{id:id(21),title:'Current calendar meeting',description:'Exact current meeting',classId:null,startsAt:day+'T10:00:00Z',endsAt:day+'T11:00:00Z',parentVisible:false,revision:1}]};
 await page.route('https://daily.fixture.invalid/**',async route=>{
  const url=new URL(route.request().url());if(url.pathname==='/probe')return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="'+locale+'" dir="'+(locale==='ar'?'rtl':'ltr')+'"><div id="root"></div></html>'});
  expect(route.request().method()).toBe('GET');calls.push(url.pathname+url.search);const resource=url.pathname.split('/').at(-1)!;
  if(resource==='context')return route.fulfill({json:context});
  if(resource==='attendance'&&url.searchParams.has('cursor'))return route.fulfill({status:failure==='denied'?403:failure==='unauthorized'?401:503,json:{code:failure==='denied'?'FORBIDDEN':failure==='unauthorized'?'AUTH_REQUIRED':'REQUEST_UNAVAILABLE'}});
  return route.fulfill({json:{items:rows[resource]??[],nextCursor:resource==='attendance'?id(20):null}});
 });
 await page.goto('https://daily.fixture.invalid/probe');await page.addStyleTag({content:['packages/ui/src/tokens.css','apps/web/app/globals.css','apps/web/features/school/styles.css'].map(p=>readFileSync(resolve(root,p),'utf8')).join('\n')});await page.addScriptTag({content:bundle.outputFiles[0].text});
 await expect(page.getByRole('heading',{name:'Private current learner',exact:true})).toBeVisible();return calls;
}
for(const locale of['en','ar']as const)test(`${locale}: Daily source refusal withholds retained rows until full current refresh`,async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));const calls=await mount(page,locale,'denied');
 await page.locator('[data-page-cursor="'+id(20)+'"]').click();await expect(page.getByRole('alert')).toBeVisible();await expect(page.getByText('Private current learner',{exact:true})).toHaveCount(0);await expect(page.getByText('Current calendar meeting',{exact:true})).toHaveCount(0);await expect(page.locator('[data-page-cursor]')).toHaveCount(0);
 await page.getByRole('button',{name:locale==='ar'?'تحديث سجلات المدرسة':'Refresh school records',exact:true}).click();await expect(page.getByRole('heading',{name:'Private current learner',exact:true})).toBeVisible();expect(calls.filter(c=>c.startsWith('/v1/school/attendance?')&&!c.includes('cursor='))).toHaveLength(2);expect(errors).toEqual([]);
});
test('temporary Daily continuation outage retains admitted rows with recovery',async({page})=>{
 await mount(page,'en','unavailable');await page.locator('[data-page-cursor="'+id(20)+'"]').click();await expect(page.getByRole('alert')).toBeVisible();await expect(page.getByRole('heading',{name:'Private current learner',exact:true})).toBeVisible();await expect(page.locator('[data-page-cursor="'+id(20)+'"]')).toBeEnabled();
});

test('an unauthorized Daily continuation also withholds retained facts',async({page})=>{await mount(page,'en','unauthorized');await page.locator('[data-page-cursor="'+id(20)+'"]').click();await expect(page.getByRole('alert')).toBeVisible();await expect(page.getByText('Private current learner',{exact:true})).toHaveCount(0);await expect(page.locator('[data-page-cursor]')).toHaveCount(0);});

test('withheld Daily reading preserves an uncertain original command without retrying it',async({page})=>{await mount(page,'en','denied');const original=await page.evaluate(()=>{const journal=(globalThis as unknown as {dailyRefusalApp:{commandJournal:import('../../apps/web/shared/api/client').CommandJournal}}).dailyRefusalApp.commandJournal;return journal.prepare('/v1/school/calendar','/v1/school/calendar',{title:'Unsent original calendar command'});});await page.locator('[data-page-cursor="'+id(20)+'"]').click();await expect(page.getByRole('alert')).toBeVisible();expect(await page.evaluate(()=>(globalThis as unknown as {dailyRefusalApp:{commandJournal:import('../../apps/web/shared/api/client').CommandJournal}}).dailyRefusalApp.commandJournal.get('/v1/school/calendar'))).toEqual(original);await expect(page.getByText('Private current learner',{exact:true})).toHaveCount(0);});
