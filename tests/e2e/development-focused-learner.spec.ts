import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';

const root = resolve(import.meta.dirname, '../..');
test('Development staff names the selected learner and mobile Back preserves period, configuration and original commands', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (['error', 'warning'].includes(message.type())) errors.push(message.text()); });
  const built = await build({ stdin: { resolveDir: root, loader: 'tsx', contents: `
  import React,{useState}from'react';import{createRoot}from'react-dom/client';import{DevelopmentWorkspace}from'./apps/web/features/development/components/development-workspace';import{CommandJournal,LearningApiError}from'./apps/web/shared/api/client';import{FormDrafts}from'./apps/web/shared/session/form-drafts';
  const journal=new CommandJournal(),drafts=new FormDrafts();globalThis.developmentFixture={journal,reads:[],writes:[],denied:false,denyAll:false,retryOutcome:'uncertain',policy:{id:'policy',version:2,points:{practice:0,revision:7,reflection:13},milestones:[],approvedBy:'actor',approvedAt:'2026-10-03T00:00:00Z'},period:{id:'period',classId:'class',policyId:'policy',title:'Autumn recognition',startsAt:'2026-10-01T00:00:00Z',endsAt:'2026-12-01T00:00:00Z'},people:[{userId:'learner',displayName:'Lina Al-Kuwari',role:'student',classLabels:['Cedar · Year 8 · 2026–2027']},{userId:'second',displayName:'Sara',role:'student',classLabels:['Palm · Year 8']}]};
  function Harness(){const[locale,setLocale]=useState('en'),[role,setRole]=useState('teacher'),[generation,setGeneration]=useState(1),[mount,setMount]=useState(0);globalThis.developmentApp={locale,membership:{schoolId:'school',userId:'actor',role,displayName:'Current staff',entitlements:['learning','learner.state']},status:'ready',online:true,apiUrl:'',accessToken:'synthetic',accessGeneration:generation,formDrafts:drafts,commandJournal:journal,refreshAccess(){},announce(){},reportDiagnostic(){}};return<div className='workspace' dir={locale==='ar'?'rtl':'ltr'}><button id='locale' onClick={()=>setLocale(current=>{const next=current==='en'?'ar':'en';document.documentElement.lang=next;document.documentElement.dir=next==='ar'?'rtl':'ltr';return next;})}>Language</button><button id='role' onClick={()=>setRole('admin')}>Administrator</button><button id='deny' onClick={()=>{globalThis.developmentFixture.denied=true;setGeneration(x=>x+1)}}>Deny current people</button><button id='remount' onClick={()=>setMount(x=>x+1)}>Remount owner</button><button id='student' onClick={()=>setRole('student')}>Student</button><button id='restore' onClick={()=>{globalThis.developmentFixture.denied=false;globalThis.developmentFixture.denyAll=false;setGeneration(x=>x+1)}}>Restore reads</button><button id='deny-all' onClick={()=>{globalThis.developmentFixture.denyAll=true;setGeneration(x=>x+1)}}>Deny current sources</button><button id='changed-period' onClick={()=>{globalThis.developmentFixture.period={...globalThis.developmentFixture.period,id:'changed-period'};setGeneration(x=>x+1)}}>Change current period</button><DevelopmentWorkspace key={mount}/></div>;}createRoot(document.getElementById('root')).render(<Harness/>);
  ` }, bundle: true, write: false, platform: 'browser', jsx: 'automatic', format: 'iife', plugins: [{ name: 'bounded-current-read', setup(bundler) {
    bundler.onLoad({ filter: /shared[\\/]session[\\/]providers\.tsx$/ }, () => ({ loader: 'js', contents: 'export function useApp(){return globalThis.developmentApp}' }));
    bundler.onLoad({ filter: /shared[\\/]hooks[\\/]use-paginated-query\.ts$/ }, () => ({ loader: 'js', contents: `import{LearningApiError}from'${root.replaceAll('\\', '/')}/apps/web/shared/api/client';export function usePaginatedLearningQuery(path,parse){const f=globalThis.developmentFixture;if(path)f.reads.push(path);const data=path?.startsWith('/v1/people')?f.people:path?.includes('/policies')?[f.policy]:path?.startsWith('/v1/development/periods?')?[f.period]:path?.startsWith('/v1/classes')?[{id:'class',name:'Cedar'}]:[];return{data:path?data.map(parse):[],loaded:true,loading:false,loadingMore:false,error:path&&(f.denyAll||path.startsWith('/v1/people')&&f.denied)?new LearningApiError('denied'):null,moreError:null,nextCursor:null,loadMore(){}}}` }));
    bundler.onLoad({ filter: /shared[\\/]hooks[\\/]use-api\.ts$/ }, () => ({ loader: 'js', contents: `import{LearningApiError}from'${root.replaceAll('\\', '/')}/apps/web/shared/api/client';import{commonEn,commonAr}from'${root.replaceAll('\\', '/')}/apps/web/shared/i18n/common';export function useApi(){const app=globalThis.developmentApp;return{t:app.locale==='ar'?commonAr:commonEn,journal:app.commandJournal,request(path,options){const f=globalThis.developmentFixture;f.writes.push({path,command:structuredClone(options.command)});if(f.retryOutcome==='uncertain')throw new LearningApiError('unavailable',true);return Promise.resolve({id:options.command.body.periodId??'30000000-0000-4000-8000-000000000001',command:path.endsWith('/policies')?'policy':path.endsWith('/backfill')?'backfill':path.endsWith('/participation')?'participation':'period',awards:0})}}}export function useApiQuery(path,parse){if(path)globalThis.developmentFixture.reads.push(path);const query=path?new URL(path,'https://fixture.invalid'):null;return{data:path?.includes('/summary')?parse({learnerId:query.searchParams.get('learnerId'),periodId:query.searchParams.get('periodId'),status:'DISABLED',totalPoints:null,leaderboardEnabled:false,streak:{status:'DISABLED',basis:'VERIFIED_RECOGNIZED_ACTION_DAYS',timezone:'UTC',days:null,endingOn:null,recordedDays:null,sourceCount:null}}):null,loading:false,error:null}}` }));
    bundler.onLoad({ filter: /\.(webp|svg|png)$/ }, args => ({ loader: 'js', contents: 'export default ' + JSON.stringify({ src: 'data:image/' + (args.path.endsWith('.svg') ? 'svg+xml' : 'webp') + ';base64,' + readFileSync(args.path).toString('base64'), width: 128, height: 128 }) }));
  } }] });
  const css = ['packages/ui/src/tokens.css', 'apps/web/app/globals.css', 'apps/web/features/development/styles.css'].map(path => readFileSync(resolve(root, path), 'utf8')).join('\n');
  await page.setContent(`<!doctype html><html lang="en" dir="ltr"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root"></div></body></html>`);
  // about:blank lacks a secure random UUID in some engines; fixture-only setup.
  await page.addScriptTag({ content: "if(!crypto.randomUUID)crypto.randomUUID=()=> '30000000-0000-4000-8000-000000000001';" });
  await page.addScriptTag({ content: built.outputFiles[0].text });
  const owner = page.locator('.development-workspace'), learner = owner.locator('.development-learner-picker select'), period = owner.locator('.development-selectors select').last();
  await expect(learner).toHaveValue(''); await expect(owner.locator('.development-selected-heading')).toHaveCount(0);
  await period.selectOption('period'); await learner.focus(); await learner.selectOption('learner');
  await expect(owner.locator('.development-selected-heading')).toHaveText('Lina Al-Kuwari · Cedar · Year 8 · 2026–2027');
  await expect(owner.locator('.development-selected-heading')).toBeFocused();
  await owner.getByRole('button', { name: 'Refresh development', exact: true }).focus(); await page.keyboard.press('Enter');
  await expect(owner.getByRole('button', { name: 'Refresh development', exact: true })).toBeFocused();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(learner).toBeHidden(); await expect(period).toBeVisible();
    await page.locator('#locale').click();
    const back = owner.getByRole('button', { name: /Back to learners|العودة إلى الطلاب/, exact: true });
    await expect(back).toBeVisible(); await back.focus(); await page.keyboard.press('Enter');
    await expect(owner.locator('.development-selected-heading')).toHaveCount(0);
    await expect(owner.locator('.development-selectors select').first()).toBeFocused();
    await expect(owner.locator('.development-selectors select').last()).toHaveValue('period');
    await owner.locator('.development-selectors select').first().selectOption('learner');
    await expect(owner.locator('.development-selected-heading')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  if (await owner.getByRole('button', { name: 'Back to learners', exact: true }).count() === 0) await page.locator('#locale').click();
  for (const path of ['/v1/development/policies', '/v1/development/periods', '/v1/development/periods/backfill', '/v1/development/leaderboard/participation']) {
    await page.evaluate(path => { const f = (globalThis as unknown as { developmentFixture: { journal: { prepare: (slot: string, path: string, body: object) => void } } }).developmentFixture; f.journal.prepare(path, path, { periodId: 'period', retained: true }); }, path);
    await expect(owner.getByRole('button', { name: 'Back to learners', exact: true })).toBeDisabled();
    await expect(owner.locator('.development-selected-heading')).toHaveText('Lina Al-Kuwari · Cedar · Year 8 · 2026–2027');
    await expect(period).toHaveValue('period');
    await page.evaluate(path => (globalThis as unknown as { developmentFixture: { journal: { confirm: (slot: string) => void } } }).developmentFixture.journal.confirm(path), path);
    await expect(owner.getByRole('button', { name: 'Back to learners', exact: true })).toBeEnabled();
  }
  await page.locator('#role').click();
  await period.selectOption('period');
  await learner.focus(); await learner.selectOption('learner');
  await owner.getByRole('button', { name: 'Approve recognition policy', exact: true }).click();
  await owner.locator('.development-policy').getByLabel('Milestone title').fill('Current unsent policy');
  await owner.getByRole('button', { name: 'Back to learners', exact: true }).click();
  await expect(owner.locator('.development-policy').getByLabel('Milestone title')).toHaveValue('Current unsent policy');
  await expect(period).toHaveValue('period');
  await expect(owner.locator('.development-configuration > section')).toHaveCount(2);
  await learner.focus(); await learner.selectOption('learner');
  await page.evaluate(() => { const picker = document.querySelector('.development-learner-picker select') as HTMLSelectElement; picker.disabled = true; });
  await owner.getByRole('button', { name: 'Back to learners', exact: true }).click();
  await expect(owner.locator('.development-context')).toBeFocused(); await expect(period).toHaveValue('period');
  await page.evaluate(() => { const picker = document.querySelector('.development-learner-picker select') as HTMLSelectElement; picker.disabled = false; });
  await learner.focus(); await learner.selectOption('learner');
  await page.locator('#deny').click();
  await expect(owner.locator('.development-selected-heading')).toHaveCount(0); await expect(learner).toBeVisible();
  await expect(owner.locator('.development-journey')).toHaveCount(0); await expect(owner.locator('[role="alert"]').first()).toBeVisible();
  const facts = await page.evaluate(() => (globalThis as unknown as { developmentFixture: { writes: unknown[]; reads: string[] } }).developmentFixture);
  expect(facts.writes).toEqual([]); expect(facts.reads.some(path => path.includes('learnerId=second'))).toBe(false); expect(errors).toEqual([]);
  await page.locator('#restore').click();
  await page.evaluate(() => { const f = (globalThis as unknown as { developmentFixture: { journal: { prepare: (slot: string, path: string, body: object) => void } } }).developmentFixture; f.journal.prepare('/v1/development/policies', '/v1/development/policies', { expectedVersion: 2 }); });
  await expect(owner.locator('.development-policy form')).toHaveCount(1); await expect(owner.locator('.development-command-recovery')).toHaveCount(0);
  await page.evaluate(() => (globalThis as unknown as { developmentFixture: { journal: { confirm: (slot: string) => void } } }).developmentFixture.journal.confirm('/v1/development/policies'));
  await page.locator('#remount').click();
  await period.selectOption('period');
  await page.evaluate(() => { const f = (globalThis as unknown as { developmentFixture: { journal: { prepare: (slot: string, path: string, body: object) => void } } }).developmentFixture; f.journal.prepare('/v1/development/periods/backfill', '/v1/development/periods/backfill', { periodId: 'period' }); });
  await expect(owner.locator('.development-period form')).toHaveCount(1); await expect(owner.locator('.development-command-recovery')).toHaveCount(0);
  await page.evaluate(() => (globalThis as unknown as { developmentFixture: { journal: { confirm: (slot: string) => void } } }).developmentFixture.journal.confirm('/v1/development/periods/backfill'));
  await page.locator('#remount').click();
  for (const path of ['/v1/development/policies', '/v1/development/periods', '/v1/development/periods/backfill', '/v1/development/leaderboard/participation']) {
    if (path.endsWith('/participation')) await page.locator('#student').click();
    const original = await page.evaluate(path => {
      const f = (globalThis as unknown as { developmentFixture: { journal: { prepare: (slot: string, path: string, body: object) => { key: string; body: object } } } }).developmentFixture;
      return f.journal.prepare(path, path, { periodId: '30000000-0000-4000-8000-000000000003', expectedVersion: 2, originalEntry: 'Keep original input' });
    }, path);
    await page.locator('#remount').click();
    const recovery = owner.locator('.development-command-recovery');
    await expect(recovery).toHaveCount(1); await expect(recovery.locator('input,select,textarea')).toHaveCount(0);
    const retry = recovery.getByRole('button', { name: 'Retry the same action', exact: true });
    await expect(retry).toBeVisible();
    await page.locator('#deny-all').click();
    await expect(recovery).toHaveCount(1); await expect(owner.locator('.development-ledger,.development-milestone-list,.development-total')).toHaveCount(0);
    await retry.click();
    const retained = await page.evaluate(path => {
      const f = (globalThis as unknown as { developmentFixture: { writes: { path: string; command: { key: string; body: object } }[]; journal: { get: (slot: string) => { key: string; body: object } } } }).developmentFixture;
      return { sent: f.writes.at(-1), current: f.journal.get(path) };
    }, path);
    expect(retained.sent).toEqual({ path, command: { ...original, path } }); expect(retained.current).toEqual(original);
    await page.locator('#changed-period').click();
    await expect(recovery).toHaveCount(1);
    await page.evaluate(() => { (globalThis as unknown as { developmentFixture: { retryOutcome: string } }).developmentFixture.retryOutcome = 'success'; });
    await retry.click(); await expect(recovery).toHaveCount(0);
    expect(await page.evaluate(path => (globalThis as unknown as { developmentFixture: { journal: { get: (slot: string) => unknown } } }).developmentFixture.journal.get(path), path)).toBeUndefined();
    await page.evaluate(() => { (globalThis as unknown as { developmentFixture: { retryOutcome: string } }).developmentFixture.retryOutcome = 'uncertain'; });
    await page.locator('#restore').click();
  }
  await period.selectOption('changed-period');
  await page.evaluate(() => { const f = (globalThis as unknown as { developmentFixture: { journal: { prepare: (slot: string, path: string, body: object) => void } } }).developmentFixture; f.journal.prepare('/v1/development/leaderboard/participation', '/v1/development/leaderboard/participation', { periodId: '30000000-0000-4000-8000-000000000003' }); });
  await expect(owner.locator('.development-command-recovery')).toHaveCount(1); await expect(owner.locator('.development-board form')).toHaveCount(0);
  await page.evaluate(() => (globalThis as unknown as { developmentFixture: { journal: { confirm: (slot: string) => void } } }).developmentFixture.journal.confirm('/v1/development/leaderboard/participation'));
  await page.locator('#role').click();
  await period.selectOption('changed-period');
  await page.evaluate(() => { const f = (globalThis as unknown as { developmentFixture: { journal: { prepare: (slot: string, path: string, body: object) => void } } }).developmentFixture; f.journal.prepare('/v1/development/periods/backfill', '/v1/development/periods/backfill', { periodId: '30000000-0000-4000-8000-000000000003' }); });
  await expect(owner.locator('.development-command-recovery')).toHaveCount(1); await expect(owner.locator('.development-period form')).toHaveCount(0);
  expect(errors).toEqual([]);
});
