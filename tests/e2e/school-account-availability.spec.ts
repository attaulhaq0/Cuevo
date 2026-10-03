import{test,expect}from'@playwright/test';
import{readFile}from'node:fs/promises';
import AxeBuilder from'@axe-core/playwright';
test('disabled account operation setup is explained before invitations, recovery or protected list requests',async({page})=>{
 const accounts=JSON.parse(await readFile('.local/synthetic-accounts.json','utf8'))as{role:string;email:string;password:string}[];const admin=accounts.find(account=>account.role==='admin');if(!admin)throw Error('Synthetic administrator required.');
 const protectedRequests:string[]=[];page.on('request',request=>{const path=new URL(request.url()).pathname;if(path==='/v1/school/accounts/invitations'||/^\/v1\/school\/accounts\/[^/]+\/recovery$/.test(path))protectedRequests.push(path);});
 await page.goto('/');await page.getByLabel('School email',{exact:true}).fill(admin.email);await page.getByLabel('Password',{exact:true}).fill(admin.password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.getByText('School access verified',{exact:true})).toBeVisible();await page.getByRole('navigation').getByRole('button',{name:'School',exact:true}).click();await page.getByRole('button',{name:'Accounts and invitations',exact:true}).click();
 await expect(page.getByRole('heading',{name:'School account setup required',exact:true})).toBeVisible();await expect(page.getByRole('region',{name:'Invite someone to school',exact:true})).toHaveCount(0);await expect(page.getByRole('region',{name:'Recover a school member account',exact:true})).toHaveCount(0);expect(protectedRequests).toEqual([]);
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'العربية',exact:true}).click();await expect(page.locator('html')).toHaveAttribute('dir','rtl');await expect(page.getByRole('heading',{name:'إعداد حسابات المدرسة مطلوب',exact:true})).toBeVisible();expect((await new AxeBuilder({page}).include('main').analyze()).violations).toEqual([]);
});
