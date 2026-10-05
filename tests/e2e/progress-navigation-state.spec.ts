import { test, expect, type Page, type Route } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import AxeBuilder from '@axe-core/playwright';

const root = resolve(import.meta.dirname, '../..');
const school = 'f8100000-0000-4000-8000-000000000001';
const learner = 'f8200000-0000-4000-8000-000000000001';
const second = 'f8200000-0000-4000-8000-000000000002';
const period = 'f8300000-0000-4000-8000-000000000001';
const result = 'f8400000-0000-4000-8000-000000000001';
const evidence = 'f8500000-0000-4000-8000-000000000001';
const names = { academic: /^(Academic evidence|الشواهد الأكاديمية)$/, observations: /^(Learning observations|ملاحظات التعلّم)$/, support: /^(Support|الدعم)$/, reports: /^(Result pages|صفحات النتائج)$/ };
type Mode = 'unknown' | 'ready' | 'stale' | 'denied' | 'mismatch';

function state(id: string, mode: Mode) {
  const ready = mode === 'ready' || mode === 'stale';
  return { learnerId: mode === 'mismatch' ? second : id, status: ready ? 'READY' : 'UNKNOWN', freshness: mode === 'stale' ? 'STALE' : 'CURRENT', generatedAt: ready ? '2026-10-05T00:00:00.000Z' : null, version: ready ? 1 : null,
    academic: ready ? [{ resultId: result, referenceId: result, referenceVersion: 'School v1', evidenceId: evidence, observedAt: '2026-10-05T00:00:00.000Z', assessmentTitle: 'Explain one checking step', referenceTitle: 'School explanation objective', nativeResult: { type: 'numeric', score: 0, maxScore: 10, policyVersion: 1, normalized: null } }] : [],
    development: { practice: { count: null, observationIds: [] }, revision: { count: null, observationIds: [] }, reflection: { count: null, observationIds: [] }, windowStart: null, windowEnd: null }, engagement: { completedActivityCount: null, lastCompletedAt: null }, support: { activeInterventionIds: [], items: [] }, impact: { status: 'unmeasured', measurementIds: [], outcomes: [] }, sourceEventIds: [],
    projection: { scope: 'CURRENT_AUTHORIZED_SOURCES', academic: { totalCount: ready ? 1 : 0, returnedCount: ready ? 1 : 0, truncated: false, nextCursor: null }, support: { totalCount: 0, returnedCount: 0, truncated: false }, outcomes: { totalCount: 0, returnedCount: 0, truncated: false }, observations: Object.fromEntries(['practice', 'revision', 'reflection'].map(kind => [kind, { totalCount: null, returnedCount: 0, truncated: false }])), sourceEvents: { totalCount: 0, returnedCount: 0, truncated: false } } };
}

