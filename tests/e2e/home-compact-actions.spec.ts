import { expect, test, type Page } from '@playwright/test';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
let pureScript = '', connectedScript = '', css = '';
test.beforeAll(async () => {
  css = ['packages/ui/src/tokens.css', 'apps/web/app/globals.css', 'apps/web/features/home/student-desk.css', 'apps/web/features/home/admin-trail.css', 'apps/web/features/home/styles.css'].map(file => readFileSync(resolve(root, file), 'utf8').replace(/@import[^;]+;/g, '')).join('\n');
  const bundle = async (contents: string, connected = false) => (await build({ stdin: { resolveDir: root, loader: 'tsx', contents }, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', plugins: [{ name: 'actual-home-owner-assets', setup(builder) {
    builder.onLoad({ filter: /\.(webp|png|svg)$/ }, args => ({ loader: 'js', contents: 'export default ' + JSON.stringify({ src: 'data:image/' + (args.path.endsWith('.svg') ? 'svg+xml' : 'webp') + ';base64,' + readFileSync(args.path).toString('base64'), width: 128, height: 128 }) }));
    if (connected) builder.onLoad({ filter: /shared[\\/]session[\\/]providers\.tsx$/ }, () => ({ loader: 'js', contents: 'export function useApp(){return globalThis.compactHomeUseContext(globalThis.compactHomeContext)}' }));
  } }] })).outputFiles[0].text;
  pureScript = await bundle(`import React,{useState}from'react';import{createRoot}from'react-dom/client';import{StudentTrailView}from'./apps/web/features/home/components/student-trail';import{AdminTrailHomeView}from'./apps/web/features/home/components/admin-trail-home';
const f=globalThis.compactHome={refresh:0,actions:0};const pixel='data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"/>';const assets=Object.fromEntries(['background','foxi','lesson','work','feedback','practice','reflect','grow','milestone'].map(key=>[key,pixel]));
function H(){const[state,setState]=useState(globalThis.compactHomeInput);f.set=setState;const ar=state.locale==='ar',label=ar?'تحديث عملي الحالي':'Refresh current work',recovery={label,onClick:()=>f.refresh++,pending:state.pending};const student={displayName:'Lina Hassan',schoolName:'Current academy',availability:state.mode,notice:ar?'تعذّر تحميل المصادر الحالية.':'Current sources could not be loaded.',recovery,goal:null,task:state.populated?{title:'Compare current explanations',description:'Use the current task instructions.',course:'Reasoning · Cedar',unit:null,state:'available',primaryAction:{label:ar?'فتح المهمة الحالية':'Open current task',onClick:()=>f.actions++}}:null,stages:[],feedback:null,upcoming:null,recognition:{status:'unavailable',totalPoints:null,periodLabel:null,currentMilestone:null,entries:[]},classChallenge:null,help:null,companion:{visible:false,name:'Foxi'}};const admin={availability:state.mode,schoolName:state.schoolName,environmentLabel:null,dateLabel:'13 October 2026',facts:[{key:'country',label:ar?'البلد':'Country',value:'QA',icon:'school'}],areas:[],people:{status:'unavailable',records:[]},policies:[],governance:null,execution:null,audit:{status:'unavailable',records:[]}};return<div className='workspace' data-theme='light' lang={state.locale} dir={ar?'rtl':'ltr'}><header data-current-school><span>{state.schoolName??(ar?'معلومات المدرسة غير متاحة':'School information is not available')}</span></header><main>{state.role==='student'?<StudentTrailView context={student} assets={assets} locale={state.locale}/>:<AdminTrailHomeView context={admin} locale={state.locale}/>}</main><button id='outside'>Outside Home</button></div>}createRoot(document.getElementById('root')).render(<H/>);`);
  connectedScript = await bundle(`import React,{createContext,useContext,useState}from'react';import{createRoot}from'react-dom/client';import{StudentTrailHome}from'./apps/web/features/home/components/student-trail-home';import{CommandJournal}from'./apps/web/shared/api/client';import{FormDrafts}from'./apps/web/shared/session/form-drafts';import{getDictionary}from'./apps/web/shared/i18n/locale';const C=createContext(null);globalThis.compactHomeContext=C;globalThis.compactHomeUseContext=useContext;const f=globalThis.compactHome={reads:[],writes:[],actions:[],portfolioFailure:false};globalThis.fetch=async(raw,options)=>{const url=new URL(String(raw));if(options?.method&&options.method!=='GET'){f.writes.push(url.pathname);throw Error('Provider effects blocked');}f.reads.push(url.pathname+url.search);if(f.portfolioFailure&&url.pathname==='/v1/portfolio/items')return Response.json({code:'REQUEST_UNAVAILABLE'},{status:503});return Response.json({items:[],nextCursor:null});};const commandJournal=new CommandJournal(),formDrafts=new FormDrafts();function H(){const[s,set]=useState(globalThis.compactHomeInput);f.set=set;const app={locale:s.locale,dictionary:getDictionary(s.locale),apiUrl:'https://compact-home.fixture.invalid',accessToken:'current-token',online:true,status:'ready',accessGeneration:1,membership:{schoolId:'77000000-0000-4000-8000-000000000001',userId:'77000000-0000-4000-8000-000000000002',role:'student',displayName:'Lina Hassan',school:{id:'77000000-0000-4000-8000-000000000001',name:'Current academy'},entitlements:['learning','assessment','curriculum','portfolio']},commandJournal,formDrafts,reportDiagnostic(){},refreshAccess(){}};return<C.Provider value={app}><div className='workspace' data-theme='light'><main><StudentTrailHome onNavigate={target=>f.actions.push(target)}/></main></div></C.Provider>}createRoot(document.getElementById('root')).render(<H/>);`, true);
});

