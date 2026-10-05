import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';

const root = resolve(import.meta.dirname, '../..');
test('staff Progress keeps one explicit mobile reader and Back restores browse without another learner read', async ({ page }) => {
  const built = await build({ stdin: { resolveDir: root, loader: 'tsx', contents: `
  import React,{useState}from'react';import{createRoot}from'react-dom/client';import{ProgressWorkspace}from'./apps/web/features/progress/components/progress-workspace';import{getDictionary}from'./apps/web/shared/i18n/locale';import{CommandJournal,LearningApiError}from'./apps/web/shared/api/client';import{FormDrafts}from'./apps/web/shared/session/form-drafts';
  const journal=new CommandJournal(),drafts=new FormDrafts();globalThis.progressFixture={reads:[],writes:[],denied:false,people:[{userId:'learner',id:'learner',displayName:'Lina',role:'student',classLabels:['Cedar · Year 8']},{userId:'second',id:'second',displayName:'Sara',role:'student',classLabels:['Palm · Year 8']}],state:{learnerId:'learner',status:'UNKNOWN',generatedAt:null,version:null,academic:[],development:{practice:{count:null,observationIds:[]},revision:{count:null,observationIds:[]},reflection:{count:null,observationIds:[]},windowStart:null,windowEnd:null},engagement:{completedActivityCount:null,lastCompletedAt:null},support:{activeInterventionIds:[],items:[]},impact:{status:'unmeasured',measurementIds:[],outcomes:[]},sourceEventIds:[]}};
  function Harness(){const[locale,setLocale]=useState('en'),[role,setRole]=useState('teacher'),[generation,setGeneration]=useState(1);globalThis.progressApp={locale,dictionary:getDictionary(locale),membership:{schoolId:'school',userId:'actor',role,displayName:'Current staff',entitlements:['learning','assessment','curriculum','learner.state']},status:'ready',online:true,apiUrl:'',accessToken:'synthetic',accessGeneration:generation,formDrafts:drafts,commandJournal:journal,publicConfig:{supabaseUrl:'',supabasePublishableKey:'',apiUrl:''},refreshAccess(){},announce(){},reportDiagnostic(){}};return<div className='workspace'><button id='locale' onClick={()=>setLocale(x=>x==='en'?'ar':'en')}>Language</button><button id='role' onClick={()=>setRole(x=>x==='teacher'?'admin':'coordinator')}>Role</button><button id='deny' onClick={()=>{globalThis.progressFixture.denied=true;setGeneration(x=>x+1)}}>Denied current source</button><ProgressWorkspace key={role}/></div>;}createRoot(document.getElementById('root')).render(<Harness/>);
  ` }, bundle: true, write: false, platform: 'browser', jsx: 'automatic', format: 'iife', plugins: [{ name: 'bounded-current-read', setup(bundler) {
    bundler.onLoad({ filter: /shared[\\/]session[\\/]providers\.tsx$/ }, () => ({ loader: 'js', contents: 'export function useApp(){return globalThis.progressApp}' }));
    bundler.onLoad({ filter: /shared[\\/]hooks[\\/]use-child-context\.ts$/ }, () => ({ loader: 'js', contents: 'export function useChildContext(){return{parent:false,child:null,children:[],query:{loaded:true,loading:false,error:null,moreError:null,nextCursor:null}}}' }));
    bundler.onLoad({ filter: /shared[\\/]hooks[\\/]use-paginated-query\.ts$/ }, () => ({ loader: 'js', contents: "export function usePaginatedLearningQuery(path,parse){const f=globalThis.progressFixture;if(path)f.reads.push(path);return{data:path?.startsWith('/v1/people')?f.people.map(parse):[],loaded:true,loading:false,loadingMore:false,error:null,moreError:null,nextCursor:null,loadMore(){}}}" }));
    bundler.onLoad({ filter: /shared[\\/]hooks[\\/]use-api\.ts$/ }, () => ({ loader: 'js', contents: `import{LearningApiError}from'${root.replaceAll('\\', '/')}/apps/web/shared/api/client';import{commonEn,commonAr}from'${root.replaceAll('\\', '/')}/apps/web/shared/i18n/common';export function useApi(){const app=globalThis.progressApp;return{t:app.locale==='ar'?commonAr:commonEn,journal:app.commandJournal,request(...x){globalThis.progressFixture.writes.push(x);throw Error('Writes blocked')}}}export function useApiQuery(path,parse){const f=globalThis.progressFixture;if(path)f.reads.push(path);return path?.includes('/state')?(f.denied?{data:null,loading:false,error:new LearningApiError('denied')}:{data:parse(f.state),loading:false,error:null}):{data:null,loading:false,error:null}}` }));
    bundler.onLoad({ filter: /progress[\\/]components[\\/]class-learning-summary\.tsx$/ }, () => ({ loader: 'tsx', contents: `import React,{useEffect}from'react';import{useApp}from'${root.replaceAll('\\', '/')}/apps/web/shared/session/providers';import{CoordinatorClassChooser}from'./coordinator-class-chooser';export function ClassLearningSummaryPanel({onReviewLearner,selectedLearnerId,onLearnerContext,labelContext}){const app=useApp();useEffect(()=>{if(selectedLearnerId)onLearnerContext(selectedLearnerId,'Lina · Cedar',labelContext)},[selectedLearnerId,labelContext]);return<section className='class-learning-summary'><h2 className='class-summary-heading' tabIndex={-1}>Current class records</h2><select id='summary-class' defaultValue='Cedar'><option>Cedar</option></select><CoordinatorClassChooser enabled={app.membership.role==='coordinator'} sourceKey={labelContext} selectedLearnerId={selectedLearnerId} selectedLabel='Lina · Cedar' label='Choose learner'><button id='class-learner' onClick={()=>onReviewLearner('learner','Lina · Cedar')}>Review Lina</button></CoordinatorClassChooser></section>}` }));
    bundler.onLoad({ filter: /\.(webp|svg|png)$/ }, args => ({ loader: 'js', contents: 'export default ' + JSON.stringify({ src: 'data:image/' + (args.path.endsWith('.svg') ? 'svg+xml' : 'webp') + ';base64,' + readFileSync(args.path).toString('base64'), width: 128, height: 128 }) }));
  } }] });
  const css = ['packages/ui/src/tokens.css', 'apps/web/app/globals.css', 'apps/web/features/progress/styles.css'].map(path => readFileSync(resolve(root, path), 'utf8')).join('\n');
  await page.setContent(`<style>${css}</style><div id="root"></div>`); await page.addScriptTag({ content: built.outputFiles[0].text });
  await page.setViewportSize({ width: 1366, height: 768 });
  await expect(page.locator('.progress-detail')).toHaveCount(0); await expect(page.locator('#learner-selection')).toHaveValue('');
  await page.locator('#learner-selection').selectOption('learner');
  await expect(page.locator('.progress-detail')).toHaveCount(1); await expect(page.locator('.learner-detail-heading')).toContainText('Lina');
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.locator('.class-learning-summary')).toBeHidden(); await expect(page.locator('#learner-selection')).toBeHidden();
    const back = page.getByRole('button', { name: /Back to learners|العودة إلى الطلاب/, exact: true });
    await expect(back).toBeVisible(); await page.locator('#locale').click(); await back.focus(); await page.keyboard.press('Enter');
    await expect(page.locator('.progress-detail')).toHaveCount(0); await expect(page.locator('.class-learning-summary')).toBeVisible(); await expect(page.locator('#learner-selection')).toHaveValue('');
    await expect(page.locator('#learner-selection')).toBeFocused();
    const facts = await page.evaluate(() => (globalThis as unknown as { progressFixture: { reads: string[]; writes: unknown[] } }).progressFixture);
    expect(facts.reads.filter(path => path.includes('/second/state'))).toHaveLength(0); expect(facts.writes).toEqual([]);
    await page.locator('#learner-selection').selectOption('learner');
  }
  await page.locator('#deny').click(); await expect(page.locator('.progress-review-reading [role="alert"]')).toBeVisible();
  await expect(page.getByRole('button', { name: /Back to learners|العودة إلى الطلاب/, exact: true })).toBeVisible();
  for (const role of ['admin', 'coordinator']) {
    await page.locator('#role').click();
    await expect(page.locator('.progress-workspace')).toHaveAttribute('data-role', role);
    await expect(page.locator('#learner-selection')).toHaveValue('');
    await page.locator('#learner-selection').selectOption('learner');
    await expect(page.locator('#learner-selection')).toBeHidden(); await expect(page.locator('.class-learning-summary')).toBeHidden();
    await page.getByRole('button', { name: /Back to learners|العودة إلى الطلاب/, exact: true }).click();
    await expect(page.locator('#learner-selection')).toBeVisible(); await expect(page.locator('#learner-selection')).toHaveValue('');
    await expect(page.locator('.progress-detail')).toHaveCount(0);
  }
  const classChoice = page.locator('#class-learner');
  await classChoice.click();
  await expect(page.locator('.coordinator-class-chooser')).not.toHaveAttribute('open', '');
  await page.evaluate(() => { const picker = document.querySelector('#learner-selection') as HTMLSelectElement; picker.disabled = true; });
  await page.getByRole('button', { name: /Back to learners|العودة إلى الطلاب/, exact: true }).focus(); await page.keyboard.press('Enter');
  await expect(page.locator('.coordinator-class-chooser')).toHaveAttribute('open', '');
  await expect.poll(() => page.evaluate(() => document.activeElement?.id === 'class-learner' || document.activeElement?.classList.contains('class-summary-heading'))).toBe(true);
  await expect(page.locator('#summary-class')).toHaveValue('Cedar');
  // A retained opener can still have a box while an ancestor is closed; a
  // focus request can therefore do nothing. Verify the actual focus result.
  await classChoice.click();
  await page.evaluate(() => { const node=document.querySelector('#class-learner') as HTMLButtonElement; node.focus=()=>undefined; const picker=document.querySelector('#learner-selection') as HTMLSelectElement;picker.disabled=true; });
  await page.getByRole('button', { name: /Back to learners|العودة إلى الطلاب/, exact: true }).click();
  await expect(page.locator('.class-summary-heading')).toBeFocused();
  await expect(page.locator('#summary-class')).toHaveValue('Cedar');
});
