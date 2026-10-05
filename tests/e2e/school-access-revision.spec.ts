import { expectTrailWorkspace, selectTrailSchoolRecord } from './trail-workspace';
import { observeSchoolCurrentSources } from './school-current-sources';
import { withBrowserRestoration } from './browser-restoration';
import {test,expect}from'@playwright/test';
import{readFile}from'node:fs/promises';
import{randomUUID}from'node:crypto';
test('administrator edits a current guardian source and stale review cannot restore newer access',async({page})=>{
 test.setTimeout(90000);
 observeSchoolCurrentSources(page);
 const accounts=JSON.parse(await readFile('.local/synthetic-accounts.json','utf8'))as{role:string;email:string;password:string}[];const admin=accounts.find(account=>account.role==='admin')!;
 await page.goto('/');await page.getByRole('button',{name:'English',exact:true}).click();await page.getByLabel('School email').fill(admin.email);await page.getByLabel('Password',{exact:true}).fill(admin.password);await page.getByRole('button',{name:'Sign in',exact:true}).click(); await expectTrailWorkspace(page);await page.locator('.workspace-chrome__navigation').getByRole('button',{name:'School',exact:true}).click();await page.getByRole('button',{name:'People and access',exact:true}).click();
 const source=await selectTrailSchoolRecord(page,'guardian',/Ahmed Al-Kuwari[\s\S]*Lina Al-Kuwari/);
 await source.getByRole('button',{name:'Edit this record',exact:true}).click();let form=page.getByRole('region',{name:'Configure guardian relationship',exact:true}).filter({has:page.locator('form')});
 await expect(form.getByLabel('Parent / guardian',{exact:true})).toHaveValue('20000000-0000-4000-8000-000000000072');await expect(form.getByLabel('Student',{exact:true})).toHaveValue('20000000-0000-4000-8000-000000000012');await expect(form.getByLabel('Status',{exact:true})).toHaveValue('active');
 await form.getByLabel('I approve this change to current access',{exact:true}).check();
 const currentResponse=page.waitForResponse(response=>new URL(response.url()).pathname==='/v1/school/guardian-relationships'&&response.request().method()==='POST');await form.getByRole('button',{name:'Save',exact:true}).click();const first=await currentResponse;expect(first.ok()).toBe(true);const original=first.request().postDataJSON();expect(original).toMatchObject({parentId:'20000000-0000-4000-8000-000000000072',studentId:'20000000-0000-4000-8000-000000000012'});const receipt=await first.json();expect(receipt.revision).toBe(original.expectedRevision+1);
 await expect(page.getByRole('region',{name:'Configure guardian relationship',exact:true}).filter({has:page.locator('form')})).toHaveCount(0);await source.getByRole('button',{name:'Edit this record',exact:true}).click();form=page.getByRole('region',{name:'Configure guardian relationship',exact:true}).filter({has:page.locator('form')});await form.getByLabel('I approve this change to current access',{exact:true}).check();
 const key=process.env.SUPABASE_PUBLISHABLE_KEY;expect(key).toBeTruthy();const auth=await page.request.post(`${process.env.SUPABASE_URL}/auth/v1/token?grant_type=password`,{headers:{apikey:key!},data:{email:admin.email,password:admin.password}});expect(auth.ok()).toBe(true);const token=(await auth.json()).access_token;
 const changed=await page.request.post('http://localhost:4000/v1/school/guardian-relationships',{headers:{Authorization:`Bearer ${token}`,'X-School-Id':'10000000-0000-4000-8000-000000000001','Idempotency-Key':randomUUID()},data:{...original,status:'revoked',expectedRevision:receipt.revision}});expect(changed.ok()).toBe(true);const latest=await changed.json();
 await withBrowserRestoration(async()=>{
  const conflict=page.waitForResponse(response=>new URL(response.url()).pathname==='/v1/school/guardian-relationships'&&response.request().method()==='POST');await form.getByRole('button',{name:'Save',exact:true}).click();expect((await conflict).status()).toBe(409);await expect(form.getByRole('alert')).toContainText('conflicts with the current record');
  await form.getByRole('button',{name:'Cancel',exact:true}).click();await page.getByRole('button',{name:'Refresh school records',exact:true}).click();await expect(source).toContainText('Revoked');
 },async()=>{const restored=await page.request.post('http://localhost:4000/v1/school/guardian-relationships',{headers:{Authorization:`Bearer ${token}`,'X-School-Id':'10000000-0000-4000-8000-000000000001','Idempotency-Key':randomUUID()},data:{...original,status:'active',expectedRevision:latest.revision}});expect(restored.ok()).toBe(true);});
});
