import { test, expect, type Page, type Route } from '@playwright/test';
import { build } from 'esbuild';
import { resolve } from 'node:path';
import { completeObservedSchoolSources, observeSchoolCurrentSources } from './school-current-sources';

const root = resolve(import.meta.dirname, '../..');
const origin = 'https://school.fixture.invalid';
const id = (value: number) => `eb000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
type Fixture = { held: Record<string, Route>; reads: string[]; writes: string[] };
async function mount(page: Page, mode: 'setup' | 'daily' | 'people', options: { hold?: string | string[]; deny?: string; invalid?: string; active?: boolean } = {}) {
  const fixture: Fixture = { held: {}, reads: [], writes: [] };
  const script = (await build({ stdin: { resolveDir: root, loader: 'tsx', contents: `
import React,{createContext,useContext}from'react';import{createRoot}from'react-dom/client';import{SchoolWorkspace}from'./apps/web/features/school/components/school-workspace';import{CommandJournal}from'./apps/web/shared/api/client';import{FormDrafts}from'./apps/web/shared/session/form-drafts';import{getDictionary}from'./apps/web/shared/i18n/locale';
const C=createContext(null);globalThis.schoolProbeC=C;globalThis.schoolProbeUC=useContext;const journal=new CommandJournal(),drafts=new FormDrafts();globalThis.schoolProbe={journal,drafts};const app={membership:{schoolId:'${id(1)}',userId:'${id(10)}',role:'admin',entitlements:['school.operations']},locale:'en',dictionary:getDictionary('en'),status:'ready',online:true,apiUrl:'${origin}',accessToken:'synthetic',accessGeneration:1,commandJournal:journal,formDrafts:drafts,announce(){},reportDiagnostic(){},refreshAccess(){},selectChild(){},selectedChildId:null};createRoot(document.getElementById('root')).render(<C.Provider value={app}><main><SchoolWorkspace/></main></C.Provider>);
` }, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', loader: { '.webp': 'dataurl', '.png': 'dataurl', '.svg': 'dataurl' }, plugins: [{ name: 'actual-current-session-input-only', setup(b) { b.onLoad({ filter: /shared[\\/]session[\\/]providers\.tsx$/ }, () => ({ loader: 'js', contents: 'export function useApp(){return globalThis.schoolProbeUC(globalThis.schoolProbeC)}' })); } }] })).outputFiles[0].text;
  const base = { status: 'active', revision: 1, effectiveFrom: '2026-09-01T00:00:00Z', effectiveTo: null, synthetic: true, selectionContext: { status: 'READY', enrollmentState: 'NONE', classes: [] } };
  const person = (n: number) => ({ ...base, id: id(100 + n), displayName: `Current person ${n}`, role: n === 1 ? 'teacher' : 'student' });
  const rows: Record<string, unknown[]> = {
    years: [{ id: id(2), name: '2026–2027', startsOn: '2026-09-01', endsOn: '2027-07-01', selectionStatus: 'READY' }],
    'year-groups': [{ id: id(3), name: 'Year 1', ordinal: 1, selectionStatus: 'READY' }],
    classes: [{ id: id(4), name: 'Cedar', academicYearId: id(2), yearGroupId: id(3), academicYearName: '2026–2027', yearGroupName: 'Year 1', status: 'active', selectionStatus: 'READY' }],
    subjects: [{ id: id(5), name: 'Mathematics', selectionStatus: 'READY' }],
    terms: [{ id: id(6), name: 'Autumn', academicYearId: id(2), academicYearName: '2026–2027', startsOn: '2026-09-01', endsOn: '2026-12-20', selectionStatus: 'READY' }],
    people: Array.from({ length: options.active ? 26 : 1 }, (_, i) => person(i + 1)),
    'teacher-assignments': options.active ? Array.from({ length: 26 }, (_, i) => ({ id: id(300+i), classId:id(4), subjectId:id(5),teacherId:id(101),status:'active',revision:1,effectiveFrom:`2026-09-${String(i+1).padStart(2,'0')}T00:00:00Z`,effectiveTo:null })) : [],
  };
  await page.route(`${origin}/**`, async route => {
    const url = new URL(route.request().url()), resource = url.pathname.split('/').at(-1)!;
    if (url.pathname === '/probe') return route.fulfill({ contentType: 'text/html', body: '<html><body><div id="root"></div></body></html>' });
    if (route.request().method() !== 'GET') { fixture.writes.push(url.pathname); return route.abort(); }
    fixture.reads.push(url.pathname + url.search);
    if (resource === 'context') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ school: { id: id(1), name: 'Current source school', countryCode: 'QA', languages: ['en', 'ar'] }, policy: { version: 1, parentAttendanceVisible: false, parentUpcomingVisible: false, studentMessagingEnabled: false, recognitionEnabled: false, leaderboardEnabled: false, analyticsEnabled: false }, intelligence: { fixtureSchoolApproved: false, liveSchoolApproved: false, availability: 'SERVER_CONFIG_AND_APPROVED_POLICY_REQUIRED' } }) });
    const key = `${resource}:${url.searchParams.has('cursor') ? 'more' : 'first'}`;
    if ((Array.isArray(options.hold)?options.hold:[options.hold]).includes(key)) { fixture.held[key] = route; return; }
    if (key === options.deny) return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ code: 'FORBIDDEN' }) });
    let items = rows[resource] ?? [], nextCursor: string | null = null;
    if (resource === 'people' && mode !== 'setup') { items = url.searchParams.has('cursor') ? [person(27)] : items; nextCursor = url.searchParams.has('cursor') ? null : id(126); }
    if (resource === 'teacher-assignments' && options.active) { items = url.searchParams.has('cursor') ? [{...(rows[resource][0] as Record<string,unknown>),id:id(327),effectiveFrom:'2026-10-01T00:00:00Z'}] : items; nextCursor = url.searchParams.has('cursor') ? null : id(325); }
    if (key === options.invalid) items = [{ id: 'invalid-current-source' }];
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items, nextCursor }) });
  });
  observeSchoolCurrentSources(page, origin);
  await page.goto(`${origin}/probe`); await page.addScriptTag({ content: script });
  await expect(page.getByRole('heading', { name: 'Setup', level: 1, exact: true })).toBeVisible();
  if (mode !== 'setup') await page.getByRole('button', { name: mode === 'daily' ? 'Daily operations' : 'People and access', exact: true }).click();
  if (mode === 'people' && !options.active) await page.locator('.school-access-directory').getByRole('button', { name: 'Teacher assignments', exact: true }).click();
  return fixture;
}

test('current Daily completion waits for held first and terminal bodies and preserves native current class', async ({ page }) => {
  const fixture = await mount(page, 'daily', { hold: ['people:first','people:more'] });
  await expect.poll(() => !!fixture.held['people:first']).toBe(true);
  let completed = false; const completion = completeObservedSchoolSources(page, 'daily').then(() => { completed = true; });
  await expect(page.getByRole('button', { name: 'Create calendar event', exact: true })).toBeDisabled();
  await expect(page.getByText('Loading school records…', { exact: true })).toHaveCount(0); expect(completed).toBe(false);
  // A SPA frame notification must preserve a read already in progress.
  await page.evaluate(() => history.pushState({}, '', '?view=school'));
  await fixture.held['people:first'].fulfill({ contentType: 'application/json', body: JSON.stringify({ items: [], nextCursor: id(126) }) });
  await expect.poll(()=>!!fixture.held['people:more']).toBe(true);
  await expect(page.getByRole('button',{name:'Loading more…: People and access',exact:true})).toBeDisabled();expect(completed).toBe(false);
  await fixture.held['people:more'].fulfill({contentType:'application/json',body:JSON.stringify({items:[],nextCursor:null})});
  await completion; expect(completed).toBe(true);
  await expect(page.getByLabel('Daily class records', { exact: true }).locator(`option[value="${id(4)}"]`)).toContainText('Cedar');
  expect(fixture.reads.filter(path => path.includes('/people'))).toHaveLength(2); expect(fixture.writes).toEqual([]);
});

test('actual inactive People uses its own named continuation before relationship admission', async ({ page }) => {
  const fixture = await mount(page, 'people');
  await completeObservedSchoolSources(page, 'people');
  await expect(page.locator('.school-access-directory__groups').getByRole('button', { name: 'Teacher assignments', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(fixture.reads.filter(path => path.includes('/people'))).toHaveLength(2); expect(fixture.writes).toEqual([]);
});

test('actual active relationship source uses native Next and returns to the original loaded page', async ({ page }) => {
  const fixture = await mount(page, 'people', { active: true });
  const directory = page.locator('.school-access-directory');
  await directory.getByRole('button', { name: 'Teacher assignments', exact: true }).click();
  await completeObservedSchoolSources(page, 'people');
  await expect(directory.locator('li button')).toHaveCount(25);await expect(directory.getByRole('button',{name:'Previous',exact:true})).toBeDisabled();
  await expect(directory.locator('.school-access-directory__groups').getByRole('button',{name:'Teacher assignments',exact:true})).toHaveAttribute('aria-pressed','true');
  expect(fixture.reads.filter(path=>path.includes('/teacher-assignments'))).toHaveLength(2);
  expect(fixture.writes).toEqual([]);
});

test('denied and malformed current bodies fail completion without admitting or writing', async ({ page }) => {
  for (const option of [{ deny: 'people:more' }, { invalid: 'people:first' }]) {
    const fixture = await mount(page, 'daily', option);
    await expect(completeObservedSchoolSources(page, 'daily')).rejects.toThrow();
    await expect(page.locator('.school-workspace [role="alert"]')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create calendar event', exact: true })).toHaveCount(0);
    await expect(page.locator('.school-workspace form')).toHaveCount(0);
    expect(fixture.writes).toEqual([]); await page.unrouteAll({ behavior: 'ignoreErrors' });
  }
});

test('completion requires observation before navigation and refuses a missing current source', async ({ page }) => {
  await expect(completeObservedSchoolSources(page, 'setup')).rejects.toThrow('observation must start before navigation');
  observeSchoolCurrentSources(page, origin); await page.setContent('<div class="school-workspace"><button>Create academic year</button></div>');
  await expect(completeObservedSchoolSources(page, 'setup')).rejects.toThrow();
});

test('terminal body cannot finish before delayed current DOM commitment or click a retained continuation again',async({page})=>{
  let continuations=0;
  await page.route(`${origin}/**`,route=>{const url=new URL(route.request().url());if(url.pathname==='/delayed')return route.fulfill({contentType:'text/html',body:`<div class="school-workspace"><div id="sources"></div><button id="create" disabled>Create calendar event</button></div><script>const resources=['classes','subjects','terms','people','years','year-groups','attendance','timetable','calendar','report-periods'];Promise.all(resources.map(async resource=>{const value=await(await fetch('/v1/school/'+resource+'?limit=100')).json();if(value.nextCursor){document.querySelector('#sources').innerHTML='<button id="more" aria-label="Load more: People and access">Load more</button>';document.querySelector('#more').onclick=async()=>{const b=document.querySelector('#more');b.disabled=true;b.setAttribute('aria-label','Loading more…: People and access');await(await fetch('/v1/school/people?limit=100&cursor=${id(126)}')).json();setTimeout(()=>{b.remove();document.querySelector('#create').disabled=false;document.body.dataset.committed='true'},100)}}}));</script>`});if(url.pathname==='/v1/school/people'&&url.searchParams.has('cursor'))continuations++;return route.fulfill({contentType:'application/json',body:JSON.stringify({items:[],nextCursor:url.pathname==='/v1/school/people'&&!url.searchParams.has('cursor')?id(126):null})});});
  observeSchoolCurrentSources(page,origin);await page.goto(`${origin}/delayed`);await completeObservedSchoolSources(page,'daily');expect(continuations).toBe(1);await expect(page.locator('body')).toHaveAttribute('data-committed','true');
});

test('repeated cursors wrong current path oversized pages and pending admission locks refuse completion',async({page})=>{
  for(const state of ['repeat','wrong','oversized','pending']as const){
    await page.route(`${origin}/**`,route=>{const url=new URL(route.request().url());if(url.pathname==='/refusal')return route.fulfill({contentType:'text/html',body:`<div class="school-workspace"><div id="sources"></div><input value="Current unsent draft"><button disabled>Create calendar event</button></div><script>const resources=['classes','subjects','terms','people','years','year-groups','attendance','timetable','calendar','report-periods'];Promise.all(resources.map(async resource=>{const value=await(await fetch('/v1/school/'+resource+'?limit=100')).json();if(value.nextCursor){document.querySelector('#sources').innerHTML='<button id="more" aria-label="Load more: People and access">Load more</button>';document.querySelector('#more').onclick=()=>fetch('/v1/school/${state==='wrong'?'unrelated':'people'}?limit=100&cursor=${id(126)}')}}));</script>`});const more=url.searchParams.has('cursor');return route.fulfill({contentType:'application/json',body:JSON.stringify({items:state==='oversized'&&more?Array.from({length:101},(_,i)=>({id:id(500+i)})):[],nextCursor:url.pathname==='/v1/school/people'&&(!more||state==='repeat')&&state!=='pending'?id(126):null})});});
    observeSchoolCurrentSources(page,origin);await page.goto(`${origin}/refusal`);await expect(completeObservedSchoolSources(page,'daily')).rejects.toThrow();await expect(page.locator('input')).toHaveValue('Current unsent draft');await page.unrouteAll({behavior:'ignoreErrors'});
  }
});

test('existing original-command lock prevents current directory continuation without replacing selection or draft',async({page})=>{
  const fixture=await mount(page,'people',{active:true});
  await page.locator('.school-access-directory').getByRole('button',{name:'Teacher assignments',exact:true}).click();
  await page.evaluate(()=>{const probe=(globalThis as unknown as {schoolProbe:{journal:{prepare:(slot:string,path:string,body:Record<string,unknown>)=>unknown}}}).schoolProbe;probe.journal.prepare('/v1/school/teacher-assignments','/v1/school/teacher-assignments',{reason:'Original bounded command'})});
  await expect(completeObservedSchoolSources(page,'people')).rejects.toThrow();
  await expect(page.locator('.school-access-directory__groups').getByRole('button',{name:'Teacher assignments',exact:true})).toHaveAttribute('aria-pressed','true');
  expect(fixture.reads.filter(path=>path.includes('/teacher-assignments'))).toHaveLength(1);expect(fixture.writes).toEqual([]);
});
