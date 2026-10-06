import { test, expect, type Page } from '@playwright/test';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { progressAr, progressEn } from '../../apps/web/features/progress/messages';

const root = resolve(import.meta.dirname, '../..');
type Role = 'admin' | 'teacher' | 'coordinator' | 'student' | 'parent';
type Fixture = { mode: string; evidenceWrong: boolean; reads: { path: string; cursor: string | null }[]; writes: { path: string; key: string | null; body: object }[]; retry?: () => void; release?: () => void; switchLearner?: () => void; journal: { prepare(slot: string, path: string, body: object): unknown; get(slot: string): unknown }; refreshAccessCalls: number };

async function mount(page: Page, role: Role, locale: 'en' | 'ar', allowCommand = false, nativeEvidence = false) {
  await page.setViewportSize({ width: 390, height: 844 });
  const script = (await build({ bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', stdin: { resolveDir: root, loader: 'tsx', contents: `
import React,{useState}from'react';import{createRoot}from'react-dom/client';import{AttentionSection}from'./apps/web/features/progress/components/attention';import{CommandJournal}from'./apps/web/shared/api/client';import{FormDrafts}from'./apps/web/shared/session/form-drafts';import{getDictionary}from'./apps/web/shared/i18n/locale';
const id=n=>'a7100000-0000-4000-8000-'+String(n).padStart(12,'0'),learner=id(1),cursor=id(90),journal=new CommandJournal();
if(!crypto.randomUUID)Object.defineProperty(crypto,'randomUUID',{value:()=>id(99)});
const f=globalThis.attentionSourceFixture={mode:'rows',evidenceWrong:false,reads:[],writes:[],journal,refreshAccessCalls:0};
globalThis.attentionSourceApp={locale:'${locale}',dictionary:getDictionary('${locale}'),status:'ready',online:true,apiUrl:'https://attention.fixture.invalid',accessToken:'fictional',accessGeneration:1,membership:{schoolId:id(2),userId:'${role}'==='student'?learner:id(3),role:'${role}',entitlements:['learning','assessment','curriculum','learner.state']},commandJournal:journal,formDrafts:new FormDrafts(),reportDiagnostic(){},announce(){},refreshAccess(){f.refreshAccessCalls++;}};
const row=(n,sourceLearner)=>({id:id(n),learnerId:sourceLearner,type:'missing_due_work',ruleVersion:1,generatedAt:'2026-10-06T00:00:00Z',sourceEventIds:[],count:1,missingAssessments:[{id:id(n+10),title:sourceLearner!==learner?'Replacement learner task':n===4?'Original current task':'Later current task',dueAt:'2026-10-05T00:00:00Z'}],uncertainty:'MISSING_SUBMISSION_NOT_ZERO'});
const native={id:id(4),learnerId:learner,type:'native_result_decline',ruleVersion:1,generatedAt:'2026-10-06T00:00:00Z',sourceEventIds:[id(11),id(12)],referenceId:id(13),referenceVersion:'school-v1',baselineResultId:id(14),followUpResultId:id(15),evidenceIds:[id(6),id(8)],baseline:{score:8,maxScore:10},followUp:{score:3,maxScore:10},difference:-5,minimumDecline:1,uncertainty:'OBSERVED_CHANGE_NOT_CAUSE'};
globalThis.fetch=async(raw,options={})=>{const url=new URL(raw),sourceLearner=url.searchParams.get('learnerId')??learner;f.reads.push({path:url.pathname,cursor:url.searchParams.get('cursor')});if(options.method&&options.method!=='GET'){f.writes.push({path:url.pathname,key:new Headers(options.headers).get('Idempotency-Key'),body:JSON.parse(options.body)});if(!${allowCommand}||url.pathname!=='/v1/learners/'+learner+'/attention-refresh')throw Error('No command allowed');return Response.json({code:'REQUEST_UNAVAILABLE'},{status:503});}if(url.pathname.startsWith('/v1/evidence/'))return Response.json({id:url.pathname.split('/').at(-1),sourceType:'SUBMISSION',sourceObjectId:id(16),learnerId:f.evidenceWrong?id(7):learner,actorId:id(3),createdAt:'2026-10-06T00:00:00Z',quality:'TEACHER_ENTERED',referenceId:id(13),referenceVersion:'school-v1',policyVersion:1,resultId:id(14),revision:1,visibility:'LEARNER_PRIVATE',reviewStatus:'APPROVED',model:'numeric',context:{status:'READY',labelBasis:'CURRENT_REGISTERED_NAMES_AND_SOURCE_TASK',identityRequiresReview:false,learnerName:f.evidenceWrong?'Other private learner':'Current learner',recordedByName:'Current teacher',assessmentTitle:'Current evidence task',courseTitle:'Reasoning',className:'Cedar',yearGroupName:'Year 4',academicYearName:'2026–2027',referenceTitle:'Checking reasons',submittedAt:'2026-10-05T00:00:00Z',submissionRevision:1}});if(url.pathname==='/v1/attention-policy')return Response.json({policy:{id:id(5),version:1,minimumDecline:1,maxScore:10,missingDueCount:1,windowDays:7,approvedAt:'2026-10-05T00:00:00Z'}});if(url.pathname!=='/v1/attention-signals')throw Error('Unexpected source');if(!url.searchParams.has('cursor'))return Response.json({items:[${nativeEvidence} ? native : row(4,sourceLearner)],nextCursor:${nativeEvidence} ? null : cursor});if(f.mode==='denied'||f.mode==='unauthorized'||f.mode==='unavailable')return Response.json({code:'REQUEST_REFUSED'},{status:f.mode==='denied'?403:f.mode==='unauthorized'?401:503});if(f.mode==='invalid')return Response.json({items:[{id:'invalid-source'}],nextCursor:null});if(f.mode==='held')return new Promise(done=>{f.release=()=>{delete f.release;done(Response.json({items:[row(6,sourceLearner)],nextCursor:null}))}});return Response.json({items:[row(6,sourceLearner)],nextCursor:null});};
function Harness(){const[refresh,setRefresh]=useState(0),[selected,setSelected]=useState(learner);f.switchLearner=()=>setSelected(id(7));return<main className='workspace'><h1>Current learner evidence</h1><button id='current-learner-refresh' onClick={()=>setRefresh(value=>value+1)}>Refresh current learner source</button><AttentionSection learnerId={selected} refresh={refresh}/></main>}createRoot(document.getElementById('root')).render(<Harness/>);
` }, plugins: [{ name: 'controlled-current-session-and-continuation', setup(bundler) {
    bundler.onLoad({ filter: /shared[\\/]session[\\/]providers\.tsx$/ }, () => ({ loader: 'js', contents: 'export function useApp(){return globalThis.attentionSourceApp}' }));
    bundler.onLoad({ filter: /shared[\\/]hooks[\\/]use-paginated-query\.ts$/ }, args => ({ loader: 'ts', contents: readFileSync(args.path, 'utf8').replace('  return { ...(state.context', '  if(path?.startsWith("/v1/attention-signals?"))globalThis.attentionSourceFixture.retry=loadMore;\n  return { ...(state.context') }));
    bundler.onLoad({ filter: /\.(webp|png|svg)$/ }, args => ({ loader: 'js', contents: 'export default ' + JSON.stringify({ src: 'data:image/webp;base64,' + readFileSync(args.path).toString('base64'), width: 128, height: 128 }) }));
  } }] })).outputFiles[0].text;
  await page.route('**/*', route => route.abort());
  await page.setContent(`<html lang="${locale}" dir="${locale === 'ar' ? 'rtl' : 'ltr'}"><head><title>Attention source verification</title><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div></body></html>`);
  await page.addStyleTag({ content: ['packages/ui/src/tokens.css', 'apps/web/app/globals.css', 'apps/web/features/progress/styles.css'].map(file => readFileSync(resolve(root, file), 'utf8')).join('\n') });
  await page.addScriptTag({ content: script });
}

for (const role of ['admin', 'teacher', 'coordinator', 'student'] as const) for (const locale of ['en', 'ar'] as const) for (const failure of ['denied', 'unauthorized', 'invalid', 'unavailable'] as const) test(`${role}/${locale}: attention ${failure} continuation preserves current source and original commands`, async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message)); page.on('console', message => { if (['error', 'warning'].includes(message.type())) errors.push(message.text()); });
  await mount(page, role, locale); const t = locale === 'ar' ? progressAr : progressEn, plane = page.locator('.progress-attention');
  await expect(plane.locator('.attention-row')).toHaveCount(1); await expect(plane.getByText('Original current task', { exact: true })).toBeVisible();
  if (role !== 'student') { await plane.getByRole('button', { name: t.attentionRefresh, exact: true }).click(); await expect(plane.locator('form')).toHaveCount(1); }
  const originalPath = '/v1/learners/a7100000-0000-4000-8000-000000000001/attention-refresh';
  const original = await page.evaluate(path => (globalThis as unknown as { attentionSourceFixture: Fixture }).attentionSourceFixture.journal.prepare(path, path, { expectedPolicyVersion: 1 }), originalPath);
  await page.evaluate(mode => { (globalThis as unknown as { attentionSourceFixture: Fixture }).attentionSourceFixture.mode = mode; }, failure);
  await plane.locator('[data-page-cursor]').click(); await expect(plane.getByRole('alert')).toHaveCount(1); await expect(plane.locator('[data-state="empty"]')).toHaveCount(0);
  if (failure === 'unavailable') { await expect(plane.locator('.attention-row')).toHaveCount(1); await expect(plane.locator('[data-page-cursor]')).toBeEnabled(); }
  else { await expect(plane.locator('.attention-row')).toHaveCount(0); await expect(plane.locator('form')).toHaveCount(0); await expect(plane.locator('[data-page-cursor]')).toHaveCount(0); if (role !== 'student') await expect(plane.getByRole('button', { name: t.attentionRefresh, exact: true })).toBeDisabled(); }
  for (const width of [390, 320]) { await page.setViewportSize({ width, height: 844 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.screenshot({ path: info.outputPath(`${role}-${locale}-${failure}-before-recovery-${width}.png`), fullPage: true }); }
  await page.evaluate(() => { const f = (globalThis as unknown as { attentionSourceFixture: Fixture }).attentionSourceFixture; f.mode = 'held'; f.retry!(); });
  await expect.poll(() => page.evaluate(() => typeof (globalThis as unknown as { attentionSourceFixture: Fixture }).attentionSourceFixture.release)).toBe('function');
  if (failure !== 'unavailable') { await expect(plane.locator('.attention-row')).toHaveCount(0); await expect(plane.getByRole('alert')).toHaveCount(1); }
  await page.evaluate(() => (globalThis as unknown as { attentionSourceFixture: Fixture }).attentionSourceFixture.release!());
  if (failure === 'unavailable') await expect(plane.locator('.attention-row')).toHaveCount(2);
  else {
    await expect(plane.locator('.attention-row')).toHaveCount(0); await expect(plane.getByRole('alert')).toHaveCount(1);
    await page.evaluate(() => { (globalThis as unknown as { attentionSourceFixture: Fixture }).attentionSourceFixture.mode = 'rows'; });
    if (role === 'student') await page.locator('#current-learner-refresh').click(); else await plane.getByRole('button', { name: t.refreshAttentionRecords, exact: true }).click();
    await expect(plane.locator('.attention-row')).toHaveCount(1);
  }
  expect(await page.evaluate(path => (globalThis as unknown as { attentionSourceFixture: Fixture }).attentionSourceFixture.journal.get(path), originalPath)).toEqual(original);
  expect(await page.evaluate(() => (globalThis as unknown as { attentionSourceFixture: Fixture }).attentionSourceFixture.writes)).toEqual([]); expect(errors).toEqual([]);
  await page.setViewportSize({ width: 320, height: 844 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath(`${role}-${locale}-${failure}.png`), fullPage: true });
});

for (const locale of ['en', 'ar'] as const) test(`parent/${locale}: excluded attention performs no source read or command`, async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message)); page.on('console', message => { if (['error', 'warning'].includes(message.type())) errors.push(message.text()); });
  await mount(page, 'parent', locale); await expect(page.getByRole('heading', { name: 'Current learner evidence' })).toBeVisible(); await expect(page.locator('.progress-attention')).toHaveCount(0);
  expect(await page.evaluate(() => { const f = (globalThis as unknown as { attentionSourceFixture: Fixture }).attentionSourceFixture; return { reads: f.reads, writes: f.writes }; })).toEqual({ reads: [], writes: [] }); expect(errors).toEqual([]);
});

for (const locale of ['en', 'ar'] as const) test(`teacher/${locale}: learner replacement discards a late prior attention response`, async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message)); page.on('console', message => { if (['error', 'warning'].includes(message.type())) errors.push(message.text()); });
  await mount(page, 'teacher', locale); const plane = page.locator('.progress-attention'); await expect(plane.locator('.attention-row')).toHaveCount(1);
  const originalPath = '/v1/learners/a7100000-0000-4000-8000-000000000001/attention-refresh';
  const original = await page.evaluate(path => (globalThis as unknown as { attentionSourceFixture: Fixture }).attentionSourceFixture.journal.prepare(path, path, { expectedPolicyVersion: 1 }), originalPath);
  await page.evaluate(() => { (globalThis as unknown as { attentionSourceFixture: Fixture }).attentionSourceFixture.mode = 'held'; }); await plane.locator('[data-page-cursor]').click();
  await expect.poll(() => page.evaluate(() => typeof (globalThis as unknown as { attentionSourceFixture: Fixture }).attentionSourceFixture.release)).toBe('function');
  await page.evaluate(() => (globalThis as unknown as { attentionSourceFixture: Fixture }).attentionSourceFixture.switchLearner!()); await expect(plane.getByText('Replacement learner task', { exact: true })).toBeVisible();
  await page.evaluate(() => (globalThis as unknown as { attentionSourceFixture: Fixture }).attentionSourceFixture.release!()); await expect(plane.locator('.attention-row')).toHaveCount(1); await expect(plane.getByText('Original current task', { exact: true })).toHaveCount(0); await expect(plane.getByText('Later current task', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(path => (globalThis as unknown as { attentionSourceFixture: Fixture }).attentionSourceFixture.journal.get(path), originalPath)).toEqual(original); expect(await page.evaluate(() => (globalThis as unknown as { attentionSourceFixture: Fixture }).attentionSourceFixture.writes)).toEqual([]); expect(errors).toEqual([]);
});

for (const locale of ['en', 'ar'] as const) test(`teacher/${locale}: uncertain attention command survives refusal and retries the original key`, async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message)); page.on('console', message => { if (['error', 'warning'].includes(message.type())) errors.push(message.text()); });
  await mount(page, 'teacher', locale, true); const t = locale === 'ar' ? progressAr : progressEn, plane = page.locator('.progress-attention');
  await plane.getByRole('button', { name: t.attentionRefresh, exact: true }).click(); const form = plane.getByRole('region', { name: t.attentionRefresh, exact: true }); await form.locator('form button[type="submit"]').click();
  const retry = form.getByRole('button', { name: locale === 'ar' ? 'إعادة الإجراء نفسه' : 'Retry the same action', exact: true }); await expect(retry).toBeVisible();
  const originalPath = '/v1/learners/a7100000-0000-4000-8000-000000000001/attention-refresh';
  const original = await page.evaluate(path => (globalThis as unknown as { attentionSourceFixture: Fixture }).attentionSourceFixture.journal.get(path), originalPath); expect(original).toBeTruthy();
  await page.evaluate(() => { (globalThis as unknown as { attentionSourceFixture: Fixture }).attentionSourceFixture.mode = 'denied'; }); await plane.locator('[data-page-cursor]').click();
  await expect(plane.locator('.attention-row')).toHaveCount(0); await expect(plane.locator('form')).toHaveCount(0); await expect(plane.locator('[data-page-cursor]')).toHaveCount(0);
  expect(await page.evaluate(path => (globalThis as unknown as { attentionSourceFixture: Fixture }).attentionSourceFixture.journal.get(path), originalPath)).toEqual(original); expect(await page.evaluate(() => (globalThis as unknown as { attentionSourceFixture: Fixture }).attentionSourceFixture.writes.length)).toBe(1);
  await page.screenshot({ path: info.outputPath(`uncertain-${locale}-refused.png`), fullPage: true });
  await page.evaluate(() => { (globalThis as unknown as { attentionSourceFixture: Fixture }).attentionSourceFixture.mode = 'rows'; }); await plane.getByRole('button', { name: t.refreshAttentionRecords, exact: true }).click(); await expect(plane.locator('.attention-row')).toHaveCount(1); await expect(retry).toBeVisible(); await retry.click();
  await expect.poll(() => page.evaluate(() => (globalThis as unknown as { attentionSourceFixture: Fixture }).attentionSourceFixture.writes.length)).toBe(2);
  const writes = await page.evaluate(() => (globalThis as unknown as { attentionSourceFixture: Fixture }).attentionSourceFixture.writes); expect(writes[1]).toEqual(writes[0]); expect(await page.evaluate(path => (globalThis as unknown as { attentionSourceFixture: Fixture }).attentionSourceFixture.journal.get(path), originalPath)).toEqual(original); expect(errors).toEqual([]);
});

for (const role of ['admin', 'teacher', 'coordinator'] as const) for (const locale of ['en', 'ar'] as const) for (const wrongLearner of [false, true]) test(`${role}/${locale}: native attention evidence ${wrongLearner ? 'refuses another learner' : 'retains the exact learner'}`, async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message)); page.on('console', message => { if (['error', 'warning'].includes(message.type())) errors.push(message.text()); });
  await mount(page, role, locale, false, true); const t = locale === 'ar' ? progressAr : progressEn, plane = page.locator('.progress-attention'); await expect(plane.locator('.attention-row')).toHaveCount(1);
  await page.evaluate(value => { (globalThis as unknown as { attentionSourceFixture: Fixture }).attentionSourceFixture.evidenceWrong = value; }, wrongLearner);
  await plane.locator('.attention-row > details > summary').click(); await plane.getByRole('button', { name: t.evidence, exact: true }).first().click();
  if (wrongLearner) { await expect(plane.getByRole('alert')).toHaveCount(1); await expect(plane.locator('.evidence-reading')).toHaveCount(0); await expect(plane.getByText('Other private learner', { exact: true })).toHaveCount(0); }
  else { await expect(plane.locator('.evidence-reading')).toHaveCount(1); await expect(plane.getByText('Current learner', { exact: true })).toBeVisible(); await expect(plane.getByText('Current evidence task', { exact: true })).toBeVisible(); }
  const number = (value: number) => new Intl.NumberFormat(locale).format(value);
  await expect(plane.locator('.attention-row .academic-facts dd bdi[dir="ltr"]')).toHaveText([`${number(8)} / ${number(10)}`, `${number(3)} / ${number(10)}`]);
  await expect(plane.getByText(t.noCause, { exact: true })).toBeVisible(); expect(await page.evaluate(() => (globalThis as unknown as { attentionSourceFixture: Fixture }).attentionSourceFixture.writes)).toEqual([]); expect(errors).toEqual([]);
  await page.screenshot({ path: info.outputPath(`native-${role}-${locale}-${wrongLearner ? 'wrong' : 'current'}-390.png`), fullPage: true });
});
