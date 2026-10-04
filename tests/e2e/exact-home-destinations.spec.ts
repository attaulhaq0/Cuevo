import { expectTrailWorkspace } from './trail-workspace';
import{test,expect}from'@playwright/test';import{readFile}from'node:fs/promises';
test('a home next action opens its exact source and browser back returns to overview',async({page})=>{
 test.setTimeout(90000);const accounts=JSON.parse(await readFile('.local/synthetic-accounts.json','utf8'))as{role:string;email:string;password:string}[];const teacher=accounts.find(account=>account.role==='teacher')!;
 await page.goto('/');await page.getByRole('button',{name:'English',exact:true}).click();await page.getByLabel('School email').fill(teacher.email);await page.getByLabel('Password',{exact:true}).fill(teacher.password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await expectTrailWorkspace(page);
 const action=page.locator('.teacher-trail__queue-item--marking').filter({has:page.getByRole('button',{name:'Review current work',exact:true})}).first();await expect(action).toBeVisible();const title=await action.locator('.teacher-trail__person p').first().textContent();
 await action.getByRole('button',{name:'Review current work',exact:true}).click();await expect(page).toHaveURL(/view=academic&source=marking&id=[a-f0-9-]+/);await expect(page.locator('.marking-detail')).toBeVisible();expect(await page.locator('.marking-detail').textContent()).toContain(title!.split(' · ')[0]);await expect(page.locator('.marking-queue__item')).toHaveCount(1);
 await page.goBack();await expect(page).not.toHaveURL(/source=marking/);await expect(page.getByRole('heading',{name:'Your teaching day',exact:true})).toBeVisible();await expect(page.locator('.teacher-trail__queue')).toBeVisible();await page.goForward();await expect(page.locator('.marking-detail')).toBeVisible();
});
