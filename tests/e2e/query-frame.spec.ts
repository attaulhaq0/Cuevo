import { expect, test } from '@playwright/test';
import { build } from 'esbuild';
import { resolve } from 'node:path';

// Actual shared hooks and React commits; transport/session inputs are fictional.
// All URLs are intercepted and no real Auth/API/database call is performed.
let bundle = '';
type Snapshot = { frame: string; single: string | null; singleError: string | null; page: string[]; pageError: string | null; cursor: string | null; loaded: boolean; loading: boolean; command: string };
type Probe = { frameFacts(): { snapshots: Snapshot[]; clearReads: unknown[]; cleared: number; revalidated: number; diagnostics: unknown[]; admissionSettled: number; requests: { index: number; path: string; aborted: boolean }[] }; rotateFrame(kind: string): void; resolveRead(index: number, name: string, status?: number): void };
declare global { interface Window { frameFacts: Probe['frameFacts']; rotateFrame: Probe['rotateFrame']; resolveRead: Probe['resolveRead'] } }
test.beforeAll(async () => {
  const built = await build({ write: false, bundle: true, format: 'iife', platform: 'browser', jsx: 'automatic', stdin: { resolveDir: resolve(import.meta.dirname, '../..'), loader: 'tsx', contents: `
import React,{createContext,useContext,useEffect,useLayoutEffect,useRef,useState}from'react';import{createRoot}from'react-dom/client';
import{useApi,useApiQuery}from'./apps/web/shared/hooks/use-api';import{usePaginatedLearningQuery}from'./apps/web/shared/hooks/use-paginated-query';import{queryReadFrame}from'./apps/web/shared/hooks/query-frame';
import{CommandJournal}from'./apps/web/shared/api/client';import{FormDrafts}from'./apps/web/shared/session/form-drafts';
const Context=createContext(null);globalThis.frameContext=Context;globalThis.frameUseContext=useContext;
const requests=[],snapshots=[],clearReads=[],diagnostics=[];let cleared=0,revalidated=0,admissionSettled=0;globalThis.fetch=(input,init)=>new Promise(resolve=>requests.push({path:String(input),signal:init?.signal,resolve}));
const parse=value=>value;function Reads(){const app=useContext(Context),single=useApiQuery(app.path,parse,app.refresh),page=usePaginatedLearningQuery(app.pagePath,parse,app.refresh);
useLayoutEffect(()=>{snapshots.push({frame:app.frame,single:single.data?.name??null,singleError:single.error?.kind??null,page:page.data.map(row=>row.name),pageError:page.moreError?.kind??null,cursor:page.nextCursor,loaded:page.loaded,loading:page.loading,command:app.commandJournal.get('/v1/original')?.key});});
return <><input aria-label="Unsent original work" defaultValue="Original input"/><p data-single>{single.data?.name}</p><p data-page>{page.data.map(row=>row.name).join(',')}</p><button data-more disabled={!page.loaded||page.loading} onClick={page.loadMore}>Continue current source</button></>;}
// Keep this request live through a source change to test admission independently of passive cancellation.
function AdmissionRead(){const app=useContext(Context),{request}=useApi(),frame=queryReadFrame(app,app.path,app.refresh),current=useRef(frame);current.current=frame;
useEffect(()=>{const controller=new AbortController();void request(app.path,{signal:controller.signal,isCurrentRead:()=>current.current===frame}).then(()=>{admissionSettled++;},()=>{admissionSettled++;});return()=>controller.abort();},[]);
useLayoutEffect(()=>{snapshots.push({frame:app.frame,single:null,singleError:null,page:[],pageError:null,cursor:null,loaded:false,loading:false,command:app.commandJournal.get('/v1/original')?.key});});return <input aria-label="Unsent original work" defaultValue="Original input"/>;}
function Fixture(){const[journal]=useState(()=>{const value=new CommandJournal();value.prepare('/v1/original','/v1/original',{source:'original'});return value;}),[drafts]=useState(()=>{const value=new FormDrafts();const original=value.clearRead.bind(value);value.clearRead=(...args)=>{clearReads.push(args);return original(...args);};value.clear=()=>{cleared++;};return value;});
const[app,setApp]=useState({frame:'original',apiUrl:'https://fixture.invalid',accessToken:'token-one',membership:{userId:'actor',schoolId:'school',role:'student'},accessGeneration:1,status:'ready',online:true,locale:'en',path:'/v1/current',pagePath:'/v1/items?limit=25',refresh:0,commandJournal:journal,formDrafts:drafts,refreshAccess(){revalidated++;},reportDiagnostic(value){diagnostics.push(value);}});
globalThis.rotateFrame=kind=>setApp(value=>({...value,frame:kind,...(kind==='token'?{accessToken:'token-two'}:kind==='api'?{apiUrl:'https://other.invalid'}:kind==='role'?{membership:{...value.membership,role:'teacher'}}:kind==='actor'?{membership:{...value.membership,userId:'other'}}:kind==='school'?{membership:{...value.membership,schoolId:'other'}}:kind==='generation'?{accessGeneration:2}:kind==='offline'?{online:false}:kind==='status'?{status:'verifying'}:kind==='path'?{path:null,pagePath:null}:kind==='refresh'?{refresh:1}:kind==='callback'?{refreshAccess(){revalidated++;},reportDiagnostic(value){diagnostics.push(value);}}:{locale:'ar'} )}));
return <Context.Provider value={app}>{document.getElementById('root').dataset.admission?<AdmissionRead/>:<Reads/>}</Context.Provider>;}
globalThis.frameFacts=()=>({snapshots,clearReads,cleared,revalidated,diagnostics,admissionSettled,requests:requests.map((row,index)=>({index,path:row.path,aborted:!!row.signal?.aborted}))});
globalThis.resolveRead=(index,name,status=200)=>{const row=requests[index];row.resolve(new Response(JSON.stringify(status===200?(row.path.includes('/items?')?{items:[{id:name,name}],nextCursor:row.path.includes('cursor=')?null:'c2000000-0000-4000-8000-000000000001'}:{id:name,name}):{code:'REQUEST_UNAVAILABLE'}),{status,headers:{'Content-Type':'application/json'}}));};
createRoot(document.getElementById('root')).render(<Fixture/>);` }, plugins: [{ name: 'current-session-fixture', setup(api) { api.onLoad({ filter: /shared[\\/]session[\\/]providers\.tsx$/ }, () => ({ loader: 'js', contents: 'export function useApp(){return globalThis.frameUseContext(globalThis.frameContext)}' })); } }] });
  bundle = built.outputFiles[0].text;
});

