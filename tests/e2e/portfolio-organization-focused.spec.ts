import assert from 'node:assert/strict';
import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Real feature/form/parsers with synthetic read/session boundaries. No product
// write or provider call is permitted; this proves presentation and recovery.
const root = resolve(import.meta.dirname, '../..');
async function ownerBundle() {
  const output = await build({ stdin: { resolveDir: root, loader: 'tsx', contents: `
    import React,{useState}from'react';import{createRoot}from'react-dom/client';import{PortfolioOrganization}from'./apps/web/features/portfolio/components/organization';import{CommandJournal,LearningApiError}from'./apps/web/shared/api/client';import{FormDrafts}from'./apps/web/shared/session/form-drafts';import{getDictionary}from'./apps/web/shared/i18n/locale';
    const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),journal=new CommandJournal(),drafts=new FormDrafts();
    const item=n=>({id:id(n),revisionId:id(n+10),revision:1,learnerId:id(50),sourceModel:'numeric',title:n===1?'My first checking explanation':'My second checking explanation',reflection:'I checked one recorded step.',createdAt:'2026-10-03T09:00:00Z',feedback:null,featured:false,approvalState:'AWAITING_REVIEW',parentVisible:false,reviewedAt:null,evidenceId:id(n+20),resultId:id(n+30),submissionId:id(n+40),referenceId:id(60),referenceVersion:'school-1',policyVersion:1,nativeResult:{type:'numeric',score:0,maxScore:10,policyVersion:1},assessmentTitle:'Explain a check',referenceTitle:'Checking steps',identity:{status:'READY',learnerName:'Alex Reed',className:'Cedar',yearGroupName:'Year 4',academicYearName:'2026–2027',courseTitle:'Reasoning',assessmentTitle:'Explain a check',submittedAt:'2026-10-03T08:00:00Z',submissionRevision:1}});
    const request=n=>({id:id(n+70),itemId:id(n),revisionId:id(n+10),learnerId:id(50),learnerName:'Alex Reed',title:item(n).title,message:'Please review my checking step.',state:'PENDING',requestedAt:'2026-10-03T10:00:00Z'});
    globalThis.portfolioOrgFixture={items:[item(1),item(2)],collections:[{id:id(80),title:'Checking examples',description:'My recorded checks'}],requests:[],writes:[],reads:[],placementRevision:0,denied:false};
    if(!crypto.randomUUID)Object.defineProperty(crypto,'randomUUID',{value:()=>id(99)});
    function Harness(){const[locale,setLocale]=useState('en'),[role,setRole]=useState('student'),[refresh,setRefresh]=useState(0),[mount,setMount]=useState(0);globalThis.portfolioOrgApp={locale,dictionary:getDictionary(locale),membership:{schoolId:id(90),userId:id(50),role,entitlements:['portfolio']},apiUrl:'',accessToken:'synthetic',accessGeneration:1,status:'ready',online:true,formDrafts:drafts,commandJournal:journal,announce(){}};globalThis.portfolioOrgJournal=journal;globalThis.portfolioOrgRefresh=()=>setRefresh(x=>x+1);globalThis.portfolioOrgRemount=()=>setMount(x=>x+1);return<div className='workspace'><h1>Portfolio</h1><button id='locale' onClick={()=>{setLocale(x=>x==='en'?'ar':'en');document.documentElement.dir=locale==='en'?'rtl':'ltr'}}>Language</button><button id='teacher' onClick={()=>{globalThis.portfolioOrgFixture.requests=[request(1),request(2)];setRole('teacher')}}>Teacher role</button><PortfolioOrganization key={mount} items={globalThis.portfolioOrgFixture.items} refresh={refresh} onChanged={()=>setRefresh(x=>x+1)}/></div>;}createRoot(document.getElementById('root')).render(<Harness/>);
  ` }, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', plugins: [{ name: 'current-portfolio-boundaries', setup(bundler) {
    bundler.onLoad({ filter: /shared[\\/]session[\\/]providers\.tsx$/ }, () => ({ loader: 'js', contents: 'export function useApp(){return globalThis.portfolioOrgApp}' }));
    bundler.onLoad({ filter: /shared[\\/]hooks[\\/]use-api\.ts$/ }, () => ({ loader: 'js', contents: `import{commonEn,commonAr}from'${root.replaceAll('\\', '/')}/apps/web/shared/i18n/common';import{LearningApiError}from'${root.replaceAll('\\', '/')}/apps/web/shared/api/client';export function useApi(){const a=globalThis.portfolioOrgApp;return{t:a.locale==='ar'?commonAr:commonEn,journal:a.commandJournal,request(...args){globalThis.portfolioOrgFixture.writes.push(args);return Promise.reject(new LearningApiError('unavailable',true))}}}export function useApiQuery(path,parse){const f=globalThis.portfolioOrgFixture;if(!path)return{data:null,loading:false,error:null};f.reads.push(path);if(f.denied)return{data:null,loading:false,error:new LearningApiError('denied')};const item=f.items.find(x=>path.includes(x.id));let value;if(path.endsWith('/placement'))value={id:item.id,collectionId:null,position:1,revision:f.placementRevision};else if(path.includes('/collections/'))value={id:f.collections[0].id,title:f.collections[0].title,items:[],nextCursor:null};else{const r=f.requests.find(x=>path.includes(x.id)),i=f.items.find(x=>x.id===r.itemId);value={requestId:r.id,itemId:i.id,revisionId:i.revisionId,revision:i.revision,title:i.title,reflection:i.reflection,learnerId:i.learnerId,learnerName:i.identity.learnerName,sourceModel:i.sourceModel,nativeResult:i.nativeResult,evidenceId:i.evidenceId,resultId:i.resultId,assessmentTitle:i.assessmentTitle,referenceTitle:i.referenceTitle,work:null};}return{data:parse(value),loading:false,error:null}}` }));
    bundler.onLoad({ filter: /shared[\\/]hooks[\\/]use-paginated-query\.ts$/ }, () => ({ loader: 'js', contents: "export function usePaginatedLearningQuery(path,parse){const f=globalThis.portfolioOrgFixture;return{data:path?(path.includes('/collections?')?f.collections:f.requests).map(parse):[],loaded:true,loading:false,loadingMore:false,error:null,moreError:null,nextCursor:null,loadMore(){}}}" }));
    bundler.onLoad({ filter: /\.(webp|png|svg)$/ }, args => ({ loader: 'js', contents: 'export default '+JSON.stringify({ src: 'data:image/'+(args.path.endsWith('.svg')?'svg+xml':args.path.endsWith('.png')?'png':'webp')+';base64,'+readFileSync(args.path).toString('base64'), width:128,height:128 }) }));
  } }] });
  return output.outputFiles[0].text;
}
async function open(page: import('@playwright/test').Page) {
  const css = ['packages/ui/src/tokens.css','apps/web/app/globals.css','apps/web/features/portfolio/styles.css'].map(path=>readFileSync(resolve(root,path),'utf8')).join('\n');
  await page.setContent(`<style>${css}</style><div id='root'></div>`); await page.addScriptTag({content:await ownerBundle()});
  await page.locator('.portfolio-organization').waitFor();
}