async function mount(page: Page, input: Record<string, unknown>, script = pureScript) {
  const messages: string[] = [];
  page.on('pageerror', error => messages.push(error.message)); page.on('console', message => { if (['warning', 'error'].includes(message.type())) messages.push(message.text()); });
  await page.setContent('<!doctype html><html><head><title>Current compact Home controls</title><style>' + css + '\n.workspace > main { padding-inline:var(--space-3); }</style></head><body><div id="root"></div></body></html>');
  await page.evaluate(value => { (globalThis as unknown as { compactHomeInput: unknown }).compactHomeInput = value; }, input);
  await page.addScriptTag({ content: script }); await expect(page.locator('main h1')).toHaveCount(1);
  return messages;
}

for (const locale of ['en', 'ar'] as const) for (const width of [320, 1366]) test(`${locale}/${width}: compact Student refresh keeps tooltip, exact callback and source guidance`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 }); const messages = await mount(page, { role: 'student', locale, mode: 'error', populated: false });
  await page.screenshot({ path: resolve(root, `.local/home-compact/student-${locale}-${width}.png`), fullPage: false });
  const label = locale === 'ar' ? 'تحديث عملي الحالي' : 'Refresh current work', button = page.getByRole('button', { name: label, exact: true });
  await expect(button).toHaveCount(1); await expect(button).toHaveClass(/cuevo-icon-button/);
  await expect(page.locator('.student-trail__source-notice')).toHaveAttribute('role', 'alert'); await expect(page.locator('.student-trail__source-notice')).toContainText(locale === 'ar' ? 'تعذّر' : 'could not');
  await expect(page.locator('.student-trail__task button,.student-trail__companion-picker')).toHaveCount(0);
  await button.hover(); await expect(button.locator('.cuevo-icon-button__tooltip')).toBeVisible();
  const geometry = await button.evaluate(element => { const rect = element.getBoundingClientRect(), row = element.closest('.student-trail__intro-row')!.getBoundingClientRect(); return { left: rect.left, right: rect.right, width: rect.width, height: rect.height, rowLeft: row.left, rowRight: row.right }; });
  expect(geometry.width).toBeGreaterThanOrEqual(44); expect(geometry.height).toBeGreaterThanOrEqual(44);
  expect(locale === 'ar' ? geometry.left - geometry.rowLeft : geometry.rowRight - geometry.right).toBeLessThanOrEqual(1);
  await button.focus(); await expect(button.locator('.cuevo-icon-button__tooltip')).toBeVisible(); await page.keyboard.press('Escape'); await expect(button.locator('.cuevo-icon-button__tooltip')).toBeHidden(); await expect(button).toBeFocused();
  await page.keyboard.press('Enter'); expect(await page.evaluate(() => (globalThis as unknown as { compactHome: { refresh: number } }).compactHome.refresh)).toBe(1);
  await page.evaluate(() => (globalThis as unknown as { compactHome: { set(value: unknown): void } }).compactHome.set({ role: 'student', locale: document.querySelector('.student-trail')!.getAttribute('lang'), mode: 'loading', pending: true, populated: true }));
  await expect(button).toBeDisabled(); await expect(button).toHaveAttribute('aria-busy', 'true'); await expect(page.locator('.student-trail__task')).toContainText('Compare current explanations');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false); expect(messages).toEqual([]);
});

