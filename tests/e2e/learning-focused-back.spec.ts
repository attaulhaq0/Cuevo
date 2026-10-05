import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';

const root = resolve(import.meta.dirname, '../..');
test('Learning selected staff work returns focus and keeps mobile outline and original commands scoped', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const built = await build({ stdin: { resolveDir: root, loader: 'tsx', contents: `
  import React,{useState}from'react';import{createRoot}from'react-dom/client';import{LearningWorkspace}from'./apps/web/features/learning/components/learning-workspace';import{CommandJournal}from'./apps/web/shared/api/client';import{FormDrafts}from'./apps/web/shared/session/form-drafts';
  const journal=new CommandJournal(),drafts=new FormDrafts();const course={id:'course',classId:'class',subjectId:'subject',title:'Learning strategies',description:'Show your thinking.',status:'PUBLISHED',createdAt:'2026-10-03T00:00:00Z',units:[{id:'unit',title:'Checking',sequence:1,lessons:[{id:'lesson',title:'Explain your approach',sequence:1,body:'Exact lesson material',status:'PUBLISHED',activities:[{id:'activity',title:'Explain one choice',kind:'practice',sequence:1,instructions:'Exact activity instructions'}]}]}]};const assessment={id:'task',courseId:'course',courseTitle:'Learning strategies',title:'Explain a method',instructions:'Exact task instructions',status:'PUBLISHED',model:'numeric',maxScore:10,dueAt:null,policyVersion:1,submissionKind:'TEXT',assignmentState:'OPEN',availabilityVersion:1,availableFrom:null,availableUntil:null,allowLate:true};const submission={id:'submission',assessmentId:'task',learnerId:'learner',assessmentTitle:'Explain a method',learnerName:'Lina · Cedar',content:'Original learner work',status:'SUBMITTED',submittedAt:'2026-10-03T00:00:00Z',revision:1,responseKind:'TEXT'};globalThis.learningFixture={journal,drafts,course,assessment,submission,reads:[],writes:[]};
  function Harness(){const[locale,setLocale]=useState('en'),[role,setRole]=useState('teacher');globalThis.learningApp={locale,membership:{schoolId:'school',userId:'actor',role,entitlements:['learning','assessment']},status:'ready',online:true,apiUrl:'',accessToken:'synthetic',accessGeneration:1,commandJournal:journal,formDrafts:drafts,announce(){},refreshAccess(){},reportDiagnostic(){}};return<div className='workspace' dir={locale==='ar'?'rtl':'ltr'}><button id='locale' onClick={()=>setLocale(x=>x==='en'?'ar':'en')}>Language</button><button id='role' onClick={()=>setRole('admin')}>Administrator</button><LearningWorkspace/></div>;}createRoot(document.getElementById('root')).render(<Harness/>);
  ` }, bundle: true, write: false, platform: 'browser', jsx: 'automatic', format: 'iife', plugins: [{ name: 'bounded-owner-inputs', setup(bundler) {
    bundler.onLoad({ filter: /shared[\\/]session[\\/]providers\.tsx$/ }, () => ({ loader: 'js', contents: 'export function useApp(){return globalThis.learningApp}' }));
    bundler.onLoad({ filter: /shared[\\/]hooks[\\/]use-paginated-query\.ts$/ }, () => ({ loader: 'js', contents: "export function usePaginatedLearningQuery(path,parse){const f=globalThis.learningFixture;const rows=path?.startsWith('/v1/courses?')?[f.course]:path?.startsWith('/v1/classes')?[{id:'class',name:'Cedar'}]:path?.startsWith('/v1/subjects')?[{id:'subject',name:'Mathematics'}]:path?.startsWith('/v1/assessments?')?[f.assessment]:path?.startsWith('/v1/submissions?')?[f.submission]:[];if(path)f.reads.push(path);return{data:rows.map(parse),loaded:true,loading:false,loadingMore:false,error:null,moreError:null,nextCursor:null,loadMore(){}}}" }));
    bundler.onLoad({ filter: /shared[\\/]hooks[\\/]use-api\.ts$/ }, () => ({ loader: 'js', contents: `import{commonEn,commonAr}from'${root.replaceAll('\\', '/')}/apps/web/shared/i18n/common';export function useApi(){const a=globalThis.learningApp;return{t:a.locale==='ar'?commonAr:commonEn,journal:a.commandJournal,request(...x){globalThis.learningFixture.writes.push(x);throw Error('Writes blocked')}}}export function useApiQuery(path,parse){const f=globalThis.learningFixture;if(path)f.reads.push(path);const value=path?.startsWith('/v1/courses/course?')?{...f.course,selectedUnitId:new URL(path,'https://fixture.invalid').searchParams.get('unitId')}:path?.startsWith('/v1/curriculum/learning-availability')?{items:[]}:path==='/v1/assessments/task'?f.assessment:null;f.queryCache??=new Map();const cached=f.queryCache.get(path);if(cached?.parse===parse)return cached.result;const result={data:value?parse(value):null,loading:false,error:null};f.queryCache.set(path,{parse,result});return result}` }));
    bundler.onLoad({ filter: /learning[\\/]components[\\/]content-editor\.tsx$/ }, () => ({ loader: 'tsx', contents: `import React from'react';export function LearningContentEditor(){return null}export function ConnectedAssessment(){return null}` }));
    bundler.onLoad({ filter: /learning[\\/]components[\\/](resources|thinking-focus|source-context|quiz|submission-documents)\.tsx$/ }, args => ({ loader: 'tsx', contents: `import React from'react';${args.path.endsWith('resources.tsx')?'export function LearningResources(){return null}':args.path.endsWith('thinking-focus.tsx')?'export function ThinkingFocusSummary(){return null}export function ThinkingFocusEditor(){return null}export function AssessmentCriterionThinkingFocus(){return null}':args.path.endsWith('source-context.tsx')?'export function LearningSourceContext(){return null}':args.path.endsWith('quiz.tsx')?'export function QuizWorkspace(){return null}':'export function SubmittedDocumentWork(){return <p>Original learner work</p>}export function SubmissionDocuments(){return null}'}` }));
    bundler.onLoad({ filter: /school[\\/]ui\.tsx$/ }, () => ({ loader: 'tsx', contents: 'export function TaskLearningSupport(){return null}' }));
    bundler.onLoad({ filter: /\.(webp|svg|png)$/ }, args => ({ loader: 'js', contents: 'export default ' + JSON.stringify({ src: 'data:image/' + (args.path.endsWith('.svg') ? 'svg+xml' : 'webp') + ';base64,' + readFileSync(args.path).toString('base64'), width: 128, height: 128 }) }));
  } }] });
  const css = ['packages/ui/src/tokens.css', 'apps/web/app/globals.css', 'apps/web/features/learning/styles.css'].map(file => readFileSync(resolve(root, file), 'utf8')).join('\n');
  await page.setContent(`<style>${css}</style><div id="root"></div>`); await page.addScriptTag({ content: "if(!crypto.randomUUID)crypto.randomUUID=()=> '30000000-0000-4000-8000-000000000001';" }); await page.addScriptTag({ content: built.outputFiles[0].text });
  const courseOpen = page.getByRole('button', { name: 'Open course', exact: true });
  await courseOpen.click(); await page.locator('.learning-preparation-outline').getByRole('button', { name: 'Explain your approach', exact: true }).click();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 }); await expect(page.locator('.learning-preparation-outline')).toBeHidden();
    const backOutline = page.getByRole('button', { name: /Back to course structure|العودة إلى بنية المقرر/, exact: true });
    await backOutline.click(); await expect(page.locator('.learning-preparation-outline')).toBeVisible();
    await expect(page.locator('.learning-preparation-main')).toBeHidden();
    const sameLesson=page.locator('.learning-preparation-outline').getByRole('button', { name: 'Explain your approach', exact: true });
    await sameLesson.focus(); await page.keyboard.press('Enter');
    await expect(page.locator('.course-view h1')).toBeFocused();
    const refresh=page.locator('.course-view__toolbar').getByRole('button',{name:/Refresh|تحديث/,exact:true});
    await refresh.focus(); await page.keyboard.press('Enter'); await expect(refresh).toBeFocused();
    await expect(page.getByRole('button', { name: /Back to courses|العودة إلى المقررات/, exact: true })).toBeEnabled();
    await page.locator('#locale').click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.evaluate(() => { const f = (globalThis as unknown as { learningFixture: { journal: { prepare: (slot: string, path: string, body: object) => void } } }).learningFixture; f.journal.prepare('/v1/learning-content/lesson/lesson/draft', '/v1/learning-content/lesson/lesson/draft', { title: 'Original change' }); });
  await expect(page.getByRole('button', { name: 'Back to courses', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Back to course structure', exact: true })).toBeDisabled();
  await page.evaluate(() => (globalThis as unknown as { learningFixture: { journal: { confirm: (slot: string) => void } } }).learningFixture.journal.confirm('/v1/learning-content/lesson/lesson/draft'));
  await page.getByRole('button', { name: 'Back to courses', exact: true }).click(); await expect(courseOpen).toBeFocused();
  await courseOpen.click();
  await page.getByRole('button', { name: 'Add unit', exact: true }).click();
  await expect(page.getByLabel('Title', { exact: true })).toBeVisible();
  await page.getByLabel('Title', { exact: true }).fill('Unsent current unit');
  await page.getByRole('button', { name: 'Back to course structure', exact: true }).click();
  await expect(page.locator('.learning-preparation-outline')).toBeVisible();
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Unsent current unit');
  await page.getByRole('button', { name: 'Back to courses', exact: true }).click();
  await page.locator('#role').click();
  for (const section of ['assessments', 'submissions']) {
    await page.locator(`[data-workspace-section="${section}"]`).click();
    const choice = page.locator(section === 'assessments' ? '[data-assessment-choice] button' : '[data-submission-choice] button').first();
    await choice.click(); const close = page.getByRole('button', { name: section === 'assessments' ? 'Close task' : 'Back to submitted work', exact: true });
    await close.click(); await expect(choice).toBeFocused();
    await choice.click();
    if (section === 'submissions') { await page.getByRole('button', { name: 'Return for revision', exact: true }).click(); await page.getByLabel('Revision feedback', { exact: true }).fill('Unsent exact feedback'); await close.click(); await choice.click(); await expect(page.getByLabel('Revision feedback', { exact: true })).toHaveValue('Unsent exact feedback'); }
    const path = section === 'assessments' ? '/v1/thinking-focus/assessment/task/draft' : '/v1/submissions/submission/return';
    await page.evaluate(path => (globalThis as unknown as { learningFixture: { journal: { prepare: (slot: string, path: string, body: object) => void } } }).learningFixture.journal.prepare(path, path, { original: true }), path);
    await expect(close).toBeDisabled(); await expect(page.locator('[data-workspace-section="courses"]')).toBeDisabled();
    await page.evaluate(path => (globalThis as unknown as { learningFixture: { journal: { confirm: (slot: string) => void } } }).learningFixture.journal.confirm(path), path);
    await close.click(); await expect(choice).toBeFocused();
  }
  expect(await page.evaluate(() => (globalThis as unknown as { learningFixture: { writes: unknown[] } }).learningFixture.writes)).toEqual([]); expect(errors).toEqual([]);
});
