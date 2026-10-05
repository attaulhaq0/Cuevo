import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root=resolve(import.meta.dirname,'../..');
// Production owner/forms/parsers with session/read inputs replaced. Mutations
// resolve as an uncertain synthetic transport failure and never leave browser.
async function ownerBundle(){
 const result=await build({stdin:{resolveDir:root,loader:'tsx',contents:`
import React,{useState}from'react';import{createRoot}from'react-dom/client';import{SchoolAccounts}from'./apps/web/features/school/components/accounts';import{CommandJournal,LearningApiError}from'./apps/web/shared/api/client';import{FormDrafts}from'./apps/web/shared/session/form-drafts';import{getDictionary}from'./apps/web/shared/i18n/locale';
 const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),school=id(1),journal=new CommandJournal(),drafts=new FormDrafts();
 const row=n=>({id:id(n+10),schoolId:school,revision:1,status:'REQUESTED',purpose:'invite',createdAt:'2026-10-03T00:00:00Z',expiresAt:'2026-10-10T00:00:00Z',displayName:n===1?'Alex Reed':'Sara Hassan',email:n===1?'alex@example.test':'sara@example.test',role:'student',userId:null});
 globalThis.accountsFixture={available:true,denied:false,wrongSchool:false,page:{items:[row(1),row(2)],nextCursor:null},status:{state:'PENDING',receipt:null},writes:[],reads:[],people:[{id:id(30),displayName:'Lina Hassan',role:'student',status:'active',revision:1,effectiveFrom:'2026-10-01T00:00:00Z',effectiveTo:null,synthetic:true,selectionContext:{status:'READY',enrollmentState:'NONE',classes:[]}},{id:id(31),displayName:'Omar Ahmed',role:'teacher',status:'active',revision:1,effectiveFrom:'2026-10-01T00:00:00Z',effectiveTo:null,synthetic:true,selectionContext:{status:'READY',enrollmentState:'NONE',classes:[]}}]};
 if(!crypto.randomUUID)Object.defineProperty(crypto,'randomUUID',{value:()=>id(99)});
 function Harness(){const[locale,setLocale]=useState('en'),[generation,setGeneration]=useState(1),[mount,setMount]=useState(0);globalThis.accountsApp={locale,dictionary:getDictionary(locale),apiUrl:'',accessToken:'synthetic',accessGeneration:generation,status:'ready',online:true,membership:{schoolId:school,userId:id(2),role:'admin',entitlements:['school.operations']},commandJournal:journal,formDrafts:drafts,announce(){}};globalThis.accountsRefresh=()=>setGeneration(x=>x+1);globalThis.accountsRemount=()=>setMount(x=>x+1);return<div className='workspace'><h1>Accounts and invitations</h1><button id='locale' onClick={()=>{document.documentElement.dir=locale==='en'?'rtl':'ltr';setLocale(x=>x==='en'?'ar':'en')}}>Language</button><SchoolAccounts key={mount}/></div>;}createRoot(document.getElementById('root')).render(<Harness/>);
 `},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',plugins:[{name:'bounded-school-account-inputs',setup(b){
 b.onLoad({filter:/shared[\\/]session[\\/]providers\.tsx$/},()=>({loader:'js',contents:'export function useApp(){return globalThis.accountsApp}'}));
 if(process.env.CUEVO_CHARACTERIZE_ACCOUNT_SENDING==='previous') b.onLoad({filter:/school[\\/]components[\\/]accounts\.tsx$/},args=>({loader:'tsx',contents:readFileSync(args.path,'utf8').replace('useEffect(()=>{setSending(false);setError(null);},[liveRequestFrame]);','')}));
 b.onLoad({filter:/shared[\\/]hooks[\\/]use-api\.ts$/},()=>({loader:'js',contents:`import{commonEn,commonAr}from'${root.replaceAll('\\','/')}/apps/web/shared/i18n/common';import{LearningApiError}from'${root.replaceAll('\\','/')}/apps/web/shared/api/client';export function useApi(){const a=globalThis.accountsApp;return{t:a.locale==='ar'?commonAr:commonEn,journal:a.commandJournal,request(...args){globalThis.accountsFixture.writes.push(args);if(globalThis.accountsFixture.held)return new Promise((resolve,reject)=>{globalThis.accountsResolve=resolve;globalThis.accountsReject=error=>reject(new LearningApiError(error.kind,error.uncertain))});return Promise.reject(new LearningApiError('unavailable',true))}}}export function useApiQuery(path,parse){const f=globalThis.accountsFixture;if(!path)return{data:null,loading:false,error:null};f.reads.push(path);if(f.denied&&!path.endsWith('/availability'))return{data:null,loading:false,error:new LearningApiError('denied')};let value=path.endsWith('/availability')?f.available?{state:'AVAILABLE',reason:null}:{state:'SETUP_REQUIRED',reason:'OPERATOR_APPROVAL_REQUIRED'}:path.endsWith('/delivery')?f.status:f.page;if(f.wrongSchool&&value.items)value={...value,items:value.items.map(x=>({...x,schoolId:'00000000-0000-4000-8000-000000000099'}))};try{return{data:parse(value),loading:false,error:null}}catch{return{data:null,loading:false,error:new LearningApiError('invalid')}}}` }));
 b.onLoad({filter:/shared[\\/]hooks[\\/]use-paginated-query\.ts$/},()=>({loader:'js',contents:"export function usePaginatedLearningQuery(path,parse){const f=globalThis.accountsFixture;if(path)f.reads.push(path);return{data:path?f.people.map(parse):[],loaded:true,loading:false,loadingMore:false,error:null,moreError:null,nextCursor:null,loadMore(){}}}"}));
 b.onLoad({filter:/\.(webp|png|svg)$/},args=>({loader:'js',contents:'export default '+JSON.stringify({src:'data:image/'+(args.path.endsWith('.svg')?'svg+xml':args.path.endsWith('.png')?'png':'webp')+';base64,'+readFileSync(args.path).toString('base64'),width:128,height:128})}));
 }}]});return result.outputFiles[0].text;
}
async function open(page:import('@playwright/test').Page){const css=['packages/ui/src/tokens.css','apps/web/app/globals.css','apps/web/features/school/styles.css'].map(p=>readFileSync(resolve(root,p),'utf8')).join('\n');await page.setContent(`<style>${css}</style><div id='root'></div>`);await page.addScriptTag({content:await ownerBundle()});await page.getByRole('region',{name:'School accounts and invitations',exact:true}).waitFor();}

