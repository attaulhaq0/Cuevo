import { test, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runCustomerBrowserLearningLoop, selectLoopPreparation, type CustomerLearningLoopAccount, type CustomerLearningLoopRole } from './customer-learning-loop';
import { attachDiagnosticPreservingFailure, observeCourseObjectiveTransport, serializeFailureDiagnostic } from './course-objective-diagnostics';

const api = 'http://localhost:4000';
test('adapter: full-loop preparation binds the visible source to its independent current receipt',async({page})=>{
 const courseId='e8000000-0000-4000-8000-000000000001',id='e8000000-0000-4000-8000-000000000002',title='Checking unit';
 for(const sourceId of[id,'e8000000-0000-4000-8000-000000000003']){
  await page.route('https://fixture.invalid/v1/learning-content/unit/*',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({courseId,sourceId,resource:'unit',title})}));
  await page.setContent('<div class="course-view"><h1>Checking course</h1><nav aria-label="Course structure"><button type="button"></button></nav><section aria-label="Course preparation"></section></div>');
  await page.evaluate(({title,url})=>{const button=document.querySelector('button')!;button.textContent=title;button.addEventListener('click',async()=>{button.setAttribute('aria-current','page');await fetch(url);document.querySelector('h1')!.textContent=title;});},{title,url:'https://fixture.invalid/v1/learning-content/unit/'+id});
  if(sourceId===id)await selectLoopPreparation(page,title,{courseId,resource:'unit',id},'https://fixture.invalid');else await expect(selectLoopPreparation(page,title,{courseId,resource:'unit',id},'https://fixture.invalid')).rejects.toThrow();await page.unrouteAll({behavior:'wait'});
 }
});


/** Every domain write in this test is a visible form/button action. No API setup or mutation helper. */
test('a teacher and learner operate the entire evidence, analysis and measured support loop through the UI', async ({ page }) => {
  test.setTimeout(240_000);
  const credentials=JSON.parse(await readFile('.local/synthetic-accounts.json','utf8')) as {role:CustomerLearningLoopRole;email:string;password:string}[];
  const identities=JSON.parse(await readFile('supabase/seed/identities.json','utf8')) as {schoolId:string;actors:{role:CustomerLearningLoopRole;actorId:string;schoolId:string;email:string;displayName:string}[]};
  const accounts:CustomerLearningLoopAccount[]=(['admin','coordinator','teacher','student','parent'] as const).map(role=>{const account=credentials.find(item=>item.role===role);if(!account)throw Error('The synthetic loop account is unavailable');const identity=identities.actors.find(item=>item.email===account.email&&item.role===account.role);if(!identity)throw Error('The exact synthetic loop actor is unavailable');return{...identity,password:account.password};});
  const run=new Date().toISOString().replace(/[:.]/g,'-'),title='Explain and check — '+run;
  const directory=resolve('.local/customer-readiness/browser-learning-loop',run,test.info().project.name);await mkdir(directory,{recursive:true});
  const errors:string[]=[],consoleErrors:string[]=[],hydration:string[]=[];const authUrl=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const webOrigin=new URL(test.info().project.use.baseURL??'http://localhost:3000').origin;
  const transportDiagnostic=observeCourseObjectiveTransport(page,{api,web:webOrigin,auth:authUrl?new URL(authUrl).origin:null});
  const writes:{path:string;id:string;status:number}[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());if(['error','warning'].includes(message.type())&&/hydration|hydrated|server rendered|attributes.*match|React error #418/i.test(message.text()))hydration.push(message.text());});
  async function capture(name:string){await page.screenshot({path:resolve(directory,name),fullPage:true});}
  try {
    const observation=await runCustomerBrowserLearningLoop(page,{webOrigin,apiOrigin:api,accounts,title,context:{schoolId:identities.schoolId,classId:'30000000-0000-4000-8000-000000000001',classLabel:'Year 1 · Cedar · Year 1 · 2026–2027',className:'Year 1 · Cedar',yearGroupName:'Year 1',classShortName:'Cedar',subjectId:'43000000-0000-4000-8000-000000000001',subjectName:'Mathematics',referenceId:'61000000-0000-4000-8000-000000000001',referenceTitle:'Synthetic school-authored explanation objective'}},{
      step:async(name,work)=>{await test.step(name,work);},capture,onCommand:async command=>{writes.push({path:command.path,id:command.receipt.id,status:command.status});},
      verifyQuality:async()=>{await attachDiagnosticPreservingFailure(async()=>{expect(errors).toEqual([]);expect(consoleErrors).toEqual([]);expect(hydration).toEqual([]);},async()=>{console.log(serializeFailureDiagnostic(transportDiagnostic()));});}
    });
    await writeFile(resolve(directory,'evidence.json'),JSON.stringify({status:'VERIFIED',mutationMode:'VISIBLE_UI_ONLY',writes:observation.writes,sourceLoop:observation.sourceLoop,provenance:'Authorized browser receipts, evidence and processed learner-state source events; no owner audit/DB read.',officialCurriculumClaim:false,pageErrors:errors.length,consoleErrors:consoleErrors.length,hydrationWarnings:hydration.length},null,2));
  } catch(failure) {if(!page.isClosed())await capture('failure.png').catch(()=>undefined);await writeFile(resolve(directory,'failure.json'),JSON.stringify({status:'FAILED',mutationMode:'VISIBLE_UI_ONLY',confirmedWriteCount:writes.length,consoleErrorCount:errors.length,hydrationWarningCount:hydration.length},null,2));throw failure;}
});
