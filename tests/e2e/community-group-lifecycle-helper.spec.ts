import { test, expect, type Page } from '@playwright/test';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { observeCommunityGroupLifecycle } from './community-group-lifecycle';

const root = resolve(import.meta.dirname, '../..');
const origin = 'http://localhost:4000';
const id = (value: number) => `ef000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const room = { id: id(3), classId: id(4), ownerId: id(2), name: 'Current reviewed checking group', type: 'GROUP', status: 'ACTIVE', revision: 1, canModerate: true, canPost: true, privateTopic: `cuevo:${id(1)}:room:${id(3)}` };
type Scenario = 'stable' | 'interrupt-once' | 'interrupt-always' | 'changed-name' | 'changed-revision' | 'wrong-authority' | 'denied' | 'missing' | 'invalid' | 'wrong-actor' | 'domain-post';

async function mount(page: Page, scenario: Scenario) {
  const observer = observeCommunityGroupLifecycle(page, room.id);
  let roomReads = 0;
  const writes: string[] = [], errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const bundle = await build({ stdin: { resolveDir: root, loader: 'tsx', contents: `
import React,{createContext,useContext,useState,useEffect}from'react';import{createRoot}from'react-dom/client';import{RoomDiscussion}from'./apps/web/features/community/components/room-discussion';import{CommandJournal}from'./apps/web/shared/api/client';import{FormDrafts}from'./apps/web/shared/session/form-drafts';import{getDictionary}from'./apps/web/shared/i18n/locale';
const C=createContext(null);globalThis.lifecycleHelperC=C;globalThis.lifecycleHelperUC=useContext;const probe=globalThis.lifecycleHelperProbe={clicks:0,refreshes:0},journal=new CommandJournal(),formDrafts=new FormDrafts();
function Harness(){const[generation,setGeneration]=useState(1);probe.refresh=()=>{probe.refreshes++;setGeneration(value=>value+1)};useEffect(()=>{void fetch('${origin}/v1/me',{headers:{Authorization:'Bearer controlled-current-token','X-School-Id':'${id(1)}','X-Lifecycle-Generation':String(generation)}})},[generation]);const app={locale:'en',dictionary:getDictionary('en'),membership:{schoolId:'${id(1)}',userId:'${id(2)}',role:'teacher',entitlements:['community']},status:'ready',online:true,apiUrl:'${origin}',accessToken:'controlled-current-token',accessGeneration:generation,commandJournal:journal,formDrafts,announce(){},reportDiagnostic(){},refreshAccess(){probe.refresh()},publicConfig:{supabaseUrl:'https://controlled.invalid',apiUrl:'${origin}',supabasePublishableKey:'sb_publishable_controlled000000000'}};return<C.Provider value={app}><main><RoomDiscussion room={${JSON.stringify(room)}} onBack={()=>{}}/></main></C.Provider>}createRoot(document.getElementById('root')).render(<Harness/>);` }, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', plugins: [{ name: 'session-and-private-transport-only', setup(builder) {
    builder.onLoad({ filter: /shared[\\/]session[\\/]providers\.tsx$/ }, () => ({ loader: 'js', contents: 'export function useApp(){return globalThis.lifecycleHelperUC(globalThis.lifecycleHelperC)}' }));
    builder.onLoad({ filter: /shared[\\/]realtime[\\/]use-private-channel\.ts$/ }, () => ({ loader: 'js', contents: 'export function usePrivateChannel(){return "unavailable"}' }));
    builder.onLoad({ filter: /\.(webp|png|svg)$/ }, args => ({ loader: 'js', contents: 'export default ' + JSON.stringify({ src: 'data:image/webp;base64,' + readFileSync(args.path).toString('base64'), width: 128, height: 128 }) }));
  } }] });
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname === '/lifecycle-probe') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body><div id="root"></div></body></html>' });
    if (request.method() !== 'GET') { writes.push(url.pathname); return route.fulfill({ status: 409, json: { code: 'NO_DOMAIN_WRITE_ALLOWED' } }); }
    if (url.pathname === '/v1/me') return route.fulfill({ json: { schoolId: id(1), userId: scenario === 'wrong-actor' && request.headers()['x-lifecycle-generation'] !== '1' ? id(9) : id(2), membershipId: id(5), role: 'teacher', entitlements: ['community'], displayName: 'Current teacher', school: { id: id(1), name: 'Current reference school' } } });
    if (url.pathname === '/v1/community/rooms') {
      roomReads++;
      if (roomReads > 1 && scenario === 'denied') return route.fulfill({ status: 403, json: { code: 'FORBIDDEN' } });
      const current = { ...room, ...(roomReads > 1 && scenario === 'changed-name' ? { name: 'Different reviewed group' } : {}), ...(roomReads > 1 && scenario === 'changed-revision' ? { revision: 2 } : {}), ...(roomReads > 1 && scenario === 'wrong-authority' ? { canModerate: false } : {}) };
      return route.fulfill({ json: roomReads > 1 && scenario === 'invalid' ? { items: [{ id: room.id }], nextCursor: null } : { items: roomReads > 1 && scenario === 'missing' ? [] : [current], nextCursor: null } });
    }
    return route.fulfill({ json: { items: [], nextCursor: null } });
  });
  await page.goto(origin + '/lifecycle-probe');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await expect(page.getByRole('button', { name: 'Review group lifecycle', exact: true })).toBeEnabled();
  if (scenario !== 'stable') await page.evaluate(value => {
    document.addEventListener('pointerdown', event => {
      if (!(event.target as Element).closest('.community-group-lifecycle button')) return;
      const probe = (globalThis as unknown as { lifecycleHelperProbe: { clicks: number; refresh: () => void } }).lifecycleHelperProbe;
      probe.clicks++;
      if (value === 'domain-post') { queueMicrotask(() => { void fetch('http://localhost:4000/v1/community/announcements', { method: 'POST', body: '{}' }); probe.refresh(); }); return; }
      if (value === 'interrupt-always' || probe.clicks === 1) queueMicrotask(() => probe.refresh());
    }, true);
  }, scenario);
  return { observer, writes, errors, reads: () => roomReads };
}

test('a canceled default pointer click does not open, while exact current-source helper opens untouched review without a POST', async ({ page }) => {
  const controlled = await mount(page, 'interrupt-once');
  await page.getByRole('button', { name: 'Review group lifecycle', exact: true }).click();
  await expect.poll(controlled.reads).toBe(2);
  await expect(page.getByRole('region', { name: 'Review group lifecycle', exact: true })).toHaveCount(0);
  const form = await controlled.observer.open();
  await expect(form.getByLabel('Group name', { exact: true })).toHaveValue(room.name);
  await expect(form.getByLabel('Group state', { exact: true })).toHaveValue('ACTIVE');
  await expect(form.getByLabel('Reason', { exact: true })).toHaveValue('');
  await expect(form.getByLabel('I approve this group lifecycle change', { exact: true })).not.toBeChecked();
  expect(controlled.writes).toEqual([]); expect(controlled.errors).toEqual([]);
});
test('exact-source opener survives one read-only interruption initiated by its own first click', async ({ page }) => {
  const controlled = await mount(page, 'interrupt-once');
  const form = await controlled.observer.open();
  await expect(form.getByLabel('Group name', { exact: true })).toHaveValue(room.name);
  expect(controlled.reads()).toBe(2); expect(controlled.writes).toEqual([]); expect(controlled.errors).toEqual([]);
});
for (const scenario of ['changed-name', 'changed-revision', 'wrong-authority', 'wrong-actor', 'denied', 'missing', 'invalid'] as const) test(`current ${scenario} source refuses reopening and cannot submit old consent`, async ({ page }) => {
  const controlled = await mount(page, scenario);
  await expect(controlled.observer.open()).rejects.toThrow();
  expect(controlled.writes).toEqual([]);
});
test('three repeated source interruptions remain bounded and do not send any domain POST', async ({ page }) => {
  const controlled = await mount(page, 'interrupt-always');
  await expect(controlled.observer.open()).rejects.toThrow();
  expect(await page.evaluate(() => (globalThis as unknown as { lifecycleHelperProbe: { clicks: number } }).lifecycleHelperProbe.clicks)).toBeLessThanOrEqual(3);
  expect(controlled.writes).toEqual([]);
});
test('any observed domain POST invalidates this read-only opener instead of interpreting a response as admission', async ({ page }) => {
  const controlled = await mount(page, 'domain-post');
  await expect(controlled.observer.open()).rejects.toThrow();
  expect(controlled.writes).toEqual(['/v1/community/announcements']);
});
for (const newer of ['denied', 'changed-name'] as const) test(`an older room response body cannot restore current source admission after newer ${newer}`, async ({ page }) => {
  let releaseOld: (() => void) | undefined, oldFinished: Promise<void> | undefined, delayed = false;
  // Delay only the observer's actual Response.json completion. Browser fetch
  // still receives this real routed body and the application renders normally.
  page.on('response', response => {
    if (new URL(response.url()).pathname !== '/v1/community/rooms' || delayed) return;
    delayed = true;
    const read = response.json.bind(response), ready = new Promise<void>(done => { releaseOld = done; });
    response.json = async () => { const body = await read(); await ready; return body; };
    oldFinished = ready;
  });
  const controlled = await mount(page, newer);
  await expect.poll(() => typeof releaseOld).toBe('function');
  await page.evaluate(() => (globalThis as unknown as { lifecycleHelperProbe: { refresh: () => void } }).lifecycleHelperProbe.refresh());
  await expect.poll(controlled.reads).toBe(2);
  if (newer === 'denied') await expect(page.locator('[role="alert"]')).toBeVisible();
  else await expect(page.getByRole('heading', { name: 'Different reviewed group', exact: true })).toBeVisible();
  releaseOld!();
  await oldFinished;
  if (newer === 'denied') await expect(controlled.observer.open()).rejects.toThrow();
  else {
    const form = await controlled.observer.open();
    await expect(form.getByLabel('Group name', { exact: true })).toHaveValue('Different reviewed group');
    await expect(form.getByLabel('Reason', { exact: true })).toHaveValue('');
    await expect(form.getByLabel('I approve this group lifecycle change', { exact: true })).not.toBeChecked();
  }
  expect(controlled.writes).toEqual([]);
});