test('private query first render rejects old authority frames without remounting original input or commands', async ({ page }) => {
  for (const changed of ['token', 'api', 'actor', 'school', 'role', 'generation', 'refresh', 'offline', 'status', 'path']) {
    await page.route('**/*', route => route.request().url() === 'http://localhost/query-frame' ? route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }) : route.abort());
    await page.goto('http://localhost/query-frame'); await page.addScriptTag({ content: bundle });
    await page.waitForFunction(() => window.frameFacts().requests.length === 2);
    await page.evaluate(() => { window.resolveRead(0, 'Old private single'); window.resolveRead(1, 'Old private page'); });
    await expect(page.locator('[data-page]')).toHaveText('Old private page');
    await page.getByLabel('Unsent original work').fill('Preserved unsent input');
    const originalKey = await page.evaluate(() => window.frameFacts().snapshots.at(-1)!.command);
    await page.evaluate(kind => window.rotateFrame(kind), changed);
    await page.waitForFunction(kind => window.frameFacts().snapshots.some(row => row.frame === kind), changed);
    const first = await page.evaluate(kind => window.frameFacts().snapshots.find(row => row.frame === kind)!, changed);
    expect(first.single, `${changed}: first render has no preceding single source`).toBeNull();
    expect(first.page, `${changed}: first render has no preceding private page`).toEqual([]); expect(first.cursor).toBeNull(); expect(first.loaded).toBe(false);
    expect(first.command).toBe(originalKey); await expect(page.getByLabel('Unsent original work')).toHaveValue('Preserved unsent input');
    await expect(page.locator('[data-more]')).toBeDisabled();
    if (!['offline', 'status', 'path'].includes(changed)) await page.waitForFunction(() => window.frameFacts().requests.length === 4);
    await page.unrouteAll();
  }
});

