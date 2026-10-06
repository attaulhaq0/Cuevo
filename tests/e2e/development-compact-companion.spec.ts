import { test, expect, type Page } from '@playwright/test';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import AxeBuilder from '@axe-core/playwright';

const root=resolve(process.cwd());
declare global { var compactFixture:{writes:string[];journal:{prepare(slot:string,path:string,body:object):unknown;confirm(slot:string):void}}; var compactChange:(mode:string)=>void; }
const css=['packages/ui/src/tokens.css','apps/web/app/globals.css','apps/web/features/development/styles.css','apps/web/shared/characters/styles.css'].map(p=>readFileSync(resolve(root,p),'utf8')).join('\n');
async function mount(page:Page,locale:'en'|'ar'){
 const bundle=await build({stdin:{resolveDir:root,loader:'tsx',contents:
"import React,{useState}from'react';import{createRoot}from'react-dom/client';import{DevelopmentWorkspace}from'./apps/web/features/development/components/development-workspace';import{CommandJournal}from'./apps/web/shared/api/client';import{FormDrafts}from'./apps/web/shared/session/form-drafts';"+
"const id=n=>'dc000000-0000-4000-8000-'+String(n).padStart(12,'0'),journal=new CommandJournal(),drafts=new FormDrafts();"+
"globalThis.compactFixture={reads:[],writes:[],mode:'recorded',journal,period:{id:id(3),classId:id(4),policyId:id(2),title:'Autumn learning',startsAt:'2026-10-01T00:00:00Z',endsAt:'2026-12-01T00:00:00Z'}};"+
"function Harness(){const[g,setG]=useState(1);globalThis.compactChange=mode=>{compactFixture.mode=mode;setG(x=>x+1)};globalThis.compactApp={locale:'"+locale+"',membership:{schoolId:id(9),userId:id(10),role:'student',entitlements:['learning','learner.state']},status:'ready',online:true,apiUrl:'',accessToken:'synthetic',accessGeneration:g,commandJournal:journal,formDrafts:drafts,refreshAccess(){},announce(){},reportDiagnostic(){}};return <main className='workspace' dir='"+(locale==='ar'?'rtl':'ltr')+"'><nav aria-label='Focused development navigation'><button>Back</button></nav><DevelopmentWorkspace/></main>}createRoot(document.getElementById('root')).render(<Harness/>);"
},bundle:true,write:false,platform:'browser',jsx:'automatic',format:'iife',plugins:[{name:'source-owned-ui-intercepts',setup(b){
 b.onLoad({filter:/shared[\\/]session[\\/]providers\.tsx$/},()=>({loader:'js',contents:'export function useApp(){return globalThis.compactApp}'}));
 b.onLoad({filter:/shared[\\/]hooks[\\/]use-paginated-query\.ts$/},()=>({loader:'js',contents:
"import{LearningApiError}from'"+root.replaceAll('\\','/')+"/apps/web/shared/api/client';const id=n=>'dc000000-0000-4000-8000-'+String(n).padStart(12,'0');export function usePaginatedLearningQuery(path,parse){const f=globalThis.compactFixture;if(path)f.reads.push(path);const ledger=[0,7,13].map((points,i)=>({id:id(100+i),learnerId:id(10),periodId:id(3),observationId:id(200+i),kind:['practice','revision','reflection'][i],points,occurredAt:'2026-10-03T00:00:00Z',policyId:id(2)})),milestones=[{id:id(30),learnerId:id(10),periodId:id(3),policyId:id(2),key:'first',title:'Recorded first step',minimumPoints:10,earnedAt:'2026-10-04T00:00:00Z'}],data=path?.includes('/periods?')?[f.period]:path?.includes('/ledger?')?ledger:path?.includes('/achievements?')?milestones:[];const denied=f.mode==='denied'&&path?.includes('/ledger?'),partial=f.mode==='partial'&&(path?.includes('/ledger?')||path?.includes('/achievements?'));return{data:denied||partial?[]:data.map(parse),loaded:true,loading:false,loadingMore:false,error:denied?new LearningApiError('denied'):null,moreError:null,nextCursor:partial?id(90):null,loadMore(){f.mode='recorded';globalThis.compactChange('recorded');}}}"
 }));
 b.onLoad({filter:/shared[\\/]hooks[\\/]use-api\.ts$/},()=>({loader:'js',contents:
"import{LearningApiError}from'"+root.replaceAll('\\','/')+"/apps/web/shared/api/client';export function useApi(){return{t:{save:compactApp.locale==='ar'?'حفظ':'Save',saving:compactApp.locale==='ar'?'جارٍ الحفظ…':'Saving…',choose:compactApp.locale==='ar'?'اختر':'Choose',retrySame:compactApp.locale==='ar'?'أعد الإجراء الأصلي':'Retry original',cancel:compactApp.locale==='ar'?'إلغاء':'Cancel',saved:compactApp.locale==='ar'?'حُفظ':'Saved'},journal:compactFixture.journal,request(){compactFixture.writes.push('POST');throw Error('No domainwrites allowed')}}}export function useApiQuery(path,parse){const f=compactFixture;const value=path?.includes('/summary')?parse({learnerId:compactApp.membership.userId,periodId:f.period.id,status:f.mode==='disabled'?'DISABLED':'RECORDED_ONLY',totalPoints:f.mode==='disabled'?null:20,leaderboardEnabled:false,streak:{status:f.mode==='disabled'?'DISABLED':'RECORDED',basis:'VERIFIED_RECOGNIZED_ACTION_DAYS',timezone:'UTC',days:f.mode==='disabled'?null:2,endingOn:f.mode==='disabled'?null:'2026-10-04',recordedDays:f.mode==='disabled'?null:4,sourceCount:f.mode==='disabled'?null:6}}):null;return{data:value,loading:false,error:null}}"
 }));
 b.onLoad({filter:/\.(webp|png|svg)$/},args=>({loader:'js',contents:'export default '+JSON.stringify({src:'data:image/'+(args.path.endsWith('.svg')?'svg+xml':'webp')+';base64,'+readFileSync(args.path).toString('base64'),width:128,height:128})}));
 }}]});
 await page.setContent('<!doctype html><html lang="'+locale+'" dir="'+(locale==='ar'?'rtl':'ltr')+'"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Development compact owner verification</title><style>'+css+'</style></head><body><div id="root"></div></body></html>');
 await page.addStyleTag({content:'.workspace{padding:16px;width:100%;}.workspace nav{min-height:44px}.field select{min-height:44px}'});
 await page.addScriptTag({content:"if(!crypto.randomUUID)crypto.randomUUID=()=> 'dc000000-0000-4000-8000-000000000500';"});
 await page.addScriptTag({content:bundle.outputFiles[0].text});
 await expect(page.locator('.development-workspace')).toBeVisible();
}
for(const locale of ['en','ar']as const)test('Student compact companion '+locale,async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(['error','warning'].includes(m.type()))errors.push(m.text())});
 await page.setViewportSize({width:1366,height:900});await mount(page,locale);
 const companion=page.locator('.development-companion'),context=page.locator('.development-context'),goals=page.locator('.development-goals');
 await expect(companion).toHaveCount(1);
 const box=await companion.boundingBox(),contextBox=await context.boundingBox(),goalsBox=await goals.boundingBox();
 expect(box!.y+box!.height).toBeLessThanOrEqual(goalsBox!.y);
 expect(box!.y).toBeLessThanOrEqual(contextBox!.y+1);if(locale==='en')expect(box!.x).toBeGreaterThan(contextBox!.x+contextBox!.width);else expect(box!.x+box!.width).toBeLessThan(contextBox!.x);
 expect(await companion.locator('.companion-view').evaluate(e=>e.getBoundingClientRect().width)).toBeLessThanOrEqual(80);
 const display=companion.getByLabel(locale==='en'?'Companion display':'عرض الرفيق');
 await display.selectOption('quiet');await expect(companion.locator('.companion-view')).toHaveAttribute('data-presentation','quiet');
 await display.selectOption('hidden');await expect(companion.locator('.companion-view')).toHaveCount(0);expect(await companion.locator('.development-companion__scene').evaluate(e=>getComputedStyle(e).minHeight)).toBe('0px');
 await display.selectOption('standard');await expect(companion.locator('.companion-view')).toHaveCount(1);
 const period=context.locator('select').first();await period.selectOption('dc000000-0000-4000-8000-000000000003');
 await expect(page.locator('.development-ledger__entry')).toHaveCount(3);await expect(page.locator('.development-ledger__points strong').first()).toHaveText(new Intl.NumberFormat(locale).format(0));
 await expect(page.locator('.development-about')).toHaveJSProperty('tagName','DETAILS');await expect(page.locator('.development-about')).not.toHaveAttribute('open','');
 for(const theme of ['light','dark'])for(const width of [1366,1024,768,390,320]){await page.locator('.workspace').evaluate((e,t)=>{e.setAttribute('data-theme',t);document.documentElement.style.colorScheme=t;},theme);await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await expect(companion).toBeVisible();await expect(page.locator('main h1')).toHaveCount(1);expect((await goals.boundingBox())!.y).toBeLessThanOrEqual((await page.locator('.development-recognition').boundingBox())!.y);if(width>1023){const g=await goals.boundingBox(),l=await page.locator('.development-section').boundingBox();expect(Math.abs(g!.x-l!.x)).toBeLessThan(1);expect(l!.y-(g!.y+g!.height)).toBeLessThanOrEqual(13);}expect((await display.boundingBox())!.height).toBeGreaterThanOrEqual(44);await page.screenshot({path:info.outputPath(info.project.name+'-'+locale+'-'+theme+'-'+width+'.png'),fullPage:true});}
 await page.evaluate(()=>globalThis.compactFixture.journal.prepare('/v1/development/leaderboard/participation','/v1/development/leaderboard/participation',{periodId:'dc000000-0000-4000-8000-000000000003'}));await expect(display).toBeDisabled();await expect(period).toBeDisabled();await page.evaluate(()=>compactFixture.journal.confirm('/v1/development/leaderboard/participation'));await expect(display).toBeEnabled();await page.getByRole('button',{name:locale==='en'?'Record a learning goal':'تسجيل هدف تعلّم',exact:true}).click();await expect(page.locator('.development-goals [data-state="empty"]')).toHaveCount(2);await page.evaluate(()=>globalThis.compactChange('partial'));await expect(page.locator('.development-section [data-state="review"]')).toBeVisible();await expect(page.locator('.development-section [data-state="empty"]')).toHaveCount(0);
 await page.evaluate(()=>globalThis.compactChange('denied'));await expect(page.locator('.development-section [role="alert"]')).toBeVisible();await expect(page.locator('.development-ledger__entry')).toHaveCount(0);
 expect((await new AxeBuilder({page}).include('.development-workspace').withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
 expect(errors).toEqual([]);expect(await page.evaluate(()=>globalThis.compactFixture.writes)).toEqual([]);
});
