import { test, expect, type Page } from '@playwright/test';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import AxeBuilder from '@axe-core/playwright';

const root = resolve(import.meta.dirname, '../..');
const css = ['packages/ui/src/tokens.css', 'apps/web/app/globals.css', 'apps/web/features/development/styles.css'].map(file => readFileSync(resolve(root, file), 'utf8')).join('\n');
const learnerId = 'da000000-0000-4000-8000-000000000010', periodId = 'da000000-0000-4000-8000-000000000003';
const browserErrors = new WeakMap<Page, string[]>();
async function mount(page: Page) {
  const errors: string[] = []; browserErrors.set(page, errors);
  page.on('pageerror', () => errors.push('pageerror'));
  page.on('console', message => { if (['error', 'warning'].includes(message.type())) errors.push(message.type()); });
  const result = await build({ stdin: { resolveDir: root, loader: 'tsx', contents: `
import React,{createContext,useContext,useState}from'react';import{createRoot}from'react-dom/client';import{DevelopmentWorkspace}from'./apps/web/features/development/components/development-workspace';import{CommandJournal}from'./apps/web/shared/api/client';import{FormDrafts}from'./apps/web/shared/session/form-drafts';
const C=createContext(null);globalThis.developmentLayoutContext=C;globalThis.developmentLayoutUseContext=useContext;const id=n=>'da000000-0000-4000-8000-'+String(n).padStart(12,'0'),journal=new CommandJournal(),drafts=new FormDrafts();
globalThis.developmentLayoutFixture={configured:false,long:false,reads:[],writes:[]};
globalThis.fetch=async(input,init)=>{const f=globalThis.developmentLayoutFixture,u=new URL(String(input)),path=u.pathname;f.reads.push(path);if(init?.method==='POST'){f.writes.push(path);throw Error('No commands admitted in layout verification')}const suffix=f.long?' — School-authored source context with a reviewed plan and a meaningful next action.':'',policy={id:id(2),version:3,points:{practice:0,revision:7,reflection:13},milestones:Array.from({length:20},(_,i)=>({key:'milestone:'+i,title:'Reviewed milestone '+(i+1)+suffix,minimumPoints:(i+1)*10}))},period={id:id(3),classId:id(4),policyId:id(2),title:'Autumn recorded learning'+suffix,startsAt:'2026-10-01T00:00:00Z',endsAt:'2026-12-01T00:00:00Z'},learnerId=u.searchParams.get('learnerId')||id(10);
policy.approvedBy=id(1);policy.approvedAt='2026-10-03T00:00:00Z';
const ledger=Array.from({length:100},(_,i)=>({id:id(1000+i),learnerId,periodId:id(3),observationId:id(2000+i),kind:['practice','revision','reflection'][i%3],points:[0,7,13][i%3],occurredAt:'2026-10-03T00:00:00Z',policyId:id(2)})),achievements=Array.from({length:20},(_,i)=>({id:id(3000+i),learnerId,periodId:id(3),policyId:id(2),key:'milestone:'+i,title:'Recorded milestone '+(i+1)+suffix,minimumPoints:(i+1)*10,earnedAt:'2026-10-04T00:00:00Z'})),goals=Array.from({length:25},(_,i)=>({id:id(4000+i),revisionId:id(5000+i),revision:1,learnerId,learnerName:'Lina Al-Kuwari',courseId:id(6),courseTitle:'School checking journey'+suffix,referenceId:null,referenceTitle:null,title:'Plan a learning step '+(i+1)+suffix,plannedStep:'Describe a current method and compare it with the recorded explanation.',status:'ACTIVE',review:null,createdAt:'2026-10-02T00:00:00Z',reviewedAt:null}));
const value=path==='/v1/people'?{items:Array.from({length:10},(_,i)=>({userId:id(10+i),displayName:(i===0?'Lina Al-Kuwari':'Current learner '+(i+1))+suffix,role:'student',classLabels:['Cedar · Year 1 · 2026–2027']})),nextCursor:null}:path==='/v1/classes'?{items:[{id:id(4),name:'Cedar',yearGroupName:'Year 1',academicYearName:'2026–2027'}],nextCursor:null}:path==='/v1/development/policies'?{items:f.configured?[policy]:[],nextCursor:null}:path==='/v1/development/periods'?{items:f.configured?[period]:[],nextCursor:null}:path==='/v1/development/summary'?{learnerId,periodId:id(3),status:'RECORDED_ONLY',totalPoints:660,leaderboardEnabled:true,streak:{status:'RECORDED',basis:'VERIFIED_RECOGNIZED_ACTION_DAYS',timezone:'UTC',days:3,endingOn:'2026-10-04',recordedDays:4,sourceCount:100}}:path==='/v1/development/ledger'?{items:ledger,nextCursor:null}:path==='/v1/development/achievements'?{items:achievements,nextCursor:null}:path==='/v1/development/leaderboard'?{periodId:id(3),status:'OPT_IN_RECORDED_ACTIONS',items:Array.from({length:100},(_,i)=>({alias:'Learning alias '+(i+1)+(f.long?' — تدريب ومراجعة':'') ,points:660,rank:1}))}:path==='/v1/development/goals'?{items:goals,nextCursor:id(4024)}:{items:[],nextCursor:null};return new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json'}});
};
function Harness(){const[locale,setLocale]=useState('en'),[generation,setGeneration]=useState(1);globalThis.developmentLayoutConfigure=(long=false)=>{globalThis.developmentLayoutFixture.configured=true;globalThis.developmentLayoutFixture.long=long;setGeneration(x=>x+1)};globalThis.developmentLayoutLocale=value=>setLocale(value);return<C.Provider value={{locale,membership:{schoolId:id(9),userId:id(1),role:'admin',displayName:'Current authorized actor',entitlements:['learning','learner.state']},status:'ready',online:true,apiUrl:'https://fixture.invalid',accessToken:'synthetic',accessGeneration:generation,commandJournal:journal,formDrafts:drafts,refreshAccess(){},announce(){},reportDiagnostic(){}}}><main className='workspace' dir={locale==='ar'?'rtl':'ltr'}><DevelopmentWorkspace/></main></C.Provider>}createRoot(document.getElementById('root')).render(<Harness/>);
` }, bundle: true, write: false, platform: 'browser', jsx: 'automatic', format: 'iife', plugins: [{ name: 'current-session-input', setup(bundler) {
    bundler.onLoad({ filter: /shared[\\/]session[\\/]providers\.tsx$/ }, () => ({ loader: 'js', contents: 'export function useApp(){return globalThis.developmentLayoutUseContext(globalThis.developmentLayoutContext)}' }));
    bundler.onLoad({ filter: /\.(webp|png|svg)$/ }, args => ({ loader: 'js', contents: 'export default ' + JSON.stringify({ src: 'data:image/' + (args.path.endsWith('.svg') ? 'svg+xml' : 'webp') + ';base64,' + readFileSync(args.path).toString('base64'), width: 128, height: 128 }) }));
  } }] });
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.setContent('<html lang="en"><head><title>Development layout verification</title><style>' + css + '</style></head><body><div id="root"></div></body></html>');
  await page.addScriptTag({ content: result.outputFiles[0].text });
  await expect(page.locator('.development-policy>header>button')).toBeEnabled();
}
async function configure(page: Page, long = false) {
  await page.evaluate(value => (globalThis as unknown as { developmentLayoutConfigure: (long: boolean) => void }).developmentLayoutConfigure(value), long);
  await expect(page.locator('.development-policy-values')).toHaveCount(1);
}
async function selectCurrent(page: Page) {
  await page.locator('.development-learner-picker select').selectOption(learnerId);
  await page.locator('.development-selectors select').last().selectOption(periodId);
  await expect(page.locator('.development-ledger__entry')).toHaveCount(100);
  await expect(page.locator('.development-milestone-list>li')).toHaveCount(20);
  await expect(page.locator('.development-board-list>li')).toHaveCount(100);
}
async function health(page: Page) {
  expect(browserErrors.get(page)).toEqual([]);
  expect(await page.evaluate(() => (globalThis as unknown as { developmentLayoutFixture: { writes: unknown[] } }).developmentLayoutFixture.writes)).toEqual([]);
  await expect(page.locator('.development-workspace [role="alert"]')).toHaveCount(0);
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
}