async function mount(page: Page, role = 'student') {
  const calls: { path: string; method: string }[] = [];
  let mode: Mode = 'unknown', heldState: Route | null = null, holdState = false, heldReport: Route | null = null;
  await page.route('https://progress.fixture.invalid/**', async route => {
    const url = new URL(route.request().url()); calls.push({ path: url.pathname + url.search, method: route.request().method() });
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };
    if (route.request().method() === 'OPTIONS') { await route.fulfill({ headers }); return; }
    if (url.pathname.endsWith('/state') && holdState) { heldState = route; return; }
    if (url.pathname.endsWith('/academic-report')) { heldReport = route; return; }
    let body: unknown = { items: [], nextCursor: null }, status = 200;
    if (url.pathname === '/v1/people') body = { items: [{ userId: learner, displayName: 'Lina Hassan', role: 'student', classLabels: ['Cedar · Year 8'] }, { userId: second, displayName: 'Sara Ali', role: 'student', classLabels: ['Palm · Year 8'] }], nextCursor: null };
    else if (url.pathname.endsWith('/state')) { body = state(url.pathname.split('/')[3], mode); if (mode === 'denied') { status = 403; body = { code: 'DENIED' }; } }
    else if (url.pathname.endsWith('/report-periods')) body = { items: [{ id: period, name: 'School autumn review', startsOn: '2026-10-01', endsOn: '2026-10-31' }], nextCursor: null };
    else if (url.pathname === '/v1/attention-policy') body = { policy: null };
    else if (url.pathname.includes('/evidence/')) { status = 403; body = { code: 'DENIED' }; }
    await route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify(body) });
  });
  const built = await build({ stdin: { resolveDir: root, loader: 'tsx', contents: `
    import React,{createContext,useCallback,useState} from 'react';import{createRoot}from'react-dom/client';import{ProgressWorkspace}from'./apps/web/features/progress/components/progress-workspace';import{WorkspaceChrome}from'./apps/web/features/shell/components/workspace-chrome';import{getDictionary}from'./apps/web/shared/i18n/locale';import{CommandJournal}from'./apps/web/shared/api/client';import{FormDrafts}from'./apps/web/shared/session/form-drafts';
    const Context=createContext(null);globalThis.progressContext=Context;const journal=new CommandJournal(),drafts=new FormDrafts();
    function Harness(){const[locale,setLocale]=useState('en'),[role,setRole]=useState('${role}'),[generation,setGeneration]=useState(1),[child,setChild]=useState(''),[theme,setTheme]=useState('light');const refreshAccess=useCallback(()=>{},[]),reportDiagnostic=useCallback(()=>{},[]);const app={locale,dictionary:getDictionary(locale),membership:{schoolId:'${school}',userId:role==='student'?'${learner}':'f8600000-0000-4000-8000-000000000001',role,displayName:role==='student'?'Lina Hassan':'Current adult',school:{name:'Current school'},entitlements:['learning','assessment','curriculum','learner.state','school.operations']},status:'ready',online:true,apiUrl:'https://progress.fixture.invalid',accessToken:'fictional-current-token',accessGeneration:generation,formDrafts:drafts,commandJournal:journal,selectedChildId:child,selectChild:setChild,refreshAccess,reportDiagnostic,announce(){}};globalThis.progressApp=app;globalThis.progressRefresh=()=>setGeneration(x=>x+1);const context={navigation:[{id:'overview',label:'Home',icon:'home',onSelect(){}},{id:'progress',label:'Progress',icon:'progress',onSelect(){}}],selectedId:'progress',currentWorkspace:{id:'progress',label:'Progress',icon:'progress',onSelect(){}},schoolName:'Current school',personName:app.membership.displayName,roleLabel:role,locale,theme,mode:'focused',brand:<span>Cuevo</span>};return<Context.Provider value={app}><div className='fixture-controls'><label>Fixture role<select id='fixture-role' value={role} onChange={event=>{setRole(event.target.value);setChild('')}}><option>student</option><option>parent</option><option>teacher</option><option>coordinator</option><option>admin</option></select></label><button id='locale' onClick={()=>setLocale(x=>x==='en'?'ar':'en')}>Language</button><button id='theme' onClick={()=>setTheme(x=>x==='light'?'dark':'light')}>Theme</button><button id='revalidate' onClick={()=>setGeneration(x=>x+1)}>Revalidate source</button></div><WorkspaceChrome context={context}><main className='workspace-main'><ProgressWorkspace/></main></WorkspaceChrome></Context.Provider>;}createRoot(document.getElementById('root')).render(<Harness/>);
  ` }, bundle: true, write: false, platform: 'browser', jsx: 'automatic', format: 'iife', plugins: [{ name: 'current-session-only', setup(bundler) {
    bundler.onLoad({ filter: /shared[\\/]session[\\/]providers\.tsx$/ }, () => ({ loader: 'js', contents: "import{useContext}from'react';export function useApp(){return useContext(globalThis.progressContext)}" }));
    bundler.onLoad({ filter: /\.(webp|svg|png)$/ }, args => ({ loader: 'js', contents: 'export default ' + JSON.stringify({ src: 'data:image/' + (args.path.endsWith('.svg') ? 'svg+xml' : 'webp') + ';base64,' + readFileSync(args.path).toString('base64'), width: 128, height: 128 }) }));
  } }] });
  const css = ['packages/ui/src/tokens.css', 'apps/web/app/globals.css', 'apps/web/shared/characters/styles.css', 'apps/web/features/shell/styles.css', 'apps/web/features/progress/styles.css', 'apps/web/features/academic/styles.css'].map(path => readFileSync(resolve(root, path), 'utf8')).join('\n');
  await page.setContent(`<style>${css}</style><style>.fixture-controls{position:fixed;inset-block-end:0;inset-inline-end:0;z-index:999;background:white;font-size:10px}.fixture-controls select{max-width:90px}.fixture-controls button{font-size:10px}html{font-size:16px}</style><div id="root"></div>`); await page.addScriptTag({ content: built.outputFiles[0].text });
  return { calls, mode: (value: Mode) => { mode = value; }, hold: () => { holdState = true; }, release: async (id = learner) => { expect(heldState).not.toBeNull(); holdState = false; await heldState!.fulfill({ headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify(state(id, mode)) }); heldState = null; }, report: async (id = learner) => { expect(heldReport).not.toBeNull(); await heldReport!.fulfill({ headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify({ schemaVersion: '1', schoolId: school, learnerId: id, schoolName: 'Current school', learnerName: id === learner ? 'Lina Hassan' : 'Sara Ali', generatedAt: '2026-10-05T00:00:00.000Z', scope: 'CURRENT_RELEASED_PERIOD_PAGE', period: { id: period, name: 'School autumn review', revision: 1, startsOn: '2026-10-01', endsOn: '2026-10-31', basis: 'SOURCE_SUBMITTED_DATE_UTC' }, coverage: 'NOT_ESTABLISHED', items: [], nextCursor: null }) }); heldReport = null; }, reportWaiting: () => heldReport !== null };
}

