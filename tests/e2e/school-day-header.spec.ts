import { test, expect, type Page } from '@playwright/test';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '../..');
const id = (n: number) => `cd000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const dateLabel = { en: 'School date', ar: 'التاريخ المدرسي' };
const headingLabel = { en: 'My school day', ar: 'يومي المدرسي' };
async function mount(page: Page, locale: 'en' | 'ar', role: 'student' | 'teacher' | 'coordinator' | 'admin', width: number, enlarged = false) {
  await page.setViewportSize({ width, height: 900 });
  await page.clock.setFixedTime(new Date('2026-10-12T12:00:00Z'));
  const source = await build({ bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', stdin: { resolveDir: root, loader: 'tsx', contents: `
import React,{createContext,useContext}from'react';import{createRoot}from'react-dom/client';import{SchoolWorkspace}from'./apps/web/features/school/components/school-workspace';import{CommandJournal,LearningApiError}from'./apps/web/shared/api/client';import{FormDrafts}from'./apps/web/shared/session/form-drafts';import{getDictionary}from'./apps/web/shared/i18n/locale';import{commonEn,commonAr}from'./apps/web/shared/i18n/common';
const C=createContext(null);globalThis.dayHeaderC=C;globalThis.dayHeaderUC=useContext;
const journal=new CommandJournal(),drafts=new FormDrafts();
const f=globalThis.dayHeaderProbe={writes:0,paths:[],partial:false};
const school={school:{id:'${id(1)}',name:'Current school',countryCode:'QA',languages:['en','ar']},policy:{version:1,parentAttendanceVisible:false,parentUpcomingVisible:false,studentMessagingEnabled:false,recognitionEnabled:false,leaderboardEnabled:false,analyticsEnabled:false},intelligence:{fixtureSchoolApproved:false,liveSchoolApproved:false,availability:'SERVER_CONFIG_AND_APPROVED_POLICY_REQUIRED'}};
const rows={years:[{id:'${id(2)}',name:'2026–2027',selectionStatus:'READY'}],'year-groups':[{id:'${id(3)}',name:'Year1',selectionStatus:'READY'}],classes:[{id:'${id(4)}',name:'Cedar',academicYearId:'${id(2)}',yearGroupId:'${id(3)}',academicYearName:'2026–2027',yearGroupName:'Year1',status:'active',selectionStatus:'READY'}],timetable:[{id:'${id(20)}',dayOfWeek:1,effectiveFrom:'2026-10-01',effectiveTo:'2026-10-31',startsAt:'09:00',endsAt:'10:00',subjectName:'Monday current subject',className:'Cedar',teacherName:'Current teacher',location:'RoomA'},{id:'${id(21)}',dayOfWeek:2,effectiveFrom:'2026-10-01',effectiveTo:'2026-10-31',startsAt:'09:00',endsAt:'10:00',subjectName:'Tuesday current subject',className:'Cedar',teacherName:'Current teacher',location:'RoomA'}]};
globalThis.dayHeaderQuery=path=>{f.paths.push(path);const key=path?new URL(path,'https://fixture.invalid').pathname.split('/').at(-1):'';return{data:rows[key]??[],loaded:true,loading:false,loadingMore:false,error:null,moreError:null,nextCursor:f.partial&&key==='attendance'?'current-cursor':null,loadMore(){},context:path};};
globalThis.dayHeaderApi={data:school,t:'${locale}'==='ar'?commonAr:commonEn,request(){f.writes++;throw Error('No network writes');}};
globalThis.dayHeaderApp={locale:'${locale}',dictionary:getDictionary('${locale}'),membership:{schoolId:'${id(1)}',userId:'${id(10)}',role:'${role}',entitlements:['school.context','school.operations']},status:'ready',online:true,apiUrl:'https://fixture.invalid',accessToken:'synthetic',accessGeneration:1,commandJournal:journal,formDrafts:drafts,refreshAccess(){},reportDiagnostic(){},selectedChildId:null};
createRoot(document.getElementById('root')).render(<C.Provider value={globalThis.dayHeaderApp}><main className='workspace'><SchoolWorkspace/></main></C.Provider>);
` }, plugins: [{ name: 'current-source-only', setup(b) {
    b.onLoad({ filter: /shared[\\/]session[\\/]providers\.tsx$/ }, () => ({ loader: 'js', contents: 'export function useApp(){return globalThis.dayHeaderUC(globalThis.dayHeaderC)}' }));
    b.onLoad({ filter: /shared[\\/]hooks[\\/]use-api\.ts$/ }, () => ({ loader: 'js', contents: 'export function useApiQuery(path,parse){return{data:parse(globalThis.dayHeaderApi.data),loading:false,error:null}}export function useApi(){return globalThis.dayHeaderApi}' }));
    b.onLoad({ filter: /shared[\\/]hooks[\\/]use-paginated-query\.ts$/ }, () => ({ loader: 'js', contents: 'export function usePaginatedLearningQuery(path){return globalThis.dayHeaderQuery(path)}' }));
    b.onLoad({ filter: /shared[\\/]hooks[\\/]use-child-context\.ts$/ }, () => ({ loader: 'js', contents: 'export function useChildContext(){return{parent:false,child:null,children:[],query:{loaded:true,loading:false,error:null,moreError:null,nextCursor:null}}}' }));
    b.onLoad({ filter: /\.(webp|png|svg)$/ }, args => ({ loader: 'js', contents: 'export default ' + JSON.stringify({ src: 'data:image/' + (args.path.endsWith('.png') ? 'png' : args.path.endsWith('.svg') ? 'svg+xml' : 'webp') + ';base64,' + readFileSync(args.path).toString('base64'), width: 128, height: 128 }) }));
  } }] });
  const css = ['packages/ui/src/tokens.css', 'apps/web/app/globals.css', 'apps/web/features/school/styles.css'].map(path => readFileSync(resolve(root, path), 'utf8')).join('\n');
  await page.route('https://day-header.fixture.invalid/', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="${locale}" dir="${locale === 'ar' ? 'rtl' : 'ltr'}"><head><title>School daily header</title><style>${css} html{font-size:${enlarged ? '200%' : '100%'}}</style></head><body><div id="root"></div></body></html>` }));
  await page.goto('https://day-header.fixture.invalid/');
  await page.addScriptTag({ content: source.outputFiles[0].text });
  if (role === 'admin') await page.locator('[data-workspace-section="daily"]').click();
  await expect(page.locator('input[type="date"]').first()).toHaveValue('2026-10-12');
}
for (const locale of ['en', 'ar'] as const) for (const width of [1366, 320]) for (const enlarged of [false, true]) {
  test(`${locale}/${width}/${enlarged ? '200%' : 'normal'}: Student daily keeps one heading and reachable current date`, async ({ page }, testInfo) => {
    const messages: string[] = []; page.on('pageerror', error => messages.push(error.message)); page.on('console', message => { if (['warning', 'error'].includes(message.type())) messages.push(message.text()); });
    await mount(page, locale, 'student', width, enlarged);
    const header = page.locator('.school-day-current-header'), heading = page.getByRole('heading', { name: headingLabel[locale], exact: true }), date = page.getByLabel(dateLabel[locale], { exact: true });
    await expect(heading).toHaveCount(1); await expect(header).toBeVisible(); await expect(date).toBeVisible();
    expect((await date.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await date.getAttribute('aria-describedby')).toBeTruthy();
    if (width === 1366 && !enlarged) {
      const a = (await heading.boundingBox())!, b = (await date.boundingBox())!;
      expect(a.y).toBeLessThan(b.y + b.height); expect(a.y + a.height).toBeGreaterThan(b.y - 12);
      expect(locale === 'en' ? b.x > a.x + a.width : a.x > b.x + b.width).toBe(true);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await expect(page.getByRole('heading', { name: 'Monday current subject', exact: true })).toBeVisible();
    await date.fill('2026-10-13');
    await expect(date).toHaveValue('2026-10-13');
    await expect(page.getByRole('heading', { name: 'Tuesday current subject', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Monday current subject', exact: true })).toHaveCount(0);
    await date.focus(); await expect(date).toBeFocused(); await page.keyboard.press('Tab');
    expect(await page.evaluate(() => (globalThis as unknown as { dayHeaderProbe: { writes: number } }).dayHeaderProbe.writes)).toBe(0);
    expect(messages).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath('student-daily.png'), fullPage: true });
  });
}
for (const locale of ['en', 'ar'] as const) for (const role of ['teacher', 'coordinator', 'admin'] as const) for (const width of [1366, 320]) {
  test(`${locale}/${role}/${width}: staff Daily preserves labelled class/date controls and original-command lock`, async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await mount(page, locale, role, width);
    const date = page.locator('#staff-school-date'), classes = page.locator('#daily-class-filter');
    await expect(date).toBeVisible(); await expect(classes).toBeVisible();
    if (width === 1366) {
      const context = (await page.locator('.school-staff-current-header .cuevo-section-header__context').boundingBox())!, control = (await date.boundingBox())!;
      expect(context.y).toBeLessThan(control.y + control.height); expect(context.y + context.height).toBeGreaterThan(control.y - 12);
    }
    expect((await date.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await date.fill('2026-10-13'); await expect(date).toHaveValue('2026-10-13');
    const original = await page.evaluate(() => {
      const journal = (globalThis as unknown as { dayHeaderApp: { commandJournal: import('../../apps/web/shared/api/client').CommandJournal } }).dayHeaderApp.commandJournal;
      return journal.prepare('/v1/school/attendance', '/v1/school/attendance', { note: 'Original unresolved source command' });
    });
    await expect(date).toBeDisabled(); await expect(classes).toBeDisabled();
    expect(await page.evaluate(() => (globalThis as unknown as { dayHeaderApp: { commandJournal: import('../../apps/web/shared/api/client').CommandJournal } }).dayHeaderApp.commandJournal.get('/v1/school/attendance'))).toEqual(original);
    expect(await page.evaluate(() => (globalThis as unknown as { dayHeaderProbe: { writes: number } }).dayHeaderProbe.writes)).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true); expect(errors).toEqual([]);
  });
}

