import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { expectTrailWorkspace } from './trail-workspace';

const learner = 'e1100000-0000-4000-8000-000000000001', school = 'e1200000-0000-4000-8000-000000000001';
const id = (n: number) => `e1300000-0000-4000-8000-${String(n).padStart(12, '0')}`;
type Mode = 'populated' | 'empty' | 'denied' | 'wrong' | 'partial' | 'feedback_failure';
const work = { id:id(1),courseId:id(2),courseTitle:'Reasoning · Cedar',title:'Explain one checking method',instructions:'Compare the two explanations and choose your next step.',model:'numeric',maxScore:10,rubricId:null,status:'PUBLISHED',dueAt:null,policyVersion:1,availableFrom:null,availableUntil:null,allowLate:true,assignmentState:'OPEN',availabilityVersion:1,submissionKind:'TEXT',currentSubmission:null };
const result = { id:id(3),submissionId:id(4),assessmentId:id(5),learnerId:learner,revision:1,status:'RELEASED',policyVersion:1,referenceId:id(6),referenceVersion:'1',evidenceId:id(7),createdAt:'2026-10-04T09:00:00Z',assessmentTitle:'Reviewing an explanation',referenceTitle:'Explain the evidence',feedback:'Review why your checking step is appropriate.',model:'numeric',score:0,maxScore:10,nativeResult:{type:'numeric',score:0,maxScore:10,policyVersion:1} };
const portfolio = (n: number) => ({ id:id(n),revisionId:id(n+30),revision:1,learnerId:learner,sourceModel:'numeric',title:n===10?'My selected explanation':'My revised method',reflection:n===10?'I checked each step and explained why it works.':'I compared both methods before choosing one.',createdAt:'2026-10-04T10:00:00Z',feedback:n===10?null:'A reviewed explanation.',featured:false,approvalState:n===10?'AWAITING_REVIEW':'REVIEWED',parentVisible:false,reviewedAt:n===10?null:'2026-10-04T11:00:00Z',evidenceId:id(7),resultId:id(3),submissionId:id(4),referenceId:id(6),referenceVersion:'1',policyVersion:1,nativeResult:result.nativeResult,assessmentTitle:result.assessmentTitle,referenceTitle:result.referenceTitle,identity:{status:'READY',learnerName:'Lina Hassan',className:'Cedar',yearGroupName:'Year 8',academicYearName:'2026–2027',courseTitle:'Reasoning',assessmentTitle:result.assessmentTitle,submittedAt:'2026-10-03T08:00:00Z',submissionRevision:1} });

async function desk(page: Page, mode: Mode) {
  const origin = new URL(test.info().project.use.baseURL as string).origin;
  let portfolioReads = 0;
  await page.route('**/*', async route => {
    const request=route.request(), url=new URL(request.url());
    if (url.pathname.includes('/auth/v1/') || url.pathname.startsWith('/v1/')) {
      let data:unknown={items:[],nextCursor:null}; let status=200;
      if(url.pathname.includes('/auth/v1/token'))data={access_token:'fictional-student-desk-token',token_type:'bearer',expires_in:3600,refresh_token:'fictional-student-desk-refresh',user:{id:learner,aud:'authenticated',role:'authenticated',email:'learner@example.invalid',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-10-01T00:00:00Z'}};
      else if(url.pathname==='/v1/me')data={userId:learner,schoolId:school,membershipId:id(9),role:'student',displayName:'Lina Hassan',school:{id:school,name:'Reference school'},entitlements:['learning','assessment','curriculum','learner.state','improvement','portfolio','community','school.operations']};
      else if(url.pathname==='/v1/diagnostics/config')data={enabled:false};
      else if(url.pathname==='/v1/assessments')data={items:[work,{...work,id:id(11),title:'Compare your next explanation'}],nextCursor:null};
      else if(url.pathname==='/v1/results'){
        if(mode==='feedback_failure'&&url.searchParams.has('cursor')){status=503;data={code:'REQUEST_UNAVAILABLE'};}
        else data={items:[result],nextCursor:mode==='feedback_failure'?id(81):null};
      }
      else if(url.pathname==='/v1/portfolio/items') {
        portfolioReads++;
        if(mode==='denied'||mode==='partial'&&url.searchParams.has('cursor')){status=403;data={code:'FORBIDDEN',message:'Unavailable'};}
        else data={items:mode==='empty'?[]:[mode==='wrong'?{...portfolio(10),learnerId:id(99)}:portfolio(10),portfolio(20)],nextCursor:mode==='partial'?id(80):null};
      }
      await route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});return;
    }
    if(url.origin!==origin||request.method()!=='GET'){await route.abort();return;}
    await route.continue();
  });
  await page.goto('/');await page.getByRole('button',{name:'English',exact:true}).click();
  await page.getByLabel('School email',{exact:true}).fill('learner@example.invalid');await page.getByLabel('Password',{exact:true}).fill('fictional-presentation-only');await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await expectTrailWorkspace(page,'student');await expect(page.getByRole('heading',{name:work.title,exact:true})).toBeVisible();
  return ()=>portfolioReads;
}

