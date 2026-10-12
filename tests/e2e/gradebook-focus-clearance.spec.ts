import { test, expect, type Page } from '@playwright/test';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const id = (n: number) => `d9000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
async function mount(page: Page, locale: 'en' | 'ar', width: number, columns = 2, sourceNames?: string[]) {
  const source = (await build({ stdin: { resolveDir: root, loader: 'tsx', contents: `
import React,{createContext,useContext,useState}from'react';import{createRoot}from'react-dom/client';import{ClassGradebook}from'./apps/web/features/academic/components/gradebook';import{CommandJournal}from'./apps/web/shared/api/client';import{FormDrafts}from'./apps/web/shared/session/form-drafts';import{getDictionary}from'./apps/web/shared/i18n/locale';
const C=createContext(null);globalThis.gradebookFocusC=C;globalThis.gradebookFocusUseContext=useContext;const id=n=>'d9000000-0000-4000-8000-'+String(n).padStart(12,'0'),locale='${locale}',ar=locale==='ar',journal=new CommandJournal(),drafts=new FormDrafts(),f=globalThis.gradebookFocus={calls:[],journal,drafts,denied:false};
const name=ar?'ليان بنت عبد الرحمن الأحمدي · صف الأرز، السنة السادسة':'Lina Mariam Al Ahmed · Cedar class, Year six',titles=ar?['شرح طريقة التحقق من خطوات الحل مع تقديم أسباب واضحة','تفسير الاختيارات ومراجعة النتيجة وفق مقياس المدرسة']:['Explain each method and check reasoning with clear evidence','Interpret choices and review the result against the school rubric'];
const numeric={type:'numeric',score:0,maxScore:10,policyVersion:2},rubric={type:'rubric',rubricId:id(9),rubricTitle:ar?'مقياس المدرسة لمراجعة خطوات الحل':'School rubric for checking solution steps',rubricVersion:'school-v1',policyVersion:2,normalized:null,criteria:[{criterionKey:'method',criterionTitle:ar?'توضيح سبب اختيار الطريقة ومراجعة كل خطوة':'Explain the chosen method and check each step',levelKey:'shown',levelLabel:ar?'شرح مدعوم بشواهد':'Explanation supported by evidence',levelDescription:ar?'يشرح الاختيارات ويبيّن طريقة التحقق من خطوات العمل.':'Explains the choices and shows how each step was checked.'}]};
const currentTitles=Array.from({length:${columns}},(_,i)=>titles[i%2]+' · '+(i+1));const page={courseId:id(1),courseTitle:ar?'الرياضيات: شرح طرق الحل ومراجعتها':'Mathematics: explaining and checking methods',className:ar?'صف الأرز':'Cedar',yearGroupName:ar?'السنة السادسة':'Year six',assessments:currentTitles.map((title,i)=>({id:id(30+i),title,model:i%2?'rubric':'numeric',referenceTitle:ar?'شواهد المراجعة المدرسية':'School review evidence',policyVersion:2})),items:[{id:id(50),learnerName:name,identityRequiresReview:false,cells:currentTitles.map((title,i)=>({assessmentId:id(30+i),state:'REVIEW',submissionId:id(100+i),submissionRevision:1,markingId:id(150+i),markingRevision:1,policyVersion:2,nativeResult:i%2?rubric:numeric,releasedResult:i===0?{id:id(200),evidenceId:id(250),revision:1,nativeResult:{...numeric,score:2},feedback:ar?"مراجعة سابقة للعمل الأصلي.":"Earlier review of the original work.",referenceTitle:ar?"شواهد المراجعة المدرسية":"School review evidence"}:null}))}],learnerTotal:1,assessmentTotal:${columns},nextLearnerCursor:null,nextAssessmentCursor:null};const names=${JSON.stringify(sourceNames ?? null)};if(names){const original=page.items[0];page.items=names.map((learnerName,learner)=>({...original,id:id(500+learner),learnerName,cells:original.cells.map((cell,index)=>({...cell,submissionId:id(1000+learner*10+index),markingId:id(2000+learner*10+index)}))}));page.learnerTotal=names.length;}f.page=page;
globalThis.fetch=async(raw,options)=>{const u=new URL(String(raw));f.calls.push({path:u.pathname+u.search,method:options?.method??'GET'});if(options?.method&&options.method!=='GET')throw Error('Provider effects blocked');if(u.pathname.endsWith('/gradebook'))return f.denied?Response.json({code:'FORBIDDEN'},{status:403}):Response.json(page);const rows=u.pathname==='/v1/courses'?[{id:id(1),classId:id(3),subjectId:id(5),title:page.courseTitle,description:'Current source',status:'PUBLISHED',createdAt:'2026-10-12T00:00:00Z'}]:u.pathname==='/v1/classes'?[{id:id(3),name:page.className,yearGroupName:page.yearGroupName,academicYearName:'2026–2027'}]:u.pathname==='/v1/subjects'?[{id:id(5),name:ar?'الرياضيات':'Mathematics'}]:null;if(!rows)throw Error('Unexpected read '+u.pathname);return Response.json({items:rows,nextCursor:null});};
function H(){const[generation,setGeneration]=useState(1);f.refresh=()=>setGeneration(x=>x+1);f.original=()=>{const path='/v1/courses/'+id(1)+'/gradebook/release';return journal.prepare(path,path,{selections:[{markingId:id(150),submissionId:id(100),expectedRevision:1,expectedSubmissionRevision:1,expectedPolicyVersion:2,parentVisible:false}],confirmRelease:true});};const app={locale,dictionary:getDictionary(locale),membership:{schoolId:id(20),userId:id(21),role:'teacher',entitlements:['learning','assessment','curriculum'],school:{name:'Illustrative current school'}},status:'ready',online:true,apiUrl:'https://gradebook-focus.fixture.invalid',accessToken:'synthetic',accessGeneration:generation,commandJournal:journal,formDrafts:drafts,announce(){},reportDiagnostic(){},refreshAccess(){}};return<C.Provider value={app}><main className='workspace' data-theme='dark' dir={ar?'rtl':'ltr'} lang={locale}><h1>{ar?'سجل درجات الصف':'Class gradebook'}</h1><ClassGradebook/><button id='outside'>Outside current table</button></main></C.Provider>}createRoot(document.getElementById('root')).render(<H/>);
` }, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', plugins: [{ name: 'current-session-and-reviewed-assets', setup(b) {
    b.onLoad({ filter: /shared[\\/]session[\\/]providers\.tsx$/ }, () => ({ loader: 'js', contents: 'export function useApp(){return globalThis.gradebookFocusUseContext(globalThis.gradebookFocusC)}' }));
    b.onLoad({ filter: /\.(webp|png|svg)$/ }, args => ({ loader: 'js', contents: 'export default ' + JSON.stringify({ src: 'data:image/webp;base64,' + readFileSync(args.path).toString('base64'), width: 128, height: 128 }) }));
  } }] })).outputFiles[0].text;
  const errors: string[] = [], warnings: string[] = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (['warning', 'error'].includes(m.type())) warnings.push(m.text()); });
  const css = ['packages/ui/src/tokens.css', 'apps/web/app/globals.css', 'apps/web/features/academic/styles.css', 'apps/web/features/academic/marking-navigation.css'].map(p => readFileSync(resolve(root, p), 'utf8')).join('\n');
  await page.setViewportSize({ width, height: 844 }); await page.setContent(`<!doctype html><html lang="${locale}" dir="${locale === 'ar' ? 'rtl' : 'ltr'}"><head><title>Current Gradebook</title><style>${css}</style></head><body><div id="root"></div></body></html>`);
  await page.addScriptTag({ content: "if(!crypto.randomUUID)crypto.randomUUID=()=> 'd9000000-0000-4000-8000-000000000999';" }); await page.addScriptTag({ content: source });
  await page.locator('#gradebook-course').selectOption(id(1)); await expect(page.locator('.gradebook-scroll')).toBeVisible();
  return { errors, warnings };
}
async function nativeFrame(page: Page) { await page.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done())))); }
async function focusedTarget(page: Page) {
  return page.evaluate(() => {
    const target = document.activeElement as HTMLElement, region = target.closest('.gradebook-scroll')!, sticky = target.closest('tr')!.querySelector('th[scope="row"]')!, rect = target.getBoundingClientRect(), frame = region.getBoundingClientRect(), header = sticky.getBoundingClientRect(), style = getComputedStyle(target), rtl = getComputedStyle(region).direction === 'rtl', focus = Math.max(0, parseFloat(style.outlineWidth) || 0) + Math.max(0, parseFloat(style.outlineOffset) || 0);
    return { kind: target.tagName, text: target.textContent, left: rect.left, right: rect.right, height: rect.height, clearLeft: rtl ? frame.left + 1 : header.right, clearRight: rtl ? header.left : frame.right - 1, focus, owned: [rect.left + 1, rect.left + rect.width / 2, rect.right - 1].map(x => target.contains(document.elementFromPoint(x, rect.top + rect.height / 2))), scrollTop: region.scrollTop, scrollLeft: region.scrollLeft };
  });
}
for (const { locale, width } of [{ locale: 'ar', width: 320 }, { locale: 'ar', width: 390 }, { locale: 'en', width: 683 }, { locale: 'en', width: 320 }, { locale: 'en', width: 1366 }] as const) test(`${locale}/${width}: native Tab exposes checkbox and action focus beside the sticky learner identity`, async ({ page }) => {
  const logs = await mount(page, locale, width); const region = page.locator('.gradebook-scroll'); await region.focus();
  const controls = await region.locator('input, button, summary').count();
  for (let i = 0; i < controls; i++) {
    await page.keyboard.press('Tab'); await nativeFrame(page); const target = await focusedTarget(page);
    expect(target.left - target.focus).toBeGreaterThanOrEqual(target.clearLeft - 1); expect(target.right + target.focus).toBeLessThanOrEqual(target.clearRight + 1); expect(target.owned).toEqual([true, true, true]); expect(target.scrollTop).toBe(0);
    if (target.kind === 'BUTTON' || target.kind === 'SUMMARY') expect(target.height).toBeGreaterThanOrEqual(44);
    if (width === 1366) expect(target.scrollLeft).toBe(0);
  }
  const calls = await page.evaluate(() => (globalThis as unknown as { gradebookFocus: { calls: { method: string }[] } }).gradebookFocus.calls); expect(calls.filter(c => c.method !== 'GET')).toEqual([]); expect(logs.errors).toEqual([]); expect(logs.warnings).toEqual([]);
});
test('current source refresh and original release preserve locks without moving outside focus or changing the original command', async ({ page }) => {
  await mount(page, 'ar', 320); await page.locator('.gradebook-scroll').focus(); await page.keyboard.press('Tab'); await nativeFrame(page); await expect(page.locator('.gradebook-table details > summary').first()).toBeFocused(); await page.keyboard.press('Space'); await expect(page.locator('.gradebook-table details').first()).toHaveAttribute('open', ''); await page.keyboard.press('Tab'); await nativeFrame(page); await expect(page.locator('.gradebook-selection input').first()).toBeFocused(); await page.keyboard.press('Space'); await expect(page.locator('.gradebook-selection input').first()).toBeChecked();
  const releasePath = `/v1/courses/${id(1)}/gradebook/release`;
  const original = await page.evaluate(() => (globalThis as unknown as { gradebookFocus: { original(): unknown } }).gradebookFocus.original()); await expect(page.locator('#gradebook-course')).toBeDisabled(); await expect(page.locator('.gradebook-selection input').first()).toBeDisabled(); await expect(page.locator('.gradebook-actions button').last()).toBeDisabled();
  await page.locator('#outside').focus(); const scroll = await page.evaluate(() => scrollY); await page.evaluate(() => { const f = (globalThis as unknown as { gradebookFocus: { denied: boolean; refresh(): void } }).gradebookFocus; f.denied = true; f.refresh(); });
  await expect(page.locator('.gradebook-scroll')).toHaveCount(0); await expect(page.locator('#outside')).toBeFocused(); expect(await page.evaluate(() => scrollY)).toBeLessThanOrEqual(scroll);
  expect(await page.evaluate(path => (globalThis as unknown as { gradebookFocus: { journal: { get(path: string): unknown } } }).gradebookFocus.journal.get(path), releasePath)).toEqual(original); expect(await page.locator('main').textContent()).not.toContain('ليان بنت');
});
test('leaving table focus before reveal and current-source refresh do not move the reading or replace focus', async ({ page }) => {
  await mount(page, 'en', 320); const region = page.locator('.gradebook-scroll'); await region.focus(); await page.keyboard.press('Tab'); await nativeFrame(page);
  const before = await region.evaluate(e => ({ left: e.scrollLeft, top: e.scrollTop }));
  await page.evaluate(() => { document.querySelector<HTMLButtonElement>('.gradebook-table button')!.focus({ preventScroll: true }); document.querySelector<HTMLButtonElement>('#outside')!.focus({ preventScroll: true }); });
  const readingBefore = await page.evaluate(() => scrollY); await nativeFrame(page); await expect(page.locator('#outside')).toBeFocused(); expect(await page.evaluate(() => scrollY)).toBe(readingBefore); expect(await region.evaluate(e => ({ left: e.scrollLeft, top: e.scrollTop }))).toEqual(before);
  await page.evaluate(() => (globalThis as unknown as { gradebookFocus: { refresh(): void } }).gradebookFocus.refresh()); await expect(region).toBeVisible(); await nativeFrame(page); await expect(page.locator('#outside')).toBeFocused();
});
for (const locale of ['en', 'ar'] as const) test(`${locale}/320: four populated columns retain native last-action focus and Shift-Tab checkbox clearance`, async ({ page }) => {
  await mount(page, locale, 320, 4); const region = page.locator('.gradebook-scroll'); await region.focus();
  const controls = await region.locator('input, button, summary').count();
  for (let i = 0; i < controls; i++) { await page.keyboard.press('Tab'); await nativeFrame(page); const target = await focusedTarget(page); expect(target.left - target.focus).toBeGreaterThanOrEqual(target.clearLeft - 1); expect(target.right + target.focus).toBeLessThanOrEqual(target.clearRight + 1); expect(target.owned).toEqual([true, true, true]); }
  await page.keyboard.press('Shift+Tab'); await nativeFrame(page); const checkbox = await focusedTarget(page); expect(checkbox.kind).toBe('INPUT'); expect(checkbox.owned).toEqual([true, true, true]);
  await region.focus(); await page.locator('.gradebook-table button').last().focus(); await nativeFrame(page); const direct = await focusedTarget(page); expect(direct.left - direct.focus).toBeGreaterThanOrEqual(direct.clearLeft - 1); expect(direct.right + direct.focus).toBeLessThanOrEqual(direct.clearRight + 1); expect(direct.owned).toEqual([true, true, true]);
});
test('an active native Arrow scroll cannot carry the newly focused action back under the sticky learner header', async ({ page }) => {
  await mount(page, 'ar', 320, 4); const region = page.locator('.gradebook-scroll'); await region.focus(); await page.keyboard.press('ArrowLeft');
  await page.locator('.gradebook-table button').last().focus();
  const frames = await page.evaluate(() => new Promise<{ right: number; stickyLeft: number; ring: number; top: number }[]>(done => {
    const samples: { right: number; stickyLeft: number; ring: number; top: number }[] = [];
    function sample() { const target = document.activeElement as HTMLElement, region = target.closest('.gradebook-scroll')!, rect = target.getBoundingClientRect(), sticky = target.closest('tr')!.querySelector('th[scope="row"]')!.getBoundingClientRect(), style = getComputedStyle(target); samples.push({ right: rect.right, stickyLeft: sticky.left, ring: (parseFloat(style.outlineWidth) || 0) + Math.max(0, parseFloat(style.outlineOffset) || 0), top: region.scrollTop }); if (samples.length === 5) done(samples); else requestAnimationFrame(sample); }
    requestAnimationFrame(sample);
  }));
  for (const frame of frames) { expect(frame.right + frame.ring).toBeLessThanOrEqual(frame.stickyLeft + 1); expect(frame.top).toBe(0); }
});
for (const locale of ['en', 'ar'] as const) test(`${locale}: only unmodified regional horizontal arrows use an instant step and preserve source and cell keys`, async ({ page }) => {
  await mount(page, locale, 320, 4); const region = page.locator('.gradebook-scroll'); await region.focus();
  const direction = locale === 'ar' ? 'ArrowLeft' : 'ArrowRight'; await page.keyboard.press(direction);
  expect(await region.evaluate(e => e.scrollLeft)).toBe(locale === 'ar' ? -40 : 40); expect(await region.evaluate(e => e.scrollTop)).toBe(0);
  const modified = await region.evaluate(e => { const event = new KeyboardEvent('keydown', { key: 'ArrowLeft', ctrlKey: true, bubbles: true, cancelable: true }); e.dispatchEvent(event); return event.defaultPrevented; }); expect(modified).toBe(false);
  const checkbox = page.locator('.gradebook-selection input').first(); await checkbox.focus(); await nativeFrame(page); const cellKey = await checkbox.evaluate(e => { const event = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }); e.dispatchEvent(event); return event.defaultPrevented; }); expect(cellKey).toBe(false); await expect(checkbox).not.toBeChecked();
  const calls = await page.evaluate(() => (globalThis as unknown as { gradebookFocus: { calls: { method: string }[] } }).gradebookFocus.calls); expect(calls.filter(call => call.method !== 'GET')).toEqual([]);
});

test('a long current learner name leaves a fully visible native work action and fresh wide focus restores its natural width', async ({ page }) => {
  const names = ['Lina Mariam Al Ahmed · Cedar class, Year six', 'Sara Khalid Al Otaibi · Cedar class, Year six', 'Nour Ahmed Al Zahrani · Cedar class, Year six', 'Mariam Abdullah Saleh Al Harbi', 'Reem Mohammed Abdulaziz Al Salem', 'Jana Saeed Abdulrahman Mansour', 'Haya Yousef Ibrahim Al Kindi', 'Dana Khalid Nasser Al Omran', 'Rana Abdulaziz Mohammed Al Mousa', 'Shatha Hassan Ali Al Ruwaili', 'Amal Khalid Abdullah · Cedar class, Year six', 'Amal Khalid Abdullah · Cedar class, Year six', 'Joud Mohammed Abdulrahman Al Dosari', 'Lama Ibrahim Saad Al Zahrani', 'Razan Fahad Suleiman Al Ali', 'Mai Abdullah Nasser Al Hassan', 'Tala Khalid Yousef Al Ahmed', 'Arwa Mohammed Saleh Al Otaibi', 'Salma Hassan Abdulrahman Al Qahtani', 'Nouf Ahmed Saad Al Mousa', 'Shahad Yousef Abdullah Al Harbi', 'Anoud Khalid Ibrahim Al Salem', 'Doha Abdulaziz Mohammed Mansour', 'Alia Fahad Abdullah Al Zahrani', 'Noura Abdulrahman Saleh Al Kandari · Cedar class, Year six'];
  const logs = await mount(page, 'en', 320, 10, names);
  await expect(page.locator('.gradebook-table tbody tr')).toHaveCount(25);
  await expect(page.locator('.gradebook-table tbody td')).toHaveCount(250);
  const action = page.locator('.gradebook-cell-actions button').nth(4);
  await action.focus(); await nativeFrame(page);
  const narrow = await focusedTarget(page);
  expect(narrow.left - narrow.focus).toBeGreaterThanOrEqual(narrow.clearLeft - 1);
  expect(narrow.right + narrow.focus).toBeLessThanOrEqual(narrow.clearRight + 1);
  expect(narrow.owned).toEqual([true, true, true]); expect(narrow.height).toBeGreaterThanOrEqual(44);
  await expect(action).toHaveText('Open learner work');
  await page.setViewportSize({ width: 1366, height: 844 }); await page.locator('#outside').focus(); await action.focus(); await nativeFrame(page);
  expect(await action.evaluate(e => e.style.maxInlineSize)).toBe('');
  const wide = await focusedTarget(page); expect(wide.owned).toEqual([true, true, true]);
  expect(logs.errors).toEqual([]); expect(logs.warnings).toEqual([]);
});
