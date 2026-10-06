import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
for (const locale of ['en', 'ar'] as const) for (const scene of ['recovery', 'parent'] as const) test(`${locale}: ${scene} keeps current source state and recovery in Cuevo material`, async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (['error', 'warning'].includes(message.type())) errors.push(message.text()); });
  const script = (await build({ bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', stdin: { resolveDir: root, loader: 'tsx', contents: `
import React,{useState}from'react';import{createRoot}from'react-dom/client';import{SchoolAccountRecovery}from'./apps/web/features/school/components/account-recovery';import{ParentTrailHomeConnected}from'./apps/web/features/home/components/parent-trail-home-connected';import{Button}from'@cuevo/ui';import{CommandJournal}from'./apps/web/shared/api/client';import{FormDrafts}from'./apps/web/shared/session/form-drafts';import{getDictionary}from'./apps/web/shared/i18n/locale';
const id=n=>'b9000000-0000-4000-8000-'+String(n).padStart(12,'0'),child=id(1),scene='${scene}',journal=new CommandJournal(),f=globalThis.extraStateFixture={mode:'partial',reads:[],writes:[]};globalThis.extraStateApp={locale:'${locale}',dictionary:getDictionary('${locale}'),status:'ready',online:true,apiUrl:'https://source-state.fixture.invalid',accessToken:'synthetic',accessGeneration:1,membership:{schoolId:id(2),userId:id(3),role:scene==='parent'?'parent':'admin',displayName:'Current user',school:{name:'Current school'},entitlements:['learning','assessment','curriculum','school.operations','portfolio','community']},commandJournal:journal,formDrafts:new FormDrafts(),refreshAccess(){},reportDiagnostic(){},announce(){},selectedChildId:child,selectChild(){}};
globalThis.fetch=async(raw,options={})=>{const url=new URL(raw);f.reads.push(url.pathname+url.search);if(options.method&&options.method!=='GET'){f.writes.push(url.pathname);throw Error('No mutation allowed');}if(url.pathname==='/v1/school/people')return Response.json({items:[],nextCursor:url.searchParams.has('cursor')?null:id(4)});if(url.pathname==='/v1/people')return Response.json({items:[{userId:child,displayName:'Current child',role:'student',classLabels:['Cedar']}],nextCursor:null});if(url.pathname.endsWith('/policy'))return Response.json({id:id(2),version:1,enabled:true,approvedAt:'2026-10-05T00:00:00Z'});if(url.pathname.includes('/academic-report'))return Response.json({schemaVersion:'1',schoolId:id(2),learnerId:child,schoolName:'Current school',learnerName:'Current child',generatedAt:'2026-10-05T00:00:00Z',scope:'CURRENT_RELEASED_PAGE',coverage:'NOT_ESTABLISHED',items:[],nextCursor:null});return Response.json({items:[],nextCursor:url.searchParams.has('cursor')?null:id(4)});};
function View(){const[open,setOpen]=useState(true);return <main className='workspace'>{scene==='parent'?<ParentTrailHomeConnected onNavigate={()=>{}}/>:<><h1>School account recovery</h1>{open?<><Button variant='quiet' onClick={()=>setOpen(false)}>Back to accounts</Button><SchoolAccountRecovery onRequested={()=>{}}/></>:<h2>School accounts</h2>}</>}</main>}createRoot(document.getElementById('root')).render(<View/>);
` }, plugins: [{ name: 'controlled-session-and-assets', setup(bundler) {
    bundler.onLoad({ filter: /shared[\\/]session[\\/]providers\.tsx$/ }, () => ({ loader: 'js', contents: 'export function useApp(){return globalThis.extraStateApp}' }));
    bundler.onLoad({ filter: /\.(webp|png|svg)$/ }, args => ({ loader: 'js', contents: 'export default ' + JSON.stringify({ src: 'data:image/webp;base64,' + readFileSync(args.path).toString('base64'), width: 128, height: 128 }) }));
  } }] })).outputFiles[0].text;
  await page.setContent(`<!doctype html><html lang="${locale}" dir="${locale === 'ar' ? 'rtl' : 'ltr'}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Current source QA</title></head><body><div id="root"></div></body></html>`);
  await page.addStyleTag({ content: ['packages/ui/src/tokens.css', 'apps/web/app/globals.css', 'apps/web/features/home/styles.css', 'apps/web/features/school/styles.css'].map(file => readFileSync(resolve(root, file), 'utf8')).join('\n') });
  await page.addScriptTag({ content: script });
  if (scene === 'recovery') {
    const reading = page.locator('.school-account-recovery');
    await expect(reading.locator('[data-page-cursor]')).toBeVisible();
    await expect(reading.locator('[data-state="empty"]')).toHaveCount(0);
    await reading.locator('[data-page-cursor]').focus(); await page.keyboard.press('Enter');
    await expect(reading.locator('[data-state="empty"]')).toHaveCount(1);
    await expect(reading.locator('form,select')).toHaveCount(0);
    await page.getByRole('button', { name: 'Back to accounts' }).focus(); await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'School accounts', exact: true })).toBeVisible();
  } else {
    const continuations = page.locator('.parent-trail__source-continuation');
    // The report fixture is terminal; only the four paginated sources have continuation.
    await expect(continuations).toHaveCount(4);
    await expect(continuations.locator('[data-state="unknown"]')).toHaveCount(4);
    await expect(continuations.locator('[data-state="empty"]')).toHaveCount(0);
    const details = page.locator('details').filter({ has: page.locator('.parent-trail__source-continuation') });
    for (const detail of await details.all()) if ((await detail.getAttribute('open')) === null) await detail.locator('summary').first().click();
    const more = continuations.locator('[data-page-cursor]').first(); await expect(more).toBeVisible(); await more.focus(); await page.keyboard.press('Enter');
    await expect(continuations).toHaveCount(3);
  }
  for (const width of [1366, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`${scene}-${locale}-${width}.png`), fullPage: true });
  }
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => (globalThis as unknown as { extraStateFixture: { writes: string[] } }).extraStateFixture.writes)).toEqual([]);
});