test('Student Desk shows actual source reflection, native zero and exact task actions with bilingual reflow',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await desk(page,'populated');
  const selected=page.locator('.student-trail__portfolio');await expect(selected.getByText('I checked each step and explained why it works.',{exact:true})).toBeVisible();
  await expect(selected.getByText('Waiting for review',{exact:true})).toBeVisible();await expect(selected.getByText('Reviewed',{exact:true})).toBeVisible();
  for(const locale of['English','العربية']){
    await page.getByRole('button',{name:locale,exact:true}).click();
    for(const width of[1366,1440,768,390,320,640]){
      await page.setViewportSize({width,height:width>=1000?800:844});
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
      await expect(page.locator('.student-trail__primary')).toBeVisible();
    }
  }
  await page.getByRole('button',{name:'English',exact:true}).click();await page.setViewportSize({width:1366,height:768});
  const native=page.locator('.student-home__native');await native.locator('summary').click();await expect(native).toHaveAttribute('open','');await expect(native).toContainText('0');await expect(native).toContainText('10');
  await page.locator('.student-trail__hide').click();await expect(page.locator('.student-trail')).toHaveAttribute('data-character','hidden');await expect(page.locator('.student-trail__task-art')).toBeHidden();
  await page.locator('.student-trail__hide').click();await expect(page.locator('.student-trail')).toHaveAttribute('data-character','visible');
  await expect(page.locator('main h1')).toHaveCount(1);
  expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
  await page.locator('.student-trail__task .student-trail__primary').click();await expect(page).toHaveURL(new RegExp(`view=learning&source=assessment&id=${work.id}`));
  expect(errors).toEqual([]);
});

test('a failed summary continuation keeps its named source error and retry visible',async({page})=>{
  await desk(page,'feedback_failure');
  const sources=page.locator('.student-home__source-continuations');
  await sources.locator('summary').click();
  await sources.getByRole('button',{name:'Load more: Released feedback and results',exact:true}).click();
  const recovery=page.locator('.student-home__source-recovery').getByRole('region',{name:'Released feedback and results',exact:true});
  await expect(recovery).toBeVisible();
  await expect(recovery.locator('[role="alert"]')).toBeVisible();
  await expect(recovery.getByRole('button',{name:'Load more: Released feedback and results',exact:true})).toBeVisible();
  expect(await recovery.evaluate(element=>element.closest('details'))).toBeNull();
});

for(const mode of['empty','denied','wrong','partial']as const)test(`Student Portfolio ${mode} remains honest without hiding independent current work`,async({page})=>{
  const reads=await desk(page,mode);const section=page.locator('.student-trail__portfolio');
  if(mode==='empty')await expect(section).toContainText('Choose released work');
  if(mode==='denied'||mode==='wrong'){await expect(section).not.toContainText('I checked each step');await expect(section.locator('[role="alert"]')).toBeVisible();}
  if(mode==='partial'){
    await expect(section).toContainText('I checked each step');await section.getByRole('button',{name:/^Load more/}).click();
    await expect(section).not.toContainText('I checked each step');await expect(section.locator('[role="alert"]')).toBeVisible();expect(reads()).toBeGreaterThan(1);
  }
  await expect(page.getByRole('heading',{name:work.title,exact:true})).toBeVisible();await expect(page.locator('.student-trail__feedback')).toContainText(result.feedback);
});
