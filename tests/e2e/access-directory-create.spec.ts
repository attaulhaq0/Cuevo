import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { test } from '@playwright/test';

const root = resolve(import.meta.dirname, '../..');
async function browserSource(previousPlacement = false) {
  const result = await build({ stdin: { resolveDir: root, sourcefile: 'access-directory-create-harness.tsx', loader: 'tsx', contents: `
    import React,{useState} from 'react';import{createRoot}from'react-dom/client';
    import{SchoolAccess}from'./apps/web/features/school/components/access.tsx';
    import{CommandJournal}from'./apps/web/shared/api/client';import{FormDrafts}from'./apps/web/shared/session/form-drafts';
    import{getDictionary}from'./apps/web/shared/i18n/locale';
    const journal=new CommandJournal(),drafts=new FormDrafts();globalThis.accessCreateRequests=[];if(!crypto.randomUUID)Object.defineProperty(crypto,'randomUUID',{value:()=> '10000000-0000-4000-8000-000000000001'});
    const school='school',actor='actor',base={status:'active',effectiveFrom:'2026-10-01T00:00:00Z',effectiveTo:null,synthetic:true,revision:1,selectionContext:{status:'READY',enrollmentState:'NONE',classes:[]}};
    const people=[{...base,id:'learner',displayName:'Lina',role:'student'},{...base,id:'teacher',displayName:'Samira',role:'teacher'},{...base,id:'parent',displayName:'Mariam',role:'parent'}];
    function Harness(){const[locale,setLocale]=useState('en'),[complete,setComplete]=useState(true),[manage,setManage]=useState(true),[pending,setPending]=useState(false);
      globalThis.accessCreateApp={locale,setLocale,dictionary:getDictionary(locale),membership:{schoolId:school,userId:actor,role:'admin'},formDrafts:drafts,commandJournal:journal,online:true,status:'ready',apiUrl:'',accessToken:'synthetic',accessGeneration:1,announce(){}};
      return <div className='workspace'><button id='locale' onClick={()=>setLocale(x=>x==='en'?'ar':'en')}>Language</button><button id='complete' onClick={()=>setComplete(x=>!x)}>Source completeness</button><button id='manage' onClick={()=>setManage(x=>!x)}>Manage capability</button><button id='pending' onClick={()=>{if(pending)journal.clear();else journal.prepare('/v1/school/enrollments','/v1/school/enrollments',{classId:'class',studentId:'learner'});setPending(x=>!x)}}>Pending original command</button><SchoolAccess key={locale+complete+manage+pending} people={people} enrollments={[]} assignments={[]} guardians={[]} classes={[{id:'class',name:'Cedar',yearGroupName:'Year 8',academicYearName:'2026–2027',selectionStatus:'READY'}]} subjects={[{id:'subject',name:'Mathematics',selectionStatus:'READY'}]} canManage={manage} relationshipsComplete={complete} onChanged={()=>globalThis.accessCreateRequests.push('changed')}/></div>;
    }createRoot(document.getElementById('root')).render(<Harness/>);
  ` }, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', plugins: [{ name: 'actual-owner-boundaries', setup(bundler) {
    bundler.onLoad({ filter: /shared[\\/]session[\\/]providers\.tsx$/ }, () => ({ loader: 'js', contents: 'export function useApp(){return globalThis.accessCreateApp}' }));
    bundler.onLoad({ filter: /shared[\\/]hooks[\\/]use-api\.ts$/ }, () => ({ loader: 'js', contents: `import{commonEn,commonAr}from'${root.replaceAll('\\', '/')}/apps/web/shared/i18n/common.ts';export function useApi(){const app=globalThis.accessCreateApp;return{t:app.locale==='ar'?commonAr:commonEn,journal:app.commandJournal,request(...args){globalThis.accessCreateRequests.push(args);throw Error('Product mutations are blocked in owner regression')}}}` }));
    bundler.onLoad({ filter: /\.webp$/ }, args => ({ loader: 'js', contents: 'export default ' + JSON.stringify({ src: 'data:image/webp;base64,' + readFileSync(args.path).toString('base64'), width: 128, height: 128 }) }));
    if (previousPlacement) bundler.onLoad({ filter: /school[\\/]components[\\/]access\.tsx$/ }, args => {
      let source = readFileSync(args.path, 'utf8');
      const action = "{canManage && directoryKind !== 'person' && !action ? <div className=\"learning-actions\"><Button type=\"button\" variant=\"secondary\" disabled={selectionLocked || !relationshipsComplete} onClick={createRelationship}>{copy.create}</Button></div> : null}";
      assert.ok(source.includes(action), 'The previous-placement characterization must match the one restored action.');
      source = source.replace(action, '').replace('{action && !identitySafe ?', action + '{action && !identitySafe ?');
      return { loader: 'tsx', contents: source };
    });
  } }] });
  return result.outputFiles[0].text;
}

