import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
async function mount(page: import('@playwright/test').Page, locale: 'en' | 'ar') {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const script = (await build({ write: false, bundle: true, platform: 'browser', format: 'iife', jsx: 'automatic', stdin: { resolveDir: root, loader: 'tsx', contents: `
import React from 'react';import {createRoot} from 'react-dom/client';import {TaskLearningSupport} from './apps/web/features/school/components/task-support';import {CommandJournal} from './apps/web/shared/api/client';import {FormDrafts} from './apps/web/shared/session/form-drafts';import {getDictionary} from './apps/web/shared/i18n/locale';
const actor='10000000-0000-4000-8000-000000000001',course='30000000-0000-4000-8000-000000000001';const app={locale:'${locale}',dictionary:getDictionary('${locale}'),membership:{schoolId:actor,userId:actor,role:'student',entitlements:['learning','assessment']},apiUrl:'https://support.fixture.invalid',accessToken:'fictional',accessGeneration:1,status:'ready',online:true,formDrafts:new FormDrafts(),commandJournal:new CommandJournal(),refreshAccess(){},reportDiagnostic(){}};globalThis.taskSupportApp=app;
globalThis.supportCalls=[];globalThis.supportRelease=null;globalThis.supportFailure='denied';globalThis.fetch=async(url,options)=>{const target=new URL(url);globalThis.supportCalls.push({path:target.pathname,cursor:target.searchParams.get('cursor'),method:options?.method??'GET'});if(target.searchParams.has('cursor')){if(globalThis.supportRelease===null&&globalThis.supportCalls.filter(c=>c.cursor).length===1)return new Response(JSON.stringify({code:globalThis.supportFailure==='denied'?'FORBIDDEN':'REQUEST_UNAVAILABLE'}),{status:globalThis.supportFailure==='denied'?403:503});return await new Promise(done=>{globalThis.supportRelease=()=>done(new Response(JSON.stringify({items:[],nextCursor:null}),{status:200}));});}return new Response(JSON.stringify({items:[{id:'support',learnerId:actor,learnerName:'School learner',courseId:course,courseTitle:'Checking course',assessmentId:course,assessmentTitle:'Checking task',title:'Current approved guide',instructions:'Private current support instructions',effectiveFrom:'2026-10-01',effectiveTo:'2026-10-31',revision:1,state:'ACTIVE',studentVisible:true,parentVisible:false}],nextCursor:'40000000-0000-4000-8000-000000000001'}),{status:200});};createRoot(document.getElementById('root')).render(<main><h1>Current task</h1><TaskLearningSupport courseId={course} assessmentId={course}/></main>);
` }, plugins: [{ name: 'controlled-session-and-icons', setup(bundler) { bundler.onLoad({ filter: /shared[\\/]session[\\/]providers\.tsx$/ }, () => ({ loader: 'js', contents: 'export function useApp(){return globalThis.taskSupportApp}' })); bundler.onLoad({ filter: /\.(webp|png|svg)$/ }, args => ({ loader: 'js', contents: 'export default ' + JSON.stringify({ src: 'data:image/webp;base64,' + readFileSync(args.path).toString('base64') }) })); } }] })).outputFiles[0].text;
  await page.route('**/*', route => route.request().url() === 'http://localhost/task-support' ? route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }) : route.abort());
  await page.goto('http://localhost/task-support'); await page.addScriptTag({ content: script });
  await expect(page.getByText('Private current support instructions', { exact: true })).toBeVisible();
  return errors;
}
for (const locale of ['en', 'ar'] as const) test(`${locale}: refused continuation stays withheld through retry until a fresh initial support read`, async ({ page }) => {
  const errors = await mount(page, locale), more = page.locator('[data-page-cursor="40000000-0000-4000-8000-000000000001"]');
  await more.click(); await expect(page.getByRole('alert')).toBeVisible(); await expect(page.getByText('Private current support instructions', { exact: true })).toHaveCount(0);
  await more.click(); await expect.poll(() => page.evaluate(() => typeof (globalThis as unknown as { supportRelease: unknown }).supportRelease)).toBe('function');
  await expect(page.getByText('Private current support instructions', { exact: true })).toHaveCount(0); await expect(page.getByRole('alert')).toBeVisible();
  await page.evaluate(() => (globalThis as unknown as { supportRelease: () => void }).supportRelease());
  await expect(page.getByText('Private current support instructions', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: locale === 'ar' ? 'تحديث سجلات المدرسة' : 'Refresh school records', exact: true }).click();
  await expect(page.getByText('Private current support instructions', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (globalThis as unknown as { supportCalls: { method: string; cursor: string | null }[] }).supportCalls)).toEqual([{ path: '/v1/school/learning-support', cursor: null, method: 'GET' }, { path: '/v1/school/learning-support', cursor: '40000000-0000-4000-8000-000000000001', method: 'GET' }, { path: '/v1/school/learning-support', cursor: '40000000-0000-4000-8000-000000000001', method: 'GET' }, { path: '/v1/school/learning-support', cursor: null, method: 'GET' }]);
  expect(errors).toEqual([]);
});
test('a transient continued read failure retains currently admitted support instructions', async ({ page }) => {
  const errors = await mount(page, 'en'); await page.evaluate(() => { (globalThis as unknown as { supportFailure: string }).supportFailure = 'unavailable'; });
  await page.locator('[data-page-cursor="40000000-0000-4000-8000-000000000001"]').click(); await expect(page.getByRole('alert')).toBeVisible(); await expect(page.getByText('Private current support instructions', { exact: true })).toBeVisible(); expect(errors).toEqual([]);
});
