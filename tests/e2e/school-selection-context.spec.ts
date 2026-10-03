import {test,expect}from'@playwright/test';
import{readFile}from'node:fs/promises';
import AxeBuilder from'@axe-core/playwright';

test('administrator chooses current people and classes using visible source context in English and Arabic',async({page})=>{
 const accounts=JSON.parse(await readFile('.local/synthetic-accounts.json','utf8'))as{role:string;email:string;password:string}[];const admin=accounts.find(account=>account.role==='admin');if(!admin)throw Error('Synthetic administrator required.');
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.name));page.on('console',message=>{if(message.type()==='error'||message.type()==='warning'&&/hydrat/i.test(message.text()))errors.push(message.type());});
 await page.goto('/');await page.getByLabel('School email',{exact:true}).fill(admin.email);await page.getByLabel('Password',{exact:true}).fill(admin.password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.getByText('School access verified',{exact:true})).toBeVisible();await page.getByRole('navigation').getByRole('button',{name:'School',exact:true}).click();await page.getByRole('button',{name:'People and access',exact:true}).click();
 await page.getByRole('button',{name:'Manage school account',exact:true}).click();const select=page.locator('#school-person-selection');await expect(select).toBeVisible();
 const current=select.locator('option').filter({hasText:/Lina Al-Kuwari/});await expect(current).toHaveCount(1);const caption=await current.textContent();if(!caption)throw Error('Current named selector required.');
 expect(caption).toContain('Class:');expect(caption).toContain('Year group:');expect(caption).toContain('Academic year:');expect(caption).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);await select.selectOption({label:caption});
 const form=page.getByRole('region',{name:'Manage school account',exact:true});await expect(form.getByLabel('Name',{exact:true})).toHaveValue('Lina Al-Kuwari');await expect(form.getByLabel('I approve this change to current access',{exact:true})).not.toBeChecked();
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'العربية',exact:true}).click();await expect(page.locator('html')).toHaveAttribute('dir','rtl');await expect(select.locator('option:checked')).toContainText('الصف:');await expect(select.locator('option:checked')).toContainText('المستوى الدراسي:');expect((await new AxeBuilder({page}).include('main').analyze()).violations).toEqual([]);expect(errors).toEqual([]);
});