for (const locale of ['en', 'ar'] as const) test(`${locale}: connected Student Hide/Show stays meaningful after ineffective quiet toggle removal`, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 }); const messages = await mount(page, { locale }, connectedScript);
  const hide = locale === 'ar' ? 'إخفاء فوكسي' : 'Hide Foxi', show = locale === 'ar' ? 'إظهار فوكسي' : 'Show Foxi';
  await expect(page.getByRole('button', { name: hide, exact: true })).toBeVisible(); await expect(page.locator('.student-trail__foxi-crop')).toHaveCount(1);
  await expect(page.getByRole('button', { name: /quiet presentation|العرض الهادئ/ })).toHaveCount(0);
  const reads = await page.evaluate(() => (globalThis as unknown as { compactHome: { reads: string[] } }).compactHome.reads.slice());
  await page.getByRole('button', { name: hide, exact: true }).click(); await expect(page.locator('.student-trail__foxi-crop')).toHaveCount(0);
  await page.getByRole('button', { name: show, exact: true }).click(); await expect(page.locator('.student-trail__foxi-crop')).toHaveCount(1);
  const after = await page.evaluate(() => { const f = (globalThis as unknown as { compactHome: { reads: string[]; writes: string[]; actions: unknown[] } }).compactHome; return { reads: f.reads, writes: f.writes, actions: f.actions }; });
  expect(after.reads).toEqual(reads); expect(after.writes).toEqual([]); expect(after.actions).toEqual([]);
  await page.evaluate(() => { (globalThis as unknown as { compactHome: { portfolioFailure: boolean } }).compactHome.portfolioFailure = true; });
  const refresh = page.getByRole('button', { name: locale === 'ar' ? 'تحديث العمل الحالي' : 'Refresh current work', exact: true }); await refresh.click();
  await expect.poll(() => page.evaluate(() => (globalThis as unknown as { compactHome: { reads: string[] } }).compactHome.reads.length)).toBeGreaterThan(reads.length);
  await expect(page.locator('.student-trail__portfolio [role="alert"]')).toBeVisible(); await expect(refresh).toHaveCount(1);
  await expect(page.locator('.student-trail__portfolio').getByRole('button', { name: locale === 'ar' ? 'تحديث العمل الحالي' : 'Refresh current work', exact: true })).toHaveCount(0);
  await page.evaluate(() => { (globalThis as unknown as { compactHome: { portfolioFailure: boolean } }).compactHome.portfolioFailure = false; }); await refresh.click();
  await expect(page.locator('.student-trail__portfolio [role="alert"]')).toHaveCount(0);
  expect(messages).toEqual([]);
});

for (const locale of ['en', 'ar'] as const) test(`${locale}: Admin school header is not repeated in Home while current facts remain`, async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 }); const messages = await mount(page, { role: 'admin', locale, mode: 'ready', schoolName: 'Current academy' });
  await page.screenshot({ path: resolve(root, `.local/home-compact/admin-${locale}-320.png`), fullPage: false });
  await expect(page.locator('[data-current-school]')).toContainText('Current academy'); await expect(page.locator('.admin-trail__school')).toHaveCount(0); await expect(page.locator('.admin-trail')).not.toContainText('Current academy');
  await expect(page.locator('.admin-trail__context')).toContainText('QA'); await expect(page.locator('.admin-trail__context')).toContainText('13 October 2026');
  await page.evaluate(() => { const f = (globalThis as unknown as { compactHome: { set(value: unknown): void } }).compactHome; f.set({ role: 'admin', locale: document.querySelector('.admin-trail')!.getAttribute('lang'), mode: 'ready', schoolName: null }); });
  await expect(page.locator('.admin-trail__context [role="status"]').first()).toContainText(locale === 'ar' ? 'معلومات المدرسة غير متاحة' : 'School information is not available');
  const overflow = await page.evaluate(() => ({ width: innerWidth, documentWidth: document.documentElement.scrollWidth, rows: [...document.querySelectorAll('.admin-trail *')].filter(element => { const r = element.getBoundingClientRect(); return r.left < -1 || r.right > innerWidth + 1; }).map(element => ({ tag: element.tagName, className: element.className, rect: element.getBoundingClientRect().toJSON() })).slice(0, 12) }));
  expect(overflow.documentWidth, JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.width + 1); expect(messages).toEqual([]);
});