test('current relationship directories retain one permitted creation action and open blank exact-kind forms', async ({ page }) => {
    const source = await browserSource();
    const open = async () => { await page.setContent('<div id="root"></div>'); await page.addScriptTag({ content: source }); await page.locator('.school-access-workspace').waitFor(); };
    const labels = { en: { person: 'People', enrollment: 'Enrollments', assignment: 'Teacher assignments', guardian: 'Family relationships', create: 'Prepare a new relationship', cancel: 'Cancel' }, ar: { person: 'الأشخاص', enrollment: 'التسجيلات', assignment: 'تكليفات المعلّمين', guardian: 'علاقات الأسرة', create: 'إعداد علاقة جديدة', cancel: 'إلغاء' } };
    for (const locale of ['en', 'ar'] as const) {
      await open(); if (locale === 'ar') await page.locator('#locale').click();
      const text = labels[locale];
      assert.equal(await page.getByRole('button', { name: text.create, exact: true }).count(), 0);
      for (const kind of ['enrollment', 'assignment', 'guardian'] as const) {
        await page.getByRole('button', { name: text[kind], exact: true }).click();
        const create = page.getByRole('button', { name: text.create, exact: true });
        assert.equal(await create.count(), 1); assert.equal(await create.isEnabled(), true);
        assert.equal(await page.locator('.school-access-layout').getAttribute('data-selected'), 'false');
        assert.equal(await page.locator('.school-access-selected').count(), 0);
        await create.click(); await page.locator('.learning-form').waitFor();
        const fields = await page.locator('.learning-form form').evaluate(form => Array.from(form.querySelectorAll('input,select')).map(item => ({ name: item.getAttribute('name'), value: (item as HTMLInputElement).value, checked: (item as HTMLInputElement).checked })));
        const expected = kind === 'guardian' ? ['parentId', 'studentId', 'relationshipType', 'status', 'effectiveFrom', 'effectiveTo', 'confirmAccessChange'] : kind === 'assignment' ? ['classId', 'subjectId', 'teacherId', 'status', 'effectiveFrom', 'effectiveTo', 'confirmAccessChange'] : ['classId', 'studentId', 'status', 'effectiveFrom', 'effectiveTo', 'confirmAccessChange'];
        assert.deepEqual(fields.map(field => field.name), expected);
        assert.ok(fields.filter(field => field.name !== 'confirmAccessChange').every(field => field.value === ''));
        assert.equal(fields.find(field => field.name === 'confirmAccessChange')?.checked, false);
        assert.equal(await create.count(), 0);
        await page.locator('.learning-form').getByRole('button', { name: text.cancel, exact: true }).click();
        await page.getByRole('button', { name: text.person, exact: true }).click();
      }
      assert.deepEqual(await page.evaluate(() => (globalThis as unknown as { accessCreateRequests: unknown[] }).accessCreateRequests), []);
      await page.getByRole('button', { name: text.enrollment, exact: true }).click();
      await page.locator('#complete').click();
      await page.getByRole('button', { name: text.enrollment, exact: true }).click();
      assert.equal(await page.getByRole('button', { name: text.create, exact: true }).isDisabled(), true);
      await page.locator('#manage').click(); await page.getByRole('button', { name: text.enrollment, exact: true }).click();
      assert.equal(await page.getByRole('button', { name: text.create, exact: true }).count(), 0);
      await open(); if (locale === 'ar') await page.locator('#locale').click();
      await page.locator('#pending').click();
      await page.waitForFunction(() => (document.querySelector('.school-access-directory__groups button:nth-child(3)') as HTMLButtonElement)?.disabled, undefined, { timeout: 3000 });
      assert.equal(await page.getByRole('button', { name: text.assignment, exact: true }).isDisabled(), true);
      assert.equal(await page.getByRole('button', { name: text.create, exact: true }).count(), 0);
      assert.deepEqual(await page.evaluate(() => (globalThis as unknown as { accessCreateRequests: unknown[] }).accessCreateRequests), []);
    }
    // Restore the known old placement only in this in-memory test adapter: the
    // same real owner cannot expose creation inside its absent reader pane.
    await page.setContent('<div id="root"></div>'); await page.addScriptTag({ content: await browserSource(true) });
    await page.getByRole('button', { name: 'Enrollments', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Prepare a new relationship', exact: true }).count(), 0);
});
