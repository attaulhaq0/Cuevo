import assert from 'node:assert/strict';
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';

const root = resolve(import.meta.dirname, '../..');
async function ownerBundle() {
  const output = await build({ stdin: { resolveDir: root, loader: 'tsx', contents: `
  import React,{useState}from'react';import{createRoot}from'react-dom/client';import{CourseObjectives}from'./apps/web/features/curriculum/components/course-objectives';import{CommandJournal,LearningApiError}from'./apps/web/shared/api/client';import{FormDrafts}from'./apps/web/shared/session/form-drafts';import{getDictionary}from'./apps/web/shared/i18n/locale';
  const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),courseId=id(1),programmeId=id(2),journal=new CommandJournal(),drafts=new FormDrafts();
  globalThis.objectiveFixture={course:{id:courseId,classId:id(6),subjectId:id(7),title:'School checking',description:'School-authored course',status:'PUBLISHED',createdAt:'2026-10-03T00:00:00Z',units:[],curriculumContext:{version:1,programmeId,referenceId:id(9)}},programme:{id:programmeId,packVersionId:id(5),name:'School primary',classId:id(6),className:'Cedar',subjectId:id(7),subjectName:'School subject',yearGroupId:id(8),yearGroupName:'Year 1',academicYearName:'2026–2027',framework:'School Custom',packProgramme:'School primary source',packVersion:'school-1'},page:{version:2,scopeStatus:'READY',courseTitle:'School checking',programmeName:'School primary',packVersion:'school-1',subjectName:'School subject',yearGroupName:'Year 1',items:[{id:id(3),academicReferenceId:null,title:'Explain the school example',description:'Explain one checking step.',type:'objective',parentTitle:'School subject',approved:false,approvalReason:null,version:'school-1'},{id:id(4),academicReferenceId:null,title:'Compare the recorded reasons',description:'Compare the two current examples.',type:'objective',parentTitle:'School subject',approved:false,approvalReason:null,version:'school-1'}],nextCursor:null},paths:[],requests:[],denied:false};
  if(!crypto.randomUUID)Object.defineProperty(crypto,'randomUUID',{value:()=>id(50)});
  function Harness(){const[locale,setLocale]=useState('en'),[role,setRole]=useState('coordinator'),[pending,setPending]=useState(false),[version,setVersion]=useState(0);globalThis.objectiveApp={locale,dictionary:getDictionary(locale),membership:{schoolId:id(10),userId:id(11),role,entitlements:['curriculum']},apiUrl:'',accessToken:'synthetic',accessGeneration:version,status:'ready',online:true,formDrafts:drafts,commandJournal:journal,announce(){}};globalThis.objectiveSetVersion=setVersion;return<div className='workspace'><h1>Current source objectives</h1><button id='locale' onClick={()=>setLocale(x=>x==='en'?'ar':'en')}>Language</button><button id='teacher' onClick={()=>setRole('teacher')}>Teacher role</button><button id='recover' onClick={()=>{drafts.remove(id(10)+':'+id(11)+':/v1/curriculum/courses/'+courseId+'/objectives:selection');setRole('admin')}}>Recovery owner</button><button id='pending' onClick={()=>{if(pending)journal.clear();else journal.prepare('/v1/curriculum/courses/'+courseId+'/objectives','/v1/curriculum/courses/'+courseId+'/objectives',{referenceId:id(3),expectedVersion:2,reason:'Reviewed current source',confirmConfiguration:true});setPending(x=>!x)}}>Original pending command</button><CourseObjectives key={role} courseId={courseId} onChanged={()=>{}} /></div>;}createRoot(document.getElementById('root')).render(<Harness/>);
  ` }, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', plugins: [{ name: 'current-owner-fixture', setup(bundler) {
    bundler.onLoad({ filter: /shared[\\/]session[\\/]providers\.tsx$/ }, () => ({ loader: 'js', contents: 'export function useApp(){return globalThis.objectiveApp}' }));
    bundler.onLoad({ filter: /shared[\\/]hooks[\\/]use-api\.ts$/ }, () => ({ loader: 'js', contents: `import{commonEn,commonAr}from'${root.replaceAll('\\', '/')}/apps/web/shared/i18n/common';export function useApi(){const app=globalThis.objectiveApp;return{t:app.locale==='ar'?commonAr:commonEn,journal:app.commandJournal,request(...args){globalThis.objectiveFixture.requests.push(args);throw Error('Product writes blocked')}}}export function useApiQuery(path,parse){if(!path)return{data:null,loading:false,error:null};globalThis.objectiveFixture.paths.push(path);const f=globalThis.objectiveFixture;return{data:parse(path.startsWith('/v1/courses/')?f.course:f.page),loading:false,error:null}}` }));
    bundler.onLoad({ filter: /shared[\\/]hooks[\\/]use-paginated-query\.ts$/ }, () => ({ loader: 'js', contents: "export function usePaginatedLearningQuery(path,parse){if(path)globalThis.objectiveFixture.paths.push(path);return{data:path?[parse(globalThis.objectiveFixture.programme)]:[],loaded:true,loading:false,loadingMore:false,error:null,moreError:null,nextCursor:null,loadMore(){}}}" }));
    bundler.onLoad({ filter: /\.webp$/ }, args => ({ loader: 'js', contents: 'export default ' + JSON.stringify({ src: 'data:image/webp;base64,' + readFileSync(args.path).toString('base64'), width: 128, height: 128 }) }));
  } }] });
  return output.outputFiles[0].text;
}