test('Admin account directory opens one explicit form or exact reader and keeps pending original recovery',async({page},testInfo)=>{
 await page.setViewportSize({width:1366,height:768});await open(page);
 await expect(page.locator('.school-accounts .learning-form')).toHaveCount(0);
 const directory=page.locator('.school-accounts-directory'),layout=page.locator('.school-accounts-layout');
 expect(await directory.evaluate(el=>el.getBoundingClientRect().width>el.parentElement!.getBoundingClientRect().width-2)).toBe(true);
 await page.getByRole('button',{name:'Invite someone to school',exact:true}).click();
 await expect(page.locator('.school-accounts .learning-form')).toHaveCount(1);
  await page.screenshot({path:testInfo.outputPath('school-account-invite-selected-desktop.png')});
 await expect(page.getByLabel('I reviewed this person and role and approve this invitation')).not.toBeChecked();
 await page.getByRole('button',{name:'Cancel',exact:true}).click();
 await page.getByRole('combobox',{name:'Select an invitation to review',exact:true}).selectOption('00000000-0000-4000-8000-000000000011');
 await expect(layout).toHaveAttribute('data-selected','true');await expect(page.locator('.school-accounts-reader')).toContainText('Alex Reed');
 await expect(page.locator('.school-accounts .learning-form')).toHaveCount(0);
 await page.getByRole('button',{name:'Cancel pending invitation',exact:true}).click();
 await page.getByLabel('School approval reason',{exact:true}).fill('Reviewed cancellation');await page.getByLabel('I approve cancellation of this exact invitation').check();await page.getByRole('button',{name:'Save',exact:true}).click();
 await expect(page.getByRole('button',{name:'Retry the same action',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Back to invitations',exact:true})).toBeDisabled();
 await expect(page.getByRole('combobox',{name:'Select an invitation to review',exact:true})).toBeDisabled();
 await expect(page.getByRole('button',{name:'Back to invitations',exact:true})).toBeDisabled();
 await page.evaluate(()=>{const g=globalThis as unknown as{accountsFixture:{page:{items:unknown[]}},accountsRefresh():void};g.accountsFixture.page.items=[];g.accountsRefresh()});
 await expect(page.getByRole('button',{name:'Retry the same action',exact:true})).toBeVisible();await expect(page.locator('.school-accounts form [name]')).toHaveCount(0);
 await page.evaluate(()=>(globalThis as unknown as{accountsRemount():void}).accountsRemount());
 await expect(page.getByRole('button',{name:'Retry the same action',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>(globalThis as unknown as{accountsFixture:{writes:unknown[]}}).accountsFixture.writes.length)).toBe(1);
});

test('Admin account mobile reader returns to directory and setup or wrong-school sources never fabricate access',async({page})=>{
 await open(page);await page.getByRole('combobox',{name:'Select an invitation to review',exact:true}).selectOption('00000000-0000-4000-8000-000000000011');
 for(const width of [390,320]){await page.setViewportSize({width,height:844});await expect(page.locator('.school-accounts-directory')).toBeHidden();await page.locator('#locale').click();await page.getByRole('button',{name:/Back to invitations|العودة إلى الدعوات/,exact:true}).click();await expect(page.locator('.school-accounts-directory')).toBeVisible();await expect(page.locator('.school-accounts-reader')).toHaveCount(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect((await new AxeBuilder({page}).include('.school-accounts').analyze()).violations).toEqual([]);await page.getByRole('combobox',{name:/Select an invitation to review|اختر الدعوة للمراجعة/,exact:true}).selectOption('00000000-0000-4000-8000-000000000011');}
 await page.evaluate(()=>{const g=globalThis as unknown as{accountsFixture:{wrongSchool:boolean},accountsRefresh():void};g.accountsFixture.wrongSchool=true;g.accountsRefresh()});await expect(page.getByText('Alex Reed',{exact:true})).toHaveCount(0);await expect(page.locator('.school-accounts .learning-form')).toHaveCount(0);
 await page.evaluate(()=>{const g=globalThis as unknown as{accountsFixture:{available:boolean},accountsRemount():void};g.accountsFixture.available=false;g.accountsRemount()});await expect(page.getByRole('heading',{name:'School account setup required',exact:true})).toBeVisible();await expect(page.locator('.school-accounts')).toHaveCount(0);
 expect(await page.evaluate(()=>(globalThis as unknown as{accountsFixture:{writes:unknown[]}}).accountsFixture.writes)).toEqual([]);
});

test('School recovery keeps fresh member confirmation and the original command while its source changes',async({page})=>{
 await open(page);await page.getByRole('button',{name:'Recover a school member account',exact:true}).click();
 const recovery=page.getByRole('region',{name:'Recover a school member account',exact:true});
 await recovery.getByRole('combobox',{name:'Current member',exact:true}).selectOption('00000000-0000-4000-8000-000000000030');
 await expect(recovery.getByLabel('I reviewed this member identity and approve recovery')).not.toBeChecked();
 await recovery.getByLabel('School approval reason').fill('Reviewed the current identity');await recovery.getByLabel('I reviewed this member identity and approve recovery').check();
 await recovery.getByRole('button',{name:'Save',exact:true}).click();await expect(recovery.getByRole('button',{name:'Retry the same action',exact:true})).toBeVisible();
 await expect(recovery.getByRole('combobox',{name:'Current member',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Back to invitations',exact:true})).toBeDisabled();
 await page.evaluate(()=>{const g=globalThis as unknown as{accountsFixture:{people:{revision:number}[]},accountsRefresh():void};g.accountsFixture.people[0].revision=2;g.accountsRefresh()});
 await expect(recovery.getByRole('button',{name:'Retry the same action',exact:true})).toBeVisible();await expect(recovery.locator('form [name]')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Retry the same action',exact:true})).toHaveCount(1);
 expect(await page.evaluate(()=>(globalThis as unknown as{accountsFixture:{writes:unknown[]}}).accountsFixture.writes.length)).toBe(1);
});

test('Unconfirmed account delivery reads the original status instead of repeating its external effect',async({page})=>{
 await open(page);await page.getByRole('combobox',{name:'Select an invitation to review',exact:true}).selectOption('00000000-0000-4000-8000-000000000011');
 await page.getByRole('button',{name:'Send approved invitation',exact:true}).click();
 const check=page.getByRole('region',{name:'Check previous account action',exact:true});await expect(check).toBeVisible();await expect(page.getByRole('button',{name:'Retry the same action',exact:true})).toHaveCount(0);
 const writes=await page.evaluate(()=>(globalThis as unknown as{accountsFixture:{writes:unknown[][]}}).accountsFixture.writes);expect(writes).toHaveLength(1);
 await check.getByRole('button',{name:'Refresh invitations',exact:true}).click();expect(await page.evaluate(()=>(globalThis as unknown as{accountsFixture:{writes:unknown[][]}}).accountsFixture.writes)).toEqual(writes);
 await page.evaluate(()=>{const g=globalThis as unknown as{accountsFixture:{status:unknown},accountsRefresh():void};g.accountsFixture.status={state:'COMPLETED',receipt:{id:'00000000-0000-4000-8000-000000000011',schoolId:'00000000-0000-4000-8000-000000000001',eventId:'00000000-0000-4000-8000-000000000080',requestRevision:1,status:'AWAITING_CLAIM',providerState:'CONFIRMED',deliveryState:'ACCEPTED'}};g.accountsRefresh()});
 await expect(check).toHaveCount(0);await expect(page.getByRole('combobox',{name:'Select an invitation to review',exact:true})).toBeEnabled();expect(await page.evaluate(()=>(globalThis as unknown as{accountsFixture:{writes:unknown[][]}}).accountsFixture.writes)).toEqual(writes);
});

test('A changed access frame releases local sending state while retaining the original delivery status owner',async({page})=>{
 await open(page);await page.getByRole('combobox',{name:'Select an invitation to review',exact:true}).selectOption('00000000-0000-4000-8000-000000000011');
 await page.evaluate(()=>(globalThis as unknown as{accountsFixture:{held:boolean}}).accountsFixture.held=true);
 await page.getByRole('button',{name:'Send approved invitation',exact:true}).click();await expect(page.getByRole('button',{name:'Refresh invitations',exact:true}).first()).toBeDisabled();
 await page.evaluate(()=>(globalThis as unknown as{accountsRefresh():void}).accountsRefresh());
 await expect(page.getByRole('button',{name:'Refresh invitations',exact:true}).first()).toBeEnabled();
 await expect(page.getByRole('region',{name:'Check previous account action',exact:true})).toBeVisible();
 await page.evaluate(()=>{const g=globalThis as unknown as{accountsResolve:(value:unknown)=>void};g.accountsResolve({id:'00000000-0000-4000-8000-000000000011',schoolId:'00000000-0000-4000-8000-000000000001',eventId:'00000000-0000-4000-8000-000000000080',requestRevision:1,status:'AWAITING_CLAIM',providerState:'CONFIRMED',deliveryState:'ACCEPTED'});});
 await expect(page.getByRole('region',{name:'Check previous account action',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Back to invitations',exact:true})).toBeEnabled();
 expect(await page.evaluate(()=>(globalThis as unknown as{accountsFixture:{writes:unknown[][]}}).accountsFixture.writes.length)).toBe(1);
});

test('A confirmed delivery refusal remains visible after the original command is settled',async({page})=>{
 await open(page);await page.getByRole('combobox',{name:'Select an invitation to review',exact:true}).selectOption('00000000-0000-4000-8000-000000000011');
 await page.evaluate(()=>(globalThis as unknown as{accountsFixture:{held:boolean}}).accountsFixture.held=true);
 await page.getByRole('button',{name:'Send approved invitation',exact:true}).click();
 await page.evaluate(()=>{const g=globalThis as unknown as{accountsReject:(error:unknown)=>void};const failure=Object.assign(new Error('Synthetic refusal'),{kind:'denied',uncertain:false});g.accountsReject(failure);});
 // The adapter converts this deliberately shaped transport refusal into the
 // same LearningApiError type before invoking the current owner's catch.
 await expect(page.locator('.school-accounts-reader [role="alert"]')).toBeVisible();
});