test('Student organization opens one explicit action and preserves exact original pending recovery', async ({page}) => {
  await page.setViewportSize({width:1366,height:768}); await open(page);
  const layout=page.locator('.portfolio-organization-layout');
  expect(await layout.evaluate(el=>el.querySelector('.portfolio-collection-controls')!.getBoundingClientRect().width>el.getBoundingClientRect().width-2)).toBe(true);
  await page.getByLabel('Selected portfolio work',{exact:true}).selectOption('00000000-0000-4000-8000-000000000001');
  await expect(page.locator('.portfolio-organization .learning-form')).toHaveCount(0);
  await page.getByRole('button',{name:'Request teacher feedback',exact:true}).click();
  await expect(page.locator('.portfolio-organization .learning-form')).toHaveCount(1);
  await expect(page.getByLabel('I request feedback on this exact reflection revision')).not.toBeChecked();
  const checkbox=page.getByLabel('I request feedback on this exact reflection revision');
  const checkboxSize=await checkbox.boundingBox();expect(checkboxSize!.width).toBeLessThanOrEqual(24);expect(checkboxSize!.height).toBeLessThanOrEqual(24);
  expect(await checkbox.locator('..').evaluate(el=>getComputedStyle(el).display)).toBe('flex');
  await page.getByText('I request feedback on this exact reflection revision',{exact:true}).click();await expect(checkbox).toBeChecked();await checkbox.uncheck();
  await page.screenshot({path:resolve('C:/Users/hp/.codex/visualizations/2026/10/05','portfolio-student-one-action-desktop.png')});
  await page.getByLabel('What feedback would help').fill('Please explain my first check');
  await page.getByLabel('I request feedback on this exact reflection revision').check();
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.getByLabel('Selected portfolio work',{exact:true}).selectOption('00000000-0000-4000-8000-000000000002');
  await page.getByRole('button',{name:'Request teacher feedback',exact:true}).click();
  await expect(page.getByLabel('What feedback would help')).toHaveValue('');
  await expect(page.getByLabel('I request feedback on this exact reflection revision')).not.toBeChecked();
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.getByRole('button',{name:'Place selected work',exact:true}).click();
  await page.getByLabel('Order in collection').fill('2');
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await expect(page.getByRole('button',{name:'Retry the same action',exact:true})).toBeVisible();
  await expect(page.getByLabel('Selected portfolio work',{exact:true})).toBeDisabled();
  await expect(page.locator('#portfolio-collection')).toBeDisabled();
  await expect(page.getByRole('button',{name:'Create named collection',exact:true})).toBeDisabled();
  const original=await page.evaluate(()=>(globalThis as unknown as {portfolioOrgJournal:{pending():unknown[]}}).portfolioOrgJournal.pending());
  await page.evaluate(()=>{const g=globalThis as unknown as {portfolioOrgFixture:{placementRevision:number},portfolioOrgRefresh():void};g.portfolioOrgFixture.placementRevision=5;g.portfolioOrgRefresh()});
  await expect(page.getByRole('button',{name:'Retry the same action',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>(globalThis as unknown as {portfolioOrgJournal:{pending():unknown[]}}).portfolioOrgJournal.pending())).toEqual(original);
  await expect(page.locator('.portfolio-organization form [name]')).toHaveCount(0);
  await page.evaluate(()=>(globalThis as unknown as {portfolioOrgRemount():void}).portfolioOrgRemount());
  await expect(page.getByRole('button',{name:'Retry the same action',exact:true})).toBeVisible();
  await expect(page.getByLabel('Selected portfolio work',{exact:true})).toBeDisabled();
  expect(await page.evaluate(()=>(globalThis as unknown as {portfolioOrgJournal:{pending():unknown[]}}).portfolioOrgJournal.pending())).toEqual(original);
  expect((await page.evaluate(()=>(globalThis as unknown as {portfolioOrgFixture:{writes:unknown[]}}).portfolioOrgFixture.writes)).length).toBe(1);
});

test('Teacher requested source reader stays beside its queue and mobile Back restores the directory', async ({page},info) => {
  await page.setViewportSize({width:1366,height:768}); await open(page); await page.locator('#teacher').click();
  await expect(page.locator('.portfolio-requested-review')).toHaveCount(0);
  await page.locator('[data-portfolio-request-id]').first().getByRole('button',{name:'Open requested source work',exact:true}).click();
  const reader=page.locator('.portfolio-requested-review'),queue=page.locator('.portfolio-feedback-requests');
  expect(await reader.evaluate(el=>el.parentElement?.classList.contains('portfolio-organization-layout'))).toBe(true);
  await expect(reader.getByText('I checked one recorded step.',{exact:true})).toBeVisible();
  await expect(reader.locator('[name="confirmSourceReview"]')).not.toBeChecked();
  await page.screenshot({path:resolve('C:/Users/hp/.codex/visualizations/2026/10/05',`portfolio-requested-${info.project.name}-desktop.png`)});
  await reader.locator('[name="feedback"]').fill('My exact first review');
  for(const width of [390,320]) {
    await page.setViewportSize({width,height:844}); await expect(queue).toBeHidden();
    await reader.locator('[name="feedback"]').fill('My exact first review');
    await page.locator('#locale').click();
    const back=page.getByRole('button',{name:/Back to feedback requests|العودة إلى طلبات الملاحظات/,exact:true});await back.click();
    await expect(queue).toBeVisible();await expect(reader).toHaveCount(0);
    const opener=queue.locator('article').first().getByRole('button');await expect(opener).toBeFocused();await opener.click();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  await reader.locator('[name="feedback"]').fill('My exact first review');await reader.locator('[name="confirmSourceReview"]').check();
  await reader.getByRole('button',{name:/Save|حفظ/,exact:true}).click();
  await expect(page.getByRole('button',{name:/Back to feedback requests|العودة إلى طلبات الملاحظات/,exact:true})).toBeDisabled();
  for(const button of await queue.locator('article button').all())await expect(button).toBeDisabled();
  const writes=await page.evaluate(()=>(globalThis as unknown as {portfolioOrgFixture:{writes:unknown[][]}}).portfolioOrgFixture.writes);
  assert.equal(writes.length,1);assert.ok(JSON.stringify(writes[0]).includes('00000000-0000-4000-8000-000000000001/review'));
  await page.evaluate(()=>{const g=globalThis as unknown as {portfolioOrgFixture:{requests:unknown[];denied:boolean},portfolioOrgRefresh():void};g.portfolioOrgFixture.requests=[];g.portfolioOrgFixture.denied=true;g.portfolioOrgRefresh()});
  await expect(reader).toBeVisible();await expect(reader.getByText('I checked one recorded step.',{exact:true})).toHaveCount(0);
  await expect(reader.getByRole('button',{name:/Retry the same action|إعادة الإجراء نفسه/,exact:true})).toBeVisible();
  await expect(reader.locator('form [name]')).toHaveCount(0);
  await page.evaluate(()=>(globalThis as unknown as {portfolioOrgRemount():void}).portfolioOrgRemount());
  await expect(reader).toBeVisible();await expect(reader.getByRole('button',{name:/Retry the same action|إعادة الإجراء نفسه/,exact:true})).toBeVisible();
  await expect(reader.getByText('I checked one recorded step.',{exact:true})).toHaveCount(0);
  await page.evaluate(()=>{const g=globalThis as unknown as {portfolioOrgApp:{formDrafts:{clear():void}},portfolioOrgRemount():void};g.portfolioOrgApp.formDrafts.clear();g.portfolioOrgRemount()});
  await expect(reader).toHaveCount(0);
  const recovery=page.getByRole('region',{name:/Check previous Portfolio action|التحقّق من إجراء الحافظة السابق/,exact:true});
  await expect(recovery).toBeVisible();await expect(recovery.locator('form [name]')).toHaveCount(0);
  await expect(recovery.getByRole('button',{name:/Retry the same action|إعادة الإجراء نفسه/,exact:true})).toBeVisible();
  const path=resolve('C:/Users/hp/.codex/visualizations/2026/10/05',`portfolio-requested-${info.project.name}-mobile.png`);await page.screenshot({path});
});
