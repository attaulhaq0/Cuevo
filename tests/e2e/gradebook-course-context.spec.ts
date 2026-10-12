import { test, expect, type Page } from '@playwright/test';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '../..');
const id = (n: number) => `d8000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
type Resource = 'courses' | 'classes' | 'subjects';
type Mode = 'ready' | 'held' | 'partial' | 'denied' | 'unavailable' | 'missing' | 'ambiguous' | 'invalid';
type Probe = { calls: { path: string; method: string }[]; state: Record<Resource, Mode>; classId: string; changes: Record<string, string>; release: (() => void)[]; app: { commandJournal: { prepare(slot: string, path: string, body: object): unknown; get(slot: string): unknown }; formDrafts: { model(slot: string): unknown } }; refresh(): void; remount(): void };
type Globals = { gradebookContextProbe: Probe };
async function mount(page: Page, locale: 'en' | 'ar', changes: Partial<Record<Resource, Mode>> = {}) {
  const source = (await build({ stdin: { resolveDir: root, loader: 'tsx', contents: `
import React,{createContext,useContext,useState}from'react';import{createRoot}from'react-dom/client';import{ClassGradebook}from'./apps/web/features/academic/components/gradebook';import{CommandJournal}from'./apps/web/shared/api/client';import{FormDrafts}from'./apps/web/shared/session/form-drafts';import{getDictionary}from'./apps/web/shared/i18n/locale';
const C=createContext(null);globalThis.gradebookContextC=C;globalThis.gradebookContextUC=useContext;const id=n=>'d8000000-0000-4000-8000-'+String(n).padStart(12,'0'),journal=new CommandJournal(),drafts=new FormDrafts(),f=globalThis.gradebookContextProbe={calls:[],state:{courses:'ready',classes:'ready',subjects:'ready'},classId:id(3),changes:{},release:[]};const course=n=>({id:id(n),classId:n===1?f.classId:id(4),subjectId:id(5),title:'School mathematics',description:'Current class course',status:'PUBLISHED',createdAt:'2026-10-12T00:00:00Z'});
globalThis.fetch=async(raw,options)=>{const u=new URL(String(raw));f.calls.push({path:u.pathname+u.search,method:options?.method??'GET'});if(options?.method==='POST')throw Error('No effect permitted');if(u.pathname.endsWith('/gradebook')){const first=u.pathname.includes(id(1));return Response.json({courseId:first?id(1):id(2),courseTitle:'School mathematics',className:first?'Cedar':'Maple',yearGroupName:'Year 4',assessments:[],items:[],learnerTotal:0,assessmentTotal:0,nextLearnerCursor:null,nextAssessmentCursor:null})};const resource=u.pathname.split('/').at(-1),mode=f.state[resource];if(mode==='held')await new Promise(done=>f.release.push(done));if(mode==='denied'||mode==='unavailable')return Response.json({code:mode==='denied'?'FORBIDDEN':'REQUEST_UNAVAILABLE'},{status:mode==='denied'?403:503});let rows=resource==='courses'?[course(1),course(2)]:resource==='classes'?[{id:id(3),name:'Cedar',yearGroupName:'Year 4',academicYearName:'2026–2027'},{id:id(4),name:mode==='ambiguous'?'Cedar':'Maple',yearGroupName:'Year 4',academicYearName:'2026–2027'}]:[{id:id(5),name:'Mathematics'}];if(mode==='missing')rows=[];if(mode==='invalid')rows=resource==='classes'?[{id:id(3),name:null}]:[{id:'malformed'}];if(f.changes.className&&resource==='classes')rows[0].name=f.changes.className;return Response.json({items:rows,nextCursor:mode==='partial'?id(30):null});};
function H(){const[generation,setGeneration]=useState(1),[mounted,setMounted]=useState(true);f.refresh=()=>setGeneration(x=>x+1);f.remount=()=>setMounted(x=>!x);const app={locale:'${locale}',dictionary:getDictionary('${locale}'),membership:{schoolId:id(20),userId:id(21),role:'teacher',entitlements:['learning','assessment','curriculum'],school:{name:'Current school'}},status:'ready',online:true,apiUrl:'https://gradebook-context.fixture.invalid',accessToken:'synthetic',accessGeneration:generation,commandJournal:journal,formDrafts:drafts,announce(){},reportDiagnostic(){},refreshAccess(){}};f.app=app;return<C.Provider value={app}><main lang='${locale}' dir='${locale === 'ar' ? 'rtl' : 'ltr'}'><h1>Class gradebook</h1>{mounted?<ClassGradebook/>:null}</main></C.Provider>}createRoot(document.getElementById('root')).render(<H/>);
` }, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', plugins: [{ name: 'current-session-and-assets', setup(b) {
    b.onLoad({ filter: /shared[\\/]session[\\/]providers\.tsx$/ }, () => ({ loader: 'js', contents: 'export function useApp(){return globalThis.gradebookContextUC(globalThis.gradebookContextC)}' }));
    b.onLoad({ filter: /\.(webp|png|svg)$/ }, args => ({ loader: 'js', contents: 'export default ' + JSON.stringify({ src: 'data:image/' + (args.path.endsWith('.svg') ? 'svg+xml' : 'webp') + ';base64,' + readFileSync(args.path).toString('base64'), width: 128, height: 128 }) }));
  } }] })).outputFiles[0].text;
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: locale === 'en' ? 1366 : 390, height: 844 }); await page.setContent('<div id="root"></div>');
  await page.addStyleTag({ content: ['packages/ui/src/tokens.css', 'apps/web/app/globals.css', 'apps/web/features/academic/styles.css'].map(path => readFileSync(resolve(root, path), 'utf8')).join('\n') });
  await page.addScriptTag({ content: "if(!crypto.randomUUID)crypto.randomUUID=()=> 'd8000000-0000-4000-8000-000000000099';" });
  await page.addScriptTag({ content: source });
  if (Object.keys(changes).length) await page.evaluate(changes => { const f = (globalThis as unknown as Globals).gradebookContextProbe; Object.assign(f.state, changes); f.refresh(); }, changes);
  await expect(page.locator('#gradebook-course')).toBeVisible(); return errors;
}
async function settled(page: Page) { await expect(page.locator('#gradebook-course option[value]')).toHaveCount(3); }
const bookReads = (page: Page) => page.evaluate(() => (globalThis as unknown as Globals).gradebookContextProbe.calls.filter(call => /\/gradebook\?/.test(call.path)));
const setModes = (page: Page, change: Partial<Record<Resource, Mode>>) => page.evaluate(change => { const f = (globalThis as unknown as Globals).gradebookContextProbe; Object.assign(f.state, change); f.refresh(); }, change);
for (const locale of ['en', 'ar'] as const) test(`${locale}: same-named courses use current class year subject context to open one exact gradebook`, async ({ page }) => {
  const errors = await mount(page, locale); await settled(page);
  const first = page.locator(`#gradebook-course option[value="${id(1)}"]`), second = page.locator(`#gradebook-course option[value="${id(2)}"]`);
  await expect(first).toBeEnabled(); await expect(second).toBeEnabled(); await expect(first).toHaveText('School mathematics · Cedar · Year 4 · 2026–2027 · Mathematics'); await expect(second).toHaveText('School mathematics · Maple · Year 4 · 2026–2027 · Mathematics');
  expect(await bookReads(page)).toEqual([]); await page.locator('#gradebook-course').selectOption(id(2)); await expect(page.locator('.gradebook-course h2')).toContainText('School mathematics');
  expect(await bookReads(page)).toEqual([{ path: `/v1/courses/${id(2)}/gradebook?learnerLimit=25&assessmentLimit=10`, method: 'GET' }]);
  const calls = await page.evaluate(() => (globalThis as unknown as Globals).gradebookContextProbe.calls); expect(calls.filter(call => call.path === '/v1/courses?limit=100')).toHaveLength(1); expect(calls.filter(call => call.path === '/v1/classes?limit=100')).toHaveLength(1); expect(calls.filter(call => call.path === '/v1/subjects?limit=100')).toHaveLength(1); expect(calls.filter(call => call.method !== 'GET')).toEqual([]); expect(errors).toEqual([]);
});
for (const locale of ['en', 'ar'] as const) test(`${locale}: missing ambiguous invalid and incomplete metadata cannot choose a gradebook or imply empty courses`, async ({ page }) => {
  await mount(page, locale); await settled(page);
  for (const change of [{ classes: 'ambiguous' }, { classes: 'missing' }, { classes: 'partial' }, { subjects: 'partial' }, { courses: 'partial' }, { classes: 'invalid' }, { subjects: 'denied' }] as Partial<Record<Resource, Mode>>[]) {
    await setModes(page, { courses: 'ready', classes: 'ready', subjects: 'ready', ...change }); await expect(page.locator('#gradebook-course option').filter({ hasText: 'School mathematics' }).first()).toBeDisabled();
    await expect(page.locator('.gradebook-course')).toHaveCount(0); expect(await bookReads(page)).toEqual([]); await expect(page.locator('[data-state="empty"]')).toHaveCount(0);
    if (Object.values(change).includes('partial')) await expect(page.locator('[data-page-cursor]')).toHaveCount(1);
  }
});
for (const locale of ['en', 'ar'] as const) test(`${locale}: current metadata refresh withholds former course and restores its retained selection without writes`, async ({ page }) => {
  const errors = await mount(page, locale); await settled(page); await page.locator('#gradebook-course').selectOption(id(1)); await expect(page.locator('.gradebook-course')).toBeVisible();
  const slot = `${id(20)}:${id(21)}:gradebook-course`;
  await setModes(page, { classes: 'held' }); await expect(page.locator('.gradebook-course')).toHaveCount(0); await expect(page.locator('#gradebook-course')).toBeDisabled();
  await expect.poll(() => page.evaluate(() => (globalThis as unknown as Globals).gradebookContextProbe.release.length)).toBe(1);
  await page.evaluate(() => { const f = (globalThis as unknown as Globals).gradebookContextProbe; f.state.classes = 'ready'; f.release.splice(0).forEach(done => done()); }); await expect(page.locator('.gradebook-course')).toBeVisible(); await expect(page.locator('#gradebook-course')).toHaveValue(id(1));
  await setModes(page, { subjects: 'unavailable' }); await expect(page.locator('.gradebook-course')).toHaveCount(0); await expect(page.getByRole('alert')).toBeVisible(); expect(await page.evaluate(slot => (globalThis as unknown as Globals).gradebookContextProbe.app.formDrafts.model(slot), slot)).toBe(id(1));
  await setModes(page, { subjects: 'ready' }); await expect(page.locator('.gradebook-course')).toBeVisible();
  await page.evaluate(() => { const f = (globalThis as unknown as Globals).gradebookContextProbe; f.classId = 'd8000000-0000-4000-8000-000000000009'; f.refresh(); }); await expect(page.locator('.gradebook-course')).toHaveCount(0); expect(await page.evaluate(slot => (globalThis as unknown as Globals).gradebookContextProbe.app.formDrafts.model(slot), slot)).toBe(id(1));
  await page.evaluate(() => { const f = (globalThis as unknown as Globals).gradebookContextProbe; f.classId = 'd8000000-0000-4000-8000-000000000003'; f.refresh(); }); await expect(page.locator('.gradebook-course')).toBeVisible();
  expect((await page.evaluate(() => (globalThis as unknown as Globals).gradebookContextProbe.calls)).filter(call => call.method !== 'GET')).toEqual([]); expect(errors).toEqual([]);
});
test('late old-frame class metadata cannot replace a newer current choice context', async ({ page }) => {
  await mount(page, 'en'); await settled(page); await setModes(page, { classes: 'held' });
  await expect.poll(() => page.evaluate(() => (globalThis as unknown as Globals).gradebookContextProbe.release.length)).toBe(1); await expect(page.locator('#gradebook-course')).toBeDisabled();
  await page.evaluate(() => { const f = (globalThis as unknown as Globals).gradebookContextProbe; f.state.classes = 'ready'; f.changes.className = 'Current Cedar'; f.refresh(); }); await expect(page.locator(`#gradebook-course option[value="${id(1)}"]`)).toHaveText('School mathematics · Current Cedar · Year 4 · 2026–2027 · Mathematics');
  await page.evaluate(() => { const f = (globalThis as unknown as Globals).gradebookContextProbe; f.changes.className = 'Old response caption'; f.release.splice(0).forEach(done => done()); }); await page.waitForTimeout(100);
  await expect(page.locator(`#gradebook-course option[value="${id(1)}"]`)).toHaveText('School mathematics · Current Cedar · Year 4 · 2026–2027 · Mathematics'); expect(await bookReads(page)).toEqual([]);
});
test('uncertain original gradebook release survives unavailable metadata and remount without enabling a new course or command', async ({ page }) => {
  await mount(page, 'en'); await settled(page); await page.locator('#gradebook-course').selectOption(id(1)); await expect(page.locator('.gradebook-course')).toBeVisible();
  const path = `/v1/courses/${id(1)}/gradebook/release`; const original = await page.evaluate(path => (globalThis as unknown as Globals).gradebookContextProbe.app.commandJournal.prepare(path, path, { selections: [{ markingId: 'd8000000-0000-4000-8000-000000000011', submissionId: 'd8000000-0000-4000-8000-000000000012', expectedRevision: 1, expectedSubmissionRevision: 1, expectedPolicyVersion: 2, parentVisible: false }], confirmRelease: true }), path);
  await setModes(page, { classes: 'unavailable' }); await expect(page.locator('#gradebook-course')).toBeDisabled(); await expect(page.locator('.gradebook-course')).toHaveCount(0); expect(await page.evaluate(path => (globalThis as unknown as Globals).gradebookContextProbe.app.commandJournal.get(path), path)).toEqual(original);
  await page.evaluate(() => (globalThis as unknown as Globals).gradebookContextProbe.remount()); await expect(page.locator('#gradebook-course')).toHaveCount(0); await page.evaluate(() => (globalThis as unknown as Globals).gradebookContextProbe.remount()); await expect(page.locator('#gradebook-course')).toBeVisible();
  await setModes(page, { classes: 'ready' }); await expect(page.locator('.gradebook-course')).toBeVisible(); await expect(page.getByRole('button', { name: 'Retry the same action', exact: true })).toBeVisible(); await expect(page.locator('#gradebook-course')).toBeDisabled(); expect(await page.evaluate(path => (globalThis as unknown as Globals).gradebookContextProbe.app.commandJournal.get(path), path)).toEqual(original); expect((await page.evaluate(() => (globalThis as unknown as Globals).gradebookContextProbe.calls)).filter(call => call.method !== 'GET')).toEqual([]);
});