test('Progress uses one live top chapter rail and utilities with current unknown, loading, denied and exact learner sources', async ({ page }) => {
  const fixture = await mount(page); await expect(page.locator('.progress-detail')).toHaveCount(1);
  const host = page.locator('[data-workspace-sections]'); await expect(host.getByRole('link', { name: names.academic })).toHaveCount(1);
  await expect(host.getByRole('link')).toHaveCount(4); await expect(page.locator('.progress-detail .progress-chapters')).toHaveCount(0);
  await expect(host.getByRole('button', { name: 'Refresh learner state', exact: true })).toHaveCount(1); await expect(host.getByRole('button', { name: 'Hide Foxi', exact: true })).toHaveCount(1);
  await expect(page.locator('.progress-source-context .cuevo-workspace-state')).toHaveCount(1);
  await expect(page.locator('#progress-academic .cuevo-workspace-state')).toHaveCount(1); await expect(page.locator('#progress-support .cuevo-workspace-state')).toHaveCount(1);
  fixture.hold(); await host.getByRole('button', { name: 'Refresh learner state', exact: true }).click(); await expect(host.getByRole('link')).toHaveCount(0); await expect(host.getByRole('button', { name: 'Refresh learner state', exact: true })).toHaveCount(1); await expect(page.locator('.learner-detail-heading')).toContainText('Lina Hassan');
  await fixture.release(); await expect(host.getByRole('link')).toHaveCount(4);
  fixture.mode('stale'); await host.getByRole('button', { name: 'Refresh learner state', exact: true }).click(); await expect(page.locator('.progress-source-context [data-state="review"]')).toHaveCount(1); await expect(page.locator('.progress-source-context')).toContainText('Snapshot as of'); await expect(page.locator('[data-result-id]')).toHaveCount(1);
  fixture.mode('denied'); await page.locator('#revalidate').click(); await expect(page.locator('.progress-review-reading [role="alert"]')).toHaveCount(0); await expect(page.locator('.progress-workspace [role="alert"]')).toHaveCount(1); await expect(host.getByRole('link')).toHaveCount(0);
  fixture.mode('mismatch'); await page.locator('#revalidate').click(); await expect(host.getByRole('link')).toHaveCount(0); await expect(page.locator('[data-result-id]')).toHaveCount(0);
  expect(fixture.calls.filter(call => call.method === 'POST')).toEqual([]);
});

test('chapter keyboard navigation preserves current report period, pending request, native evidence and refresh focus', async ({ page }) => {
  const fixture = await mount(page); fixture.mode('ready'); await page.locator('#revalidate').click(); await expect(page.locator('[data-result-id]')).toHaveCount(1);
  const host = page.locator('[data-workspace-sections]'); await expect(page.locator('#report-period option')).toHaveCount(2);
  await page.locator('#report-period').selectOption(period); await page.getByRole('button', { name: 'Browse current result pages', exact: true }).click(); await expect.poll(fixture.reportWaiting).toBe(true); await expect(page.locator('#report-period')).toBeDisabled();
  const before = fixture.calls.length; await host.getByRole('link', { name: names.academic }).focus(); await page.keyboard.press('Enter'); await expect(page.locator('#progress-academic')).toBeFocused(); await expect(page.locator('main h1')).not.toBeFocused(); expect(await page.evaluate(() => location.hash)).toBe('#progress-academic'); await expect(page.locator('#report-period')).toHaveValue(period); await expect(page.locator('#report-period')).toBeDisabled(); expect(fixture.calls.length).toBe(before);
  await fixture.report(); await expect(page.locator('#report-period')).toBeEnabled(); await page.getByRole('button', { name: 'View evidence', exact: true }).click(); await expect(page.locator('[data-result-id] [role="alert"]')).toHaveCount(1);
  const evidenceReads = fixture.calls.filter(call => call.path.includes('/evidence/')).length; await host.getByRole('link', { name: names.support }).click(); await expect(page.locator('#progress-support')).toBeFocused(); await host.getByRole('link', { name: names.reports }).click(); await expect(page.locator('#progress-reports')).toBeFocused(); await expect(page.locator('#report-period')).toHaveValue(period); await expect(page.locator('[data-result-id] [role="alert"]')).toHaveCount(1); expect(fixture.calls.filter(call => call.path.includes('/evidence/')).length).toBe(evidenceReads);
  const refresh = host.getByRole('button', { name: 'Refresh learner state', exact: true }); await refresh.focus(); await page.keyboard.press('Enter'); await expect(page.locator('[data-result-id]')).toHaveCount(1); await expect(refresh).toBeFocused();
  expect(fixture.calls.filter(call => call.method === 'POST')).toEqual([]);
});