test('late aborted query responses cannot resurrect prior facts or clear the current frame and stable rerender does not refetch', async ({ page }) => {
  await page.route('**/*', route => route.request().url() === 'http://localhost/query-frame' ? route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }) : route.abort());
  await page.goto('http://localhost/query-frame'); await page.addScriptTag({ content: bundle });
  await page.waitForFunction(() => window.frameFacts().requests.length === 2);
  await page.evaluate(() => window.rotateFrame('token'));
  await page.waitForFunction(() => window.frameFacts().requests.length === 4);
  await page.evaluate(() => { window.resolveRead(0, 'Late old source'); window.resolveRead(1, 'Late old error', 503); window.resolveRead(2, 'Current source'); window.resolveRead(3, 'Current page'); });
  await expect(page.locator('[data-single]')).toHaveText('Current source'); await expect(page.locator('[data-page]')).toHaveText('Current page');
  expect(await page.evaluate(() => window.frameFacts().clearReads)).toEqual([]);
  expect(await page.evaluate(() => window.frameFacts().requests.slice(0, 2).every(row => row.aborted))).toBe(true);
  await page.evaluate(() => window.rotateFrame('locale'));
  await page.waitForFunction(() => window.frameFacts().snapshots.some(row => row.frame === 'locale'));
  expect(await page.evaluate(() => window.frameFacts().requests.length)).toBe(4);
  await expect(page.locator('[data-page]')).toHaveText('Current page');
  await page.evaluate(() => window.rotateFrame('callback'));
  await page.waitForFunction(() => window.frameFacts().snapshots.some(row => row.frame === 'callback'));
  expect(await page.evaluate(() => window.frameFacts().requests.length)).toBe(4);
});

test('current continuation failure preserves its admitted page and old continuation cannot attach to a new token', async ({ page }) => {
  await page.route('**/*', route => route.request().url() === 'http://localhost/query-frame' ? route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }) : route.abort());
  await page.goto('http://localhost/query-frame'); await page.addScriptTag({ content: bundle });
  await page.waitForFunction(() => window.frameFacts().requests.length === 2);
  await page.evaluate(() => { window.resolveRead(0, 'Admitted single'); window.resolveRead(1, 'Admitted page'); });
  await expect(page.locator('[data-page]')).toHaveText('Admitted page'); await page.locator('[data-more]').click();
  await page.waitForFunction(() => window.frameFacts().requests.length === 3);
  await page.evaluate(() => window.resolveRead(2, 'Unavailable page', 503));
  await page.waitForFunction(() => window.frameFacts().snapshots.at(-1)?.pageError === 'unavailable');
  await expect(page.locator('[data-page]')).toHaveText('Admitted page'); expect(await page.evaluate(() => window.frameFacts().clearReads)).toEqual([]);
  await page.locator('[data-more]').click(); await page.waitForFunction(() => window.frameFacts().requests.length === 4);
  await page.evaluate(() => window.rotateFrame('token')); await page.waitForFunction(() => window.frameFacts().requests.length === 6);
  await page.evaluate(() => { window.resolveRead(3, 'Late continuation'); window.resolveRead(4, 'New single'); window.resolveRead(5, 'New page'); });
  await expect(page.locator('[data-page]')).toHaveText('New page'); expect(await page.evaluate(() => window.frameFacts().requests[3].aborted)).toBe(true);
  expect(await page.evaluate(() => window.frameFacts().snapshots.at(-1)?.pageError)).toBeNull();
});

test('obsolete unauthorized reads cannot clear drafts, revalidate access or report errors for a changed frame', async ({ page }) => {
  for (const changed of ['token', 'api', 'role', 'offline', 'status', 'refresh', 'path']) {
    await page.route('**/*', route => route.request().url() === 'http://localhost/query-frame' ? route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }) : route.abort());
    await page.goto('http://localhost/query-frame'); await page.addScriptTag({ content: bundle });
    await page.waitForFunction(() => window.frameFacts().requests.length === 2);
    await page.evaluate(kind => window.rotateFrame(kind), changed);
    await page.waitForFunction(kind => window.frameFacts().snapshots.some(row => row.frame === kind), changed);
    await page.evaluate(() => { window.resolveRead(0, 'Old unauthorized', 401); window.resolveRead(1, 'Old denied', 403); });
    await expect(page.locator('[data-single]')).toBeEmpty(); await expect(page.locator('[data-page]')).toBeEmpty();
    const facts = await page.evaluate(() => window.frameFacts());
    expect(facts.cleared, `${changed}: obsolete refusal cannot clear current drafts; requests ${JSON.stringify(facts.requests)}`).toBe(0); expect(facts.revalidated, `${changed}: obsolete refusal cannot revalidate current access`).toBe(0); expect(facts.clearReads).toEqual([]); expect(facts.diagnostics).toEqual([]);
    await page.unrouteAll();
  }
});