test('unconfigured and populated policy editors keep the independent period card at its natural height', async ({ page }) => {
  await mount(page);
  await page.getByRole('button', { name: 'Approve recognition policy', exact: true }).click();
  await expect(page.locator('.development-policy form')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Create learning period', exact: true })).toBeDisabled();
  const emptyPolicy = await page.locator('.development-policy').boundingBox(), emptyPeriod = await page.locator('.development-period').boundingBox();
  expect(emptyPeriod!.height).toBeLessThan(emptyPolicy!.height - 250);
  await page.locator('.development-policy form').getByRole('button', { name: 'Cancel', exact: true }).click();
  await configure(page, true);
  await page.getByRole('button', { name: 'Approve recognition policy', exact: true }).click();
  const policy = await page.locator('.development-policy').boundingBox(), period = await page.locator('.development-period').boundingBox();
  expect(period!.height).toBeLessThan(policy!.height - 500);
  await expect(page.locator('.development-policy-milestones li')).toHaveCount(20);
  await expect(page.locator('.development-policy-values dd').first()).toHaveText('0');
  await health(page);
});

test('dense current achievements keep natural height beside a longer class alias board', async ({ page }) => {
  await mount(page); await configure(page, true); await selectCurrent(page);
  const milestones = await page.locator('.development-milestones').boundingBox(), board = await page.locator('.development-board').boundingBox();
  expect(milestones!.height).toBeLessThan(board!.height - 400);
  await expect(page.locator('.development-goal-records')).not.toHaveAttribute('open');
  await expect(page.locator('.development-goals .development-meta')).toContainText('More');
  await health(page);
});

for (const locale of ['en', 'ar'] as const) test(`${locale} 320px staff Back wraps within the current reader at 200 percent text enlargement`, async ({ page }) => {
  await mount(page); await configure(page, true); await selectCurrent(page);
  await page.evaluate(value => { (globalThis as unknown as { developmentLayoutLocale: (locale: string) => void }).developmentLayoutLocale(value); document.documentElement.lang = value; document.documentElement.dir = value === 'ar' ? 'rtl' : 'ltr'; }, locale);
  await page.setViewportSize({ width: 320, height: 844 });
  await page.addStyleTag({ content: 'html{font-size:32px!important}' });
  const back = page.getByRole('button', { name: locale === 'ar' ? 'العودة إلى الطلاب' : 'Back to learners', exact: true });
  await expect(back).toBeVisible();
  const bounds = await back.boundingBox();
  expect(bounds!.width).toBeLessThanOrEqual(320);
  expect(bounds!.x).toBeGreaterThanOrEqual(-1);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(321);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  expect((await page.locator('.development-selectors select').last().boundingBox())!.width).toBeGreaterThan(150);
  const points = page.locator('.development-total strong');
  await expect(points).toHaveText(new Intl.NumberFormat(locale).format(660));
  expect(await points.evaluate(element => element.getBoundingClientRect().height <= Number.parseFloat(getComputedStyle(element).lineHeight) * 1.5)).toBe(true);
  await back.focus(); await page.keyboard.press('Enter');
  await expect(page.locator('.development-selected-heading')).toHaveCount(0);
  await expect(page.locator('.development-learner-picker select')).toBeFocused();
  await expect(page.locator('.development-selectors select').last()).toHaveValue(periodId);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await health(page);
});