test('five roles keep authorized chapters, current-child clearing, English Arabic dark mobile keyboard and reflow', async ({ page }, testInfo) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.name)); page.on('console', message => { if (message.type() === 'error' || message.type() === 'warning' && /hydrat/i.test(message.text())) errors.push(message.text()); });
  const fixture = await mount(page); const host = page.locator('[data-workspace-sections]'); await expect(host.getByRole('link')).toHaveCount(4);
  for (const role of ['parent', 'teacher', 'coordinator', 'admin']) {
    await page.locator('#fixture-role').selectOption(role); await expect(host.getByRole('link')).toHaveCount(0);
    if (role === 'parent') await page.getByLabel('Child', { exact: true }).selectOption(learner); else await page.locator('#learner-selection').selectOption(learner);
    await expect(host.getByRole('link')).toHaveCount(role === 'parent' ? 2 : 4); await expect(page.locator('.learner-detail-heading')).toContainText('Lina Hassan');
    if (role === 'parent') { await expect(host.getByRole('link', { name: names.support })).toHaveCount(0); const before = fixture.calls.length; await page.getByLabel('Child', { exact: true }).selectOption(second); await expect(page.locator('.learner-detail-heading')).toContainText('Sara Ali'); await expect(host.getByRole('link')).toHaveCount(2); expect(fixture.calls.slice(before).some(call => call.path.includes('/' + learner + '/state'))).toBe(false); await page.getByLabel('Child', { exact: true }).selectOption(''); await expect(host.getByRole('link')).toHaveCount(0); }
  }
  await page.locator('#fixture-role').selectOption('student'); await expect(host.getByRole('link')).toHaveCount(4);
  for (const locale of ['en', 'ar']) { if (locale === 'ar') await page.locator('#locale').click(); for (const width of [1440, 320]) { await page.setViewportSize({ width, height: 900 }); await page.locator('#theme').click(); await expect(page.locator('main h1')).toHaveCount(1); await expect(host.getByRole('link')).toHaveCount(4); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); const link = host.getByRole('link', { name: names.reports }); await link.focus(); await page.keyboard.press('Enter'); await expect(page.locator('#progress-reports')).toBeFocused(); const history = page.locator('.progress-record-history'); if (await history.getAttribute('open') === null) await history.locator(':scope > summary').click(); await expect(history.locator('.cuevo-workspace-state[data-state="empty"]')).toHaveCount(2); await expect(history.locator('.cuevo-workspace-state[data-state="empty"]').first()).toBeVisible(); await page.screenshot({ path: testInfo.outputPath(`progress-${locale}-${width}.png`) }); } }
  expect(errors).toEqual([]); expect(fixture.calls.filter(call => call.method === 'POST')).toEqual([]); expect((await new AxeBuilder({ page }).include('.workspace-chrome').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
});

test('Arabic320 enlarged text keeps one top utility source and every native chapter reachable', async ({ page }) => {
  const fixture = await mount(page); await expect(page.locator('[data-workspace-sections] a')).toHaveCount(4); await page.locator('#locale').click(); await page.locator('#theme').click(); await page.setViewportSize({ width: 320, height: 900 });
  await page.evaluate(() => { const nodes = [...document.querySelectorAll<HTMLElement>('.workspace *')], sizes = nodes.map(element => parseFloat(getComputedStyle(element).fontSize)); nodes.forEach((element, index) => { element.style.fontSize = `${sizes[index] * 2}px`; }); });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const utilities = page.locator('.progress-navigation .cuevo-workspace-section-actions'); await expect(utilities).toHaveCount(1); expect(await utilities.evaluate(element => element.scrollWidth <= element.clientWidth + 2)).toBe(true);
  const link = page.locator('[data-workspace-sections]').getByRole('link', { name: names.reports }); await link.focus(); await link.scrollIntoViewIfNeeded(); await expect(link).toBeFocused(); await page.keyboard.press('Enter'); await expect(page.locator('#progress-reports')).toBeFocused();
  expect(fixture.calls.filter(call => call.method === 'POST')).toEqual([]);
});