test('a current unaborted unauthorized read retains its access recovery and draft-clearing behavior', async ({ page }) => {
  await page.route('**/*', route => route.request().url() === 'http://localhost/query-frame' ? route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }) : route.abort());
  await page.goto('http://localhost/query-frame'); await page.addScriptTag({ content: bundle });
  await page.waitForFunction(() => window.frameFacts().requests.length === 2);
  await page.evaluate(() => { window.resolveRead(0, 'Current unauthorized', 401); window.resolveRead(1, 'Current denied', 403); });
  await page.waitForFunction(() => window.frameFacts().revalidated === 1);
  const facts = await page.evaluate(() => window.frameFacts());
  expect(facts.cleared).toBe(2); expect(facts.revalidated).toBe(1); expect(facts.clearReads).toHaveLength(2);
});

test('obsolete source refusals are rejected by current admission while their request signal remains live', async ({ page }) => {
  for (const changed of ['refresh', 'path']) for (const status of [401, 403]) {
    await page.route('**/*', route => route.request().url() === 'http://localhost/query-frame' ? route.fulfill({ contentType: 'text/html', body: '<div id="root" data-admission="true"></div>' }) : route.abort());
    await page.goto('http://localhost/query-frame'); await page.addScriptTag({ content: bundle });
    await page.waitForFunction(() => window.frameFacts().requests.length === 1);
    await page.getByLabel('Unsent original work').fill('Preserved unsent input');
    const key = await page.evaluate(() => window.frameFacts().snapshots.at(-1)!.command);
    await page.evaluate(kind => window.rotateFrame(kind), changed);
    await page.waitForFunction(kind => window.frameFacts().snapshots.some(row => row.frame === kind), changed);
    await page.evaluate(code => window.resolveRead(0, 'Obsolete refusal', code), status);
    await page.waitForFunction(() => window.frameFacts().admissionSettled === 1);
    const facts = await page.evaluate(() => window.frameFacts());
    expect(facts.requests[0].aborted, `${changed}/${status}: admission is tested before cancellation`).toBe(false);
    expect(facts.cleared).toBe(0); expect(facts.revalidated).toBe(0); expect(facts.diagnostics).toEqual([]); expect(facts.clearReads).toEqual([]);
    expect(facts.snapshots.at(-1)!.command).toBe(key); await expect(page.getByLabel('Unsent original work')).toHaveValue('Preserved unsent input');
    await page.unrouteAll();
  }
});

test('an obsolete same-authority continuation refusal leaves only the refreshed page admitted', async ({ page }) => {
  for (const changed of ['refresh', 'path']) for (const status of [401, 403]) {
    await page.route('**/*', route => route.request().url() === 'http://localhost/query-frame' ? route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }) : route.abort());
    await page.goto('http://localhost/query-frame'); await page.addScriptTag({ content: bundle });
    await page.waitForFunction(() => window.frameFacts().requests.length === 2);
    await page.evaluate(() => { window.resolveRead(0, 'Admitted single'); window.resolveRead(1, 'Admitted page'); });
    await expect(page.locator('[data-page]')).toHaveText('Admitted page'); await page.locator('[data-more]').click();
    await page.waitForFunction(() => window.frameFacts().requests.length === 3);
    await page.evaluate(kind => window.rotateFrame(kind), changed);
    await page.waitForFunction(kind => window.frameFacts().snapshots.some(row => row.frame === kind), changed);
    await page.evaluate(code => window.resolveRead(2, 'Old continuation refusal', code), status);
    await expect(page.locator('[data-page]')).toBeEmpty();
    const facts = await page.evaluate(() => window.frameFacts());
    const first = facts.snapshots.find(row => row.frame === changed)!;
    expect(first.page).toEqual([]); expect(first.cursor).toBeNull(); expect(first.loaded).toBe(false);
    expect(facts.cleared).toBe(0); expect(facts.revalidated).toBe(0); expect(facts.clearReads).toEqual([]);
    expect(facts.diagnostics.filter(value => (value as { status: string }).status !== 'success')).toEqual([]);
    if (changed === 'refresh') {
      await page.waitForFunction(() => window.frameFacts().requests.length === 5);
      await page.evaluate(() => { window.resolveRead(3, 'Refreshed single'); window.resolveRead(4, 'Refreshed page'); });
      await expect(page.locator('[data-page]')).toHaveText('Refreshed page');
      await page.locator('[data-more]').click(); await page.waitForFunction(() => window.frameFacts().requests.length === 6);
      await page.evaluate(() => window.resolveRead(5, 'Current continuation'));
      await expect(page.locator('[data-page]')).toHaveText('Refreshed page,Current continuation');
      expect(await page.evaluate(() => window.frameFacts().snapshots.at(-1)!.pageError)).toBeNull();
    }
    await page.unrouteAll();
  }
});