test('current course objective directory uses full width before selection and one locked reader with Back on mobile', async ({ page }) => {
  const bundle = await ownerBundle(), css = ['packages/ui/src/tokens.css', 'apps/web/app/globals.css', 'apps/web/features/curriculum/styles.css'].map(path => readFileSync(resolve(root, path), 'utf8')).join('\n');
  await page.setContent(`<style>${css}</style><div id="root"></div>`); await page.addScriptTag({ content: bundle });
  await page.setViewportSize({ width: 1366, height: 768 });
  const layout = page.locator('.curriculum-course-review__layout'), list = page.locator('.curriculum-course-review__list');
  await list.waitFor();
  const before = await layout.evaluate(element => ({ width: element.getBoundingClientRect().width, list: element.querySelector('.curriculum-course-review__list')!.getBoundingClientRect().width }));
  expect(before.list).toBeGreaterThan(before.width - 2); await expect(page.locator('.curriculum-course-review__approval')).toHaveCount(0);
  await page.locator('.curriculum-course-review__objective').first().getByRole('button').click();
  await expect(page.locator('.curriculum-course-review__approval')).toHaveCount(1);
  await expect(page.locator('.curriculum-course-review__approval [name="confirmConfiguration"]')).not.toBeChecked();
  await page.locator('.curriculum-course-review__approval [name="reason"]').fill('My current review');
  const paths = await page.evaluate(() => (globalThis as unknown as { objectiveFixture: { paths: string[] } }).objectiveFixture.paths);
  assert.ok(paths.every(path => /^\/v1\/(courses\/|curriculum\/programmes|curriculum\/courses\/)/.test(path)));
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(list).toBeHidden();
    await expect(page.locator('.curriculum-course-review__approval [name="reason"]')).toHaveValue('My current review');
    await page.locator('#locale').click();
    const back = page.getByRole('button', { name: /Back to objectives|العودة إلى الأهداف/, exact: true });
    await expect(back).toBeEnabled(); await back.focus(); await page.keyboard.press('Enter');
    await expect(list).toBeVisible(); await expect(page.locator('.curriculum-course-review__approval')).toHaveCount(0);
    expect(await page.locator('.curriculum-course-review__objective').first().getByRole('button').evaluate(element => document.activeElement === element)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator('.curriculum-course-review__objective').first().getByRole('button').click();
    await page.locator('.curriculum-course-review__approval [name="reason"]').fill('My current review');
  }
  await page.locator('#pending').click();
  await expect(page.getByRole('button', { name: /Back to objectives|العودة إلى الأهداف/, exact: true })).toBeDisabled();
  for (const button of await page.locator('.curriculum-course-review__objective button').all()) await expect(button).toBeDisabled();
  await page.locator('#recover').click();
  await expect(page.locator('.curriculum-course-review__layout > .curriculum-course-review__recovery')).toHaveCount(1);
  await expect(list).toBeHidden();
  await expect(page.locator('.curriculum-course-review__recovery [name="reason"]')).toHaveCount(0);
  await page.locator('#pending').click();
  await page.locator('#teacher').click();
  await expect(page.locator('.curriculum-course-review__approval')).toHaveCount(0);
  await expect(page.locator('.curriculum-course-review__objective button')).toHaveCount(0);
  await expect(list).toBeVisible();
  expect(await page.evaluate(() => (globalThis as unknown as { objectiveFixture: { requests: unknown[] } }).objectiveFixture.requests)).toEqual([]);
});
