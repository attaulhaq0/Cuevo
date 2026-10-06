import {test,expect}from'@playwright/test';
import{build}from'esbuild';
import{readFileSync}from'node:fs';
import{resolve}from'node:path';
const root=resolve(import.meta.dirname,'../..');
const cases=[
 {nestedOutcome:'success',typed:false,pending:false,changed:false},
 {nestedOutcome:'unavailable',typed:false,pending:false,changed:false},
 {nestedOutcome:'invalid',typed:false,pending:false,changed:false},
 {nestedOutcome:'success',typed:true,pending:false,changed:false},
 {nestedOutcome:'unavailable',typed:true,pending:false,changed:false},
 {nestedOutcome:'invalid',typed:true,pending:false,changed:false},
 {nestedOutcome:'denied',typed:true,pending:false,changed:false},
 {nestedOutcome:'success',typed:true,pending:false,changed:true},
 {nestedOutcome:'unavailable',typed:true,pending:true,changed:false},
 {nestedOutcome:'invalid',typed:true,pending:true,changed:false},
 {nestedOutcome:'denied',typed:true,pending:true,changed:false},
]as const;
for(const {nestedOutcome,typed,pending,changed}of cases)test(`actual Teacher Return ${typed?'typed':'blank'}${pending?' pending':''}${changed?' changed revision':''} after nested ${nestedOutcome}`,async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 const built=await build({stdin:{resolveDir:root,loader:'tsx',contents:`
 import React,{useState,useEffect}from'react';import{createRoot}from'react-dom/client';import{LearningWorkspace}from'./apps/web/features/learning/components/learning-workspace';import{CommandJournal}from'./apps/web/shared/api/client';import{FormDrafts}from'./apps/web/shared/session/form-drafts';
 const sid='40000000-0000-4000-8000-000000000101',aid='40000000-0000-4000-8000-000000000102',lid='40000000-0000-4000-8000-000000000103',journal=new CommandJournal(),drafts=new FormDrafts();const sub={id:sid,assessmentId:aid,learnerId:lid,assessmentTitle:'Synthetic lifecycle source',learnerName:'Synthetic learner',content:'Synthetic response',status:'SUBMITTED',submittedAt:'2026-10-03T00:00:00Z',revision:1,responseKind:'TEXT'};globalThis.returnProbe={drafts,journal,submission:sub,reads:[],writes:0,nestedCount:0,held:true};
 globalThis.fetch=async(url,options)=>{const f=globalThis.returnProbe,path=new URL(url).pathname;f.reads.push({path,aborted:options.signal?.aborted??false});if(options.method==='POST'){f.writes++;throw Error('Simulated unavailable command transport.');}if(path==='/v1/submissions')return new Response(JSON.stringify({items:[sub],nextCursor:null}),{status:200});if(path.endsWith('/source-work')){f.nestedCount++;if(f.held){f.held=false;return new Promise(resolve=>{f.release=kind=>resolve(new Response(JSON.stringify(kind==='invalid'?{}:{submissionId:sid,assessmentId:aid,learnerId:lid,revision:sub.revision,responseKind:'TEXT',content:'Synthetic response',artifacts:[]}),{status:kind==='unavailable'?503:kind==='denied'?403:200}))})}return new Response(JSON.stringify({submissionId:sid,assessmentId:aid,learnerId:lid,revision:sub.revision,responseKind:'TEXT',content:'Synthetic response',artifacts:[]}),{status:200})}return new Response(JSON.stringify({items:[],nextCursor:null}),{status:200})};
 function Harness(){const[generation,setGeneration]=useState(1);useEffect(()=>{const revalidate=()=>setGeneration(x=>x+1);window.addEventListener('focus',revalidate);return()=>window.removeEventListener('focus',revalidate)},[]);globalThis.learningProbeApp={locale:'en',membership:{schoolId:'school',userId:'actor',role:'teacher',entitlements:['learning','assessment']},status:'ready',online:true,apiUrl:'https://fixture.invalid',accessToken:'synthetic',accessGeneration:generation,commandJournal:journal,formDrafts:drafts,announce(){},refreshAccess(){setGeneration(x=>x+1)},reportDiagnostic(){}};return <div className='workspace'><LearningWorkspace/></div>}createRoot(document.getElementById('root')).render(<Harness/>);
 `},bundle:true,write:false,platform:'browser',jsx:'automatic',format:'iife',plugins:[{name:'synthetic-readonly-session',setup(bundler){
 bundler.onLoad({filter:/shared[\\/]session[\\/]providers\.tsx$/},()=>({loader:'js',contents:'export function useApp(){return globalThis.learningProbeApp}'}));
 bundler.onLoad({filter:/learning[\\/]components[\\/]source-context\.tsx$/},()=>({loader:'tsx',contents:'export function LearningSourceContext(){return null}'}));
 bundler.onLoad({filter:/\.(webp|svg|png)$/},args=>({loader:'js',contents:'export default '+JSON.stringify({src:'data:image/'+(args.path.endsWith('.svg')?'svg+xml':'webp')+';base64,'+readFileSync(args.path).toString('base64'),width:128,height:128})}));
 }}]});
 await page.setContent('<div id="root"></div>');await page.addScriptTag({content:"if(!crypto.randomUUID)crypto.randomUUID=()=> '40000000-0000-4000-8000-000000000104';"});await page.addScriptTag({content:built.outputFiles[0].text});
 await page.locator('[data-workspace-section="submissions"]').click();await page.locator('[data-submission-choice] button').click();
 await expect.poll(()=>page.evaluate(()=>typeof(globalThis as unknown as {returnProbe:{release?:unknown}}).returnProbe.release)).toBe('function');
 await page.getByRole('button',{name:'Return for revision',exact:true}).click();
 const feedback=page.getByRole('region',{name:'Return for revision',exact:true}).getByLabel('Revision feedback');await expect(feedback).toBeVisible();
 if(typed)await feedback.fill('Synthetic private unsent feedback');
 if(pending){await page.getByRole('region',{name:'Return for revision',exact:true}).getByRole('button',{name:'Return for revision',exact:true}).click();await expect(page.getByRole('button',{name:'Retry the same action',exact:true})).toBeVisible();}
 const original=await page.evaluate(()=>(globalThis as unknown as {returnProbe:{journal:{pending():unknown[]}}}).returnProbe.journal.pending());
 const before=await page.evaluate(()=>{const f=(globalThis as unknown as {returnProbe:{drafts:{model(slot:string):unknown};journal:{pending():unknown[]}}}).returnProbe;return{selected:f.drafts.model('school:actor:selected-staff-submission'),editor:f.drafts.model('school:actor:teacher-submission-editor:40000000-0000-4000-8000-000000000101'),pending:f.journal.pending().length}});
 await page.evaluate(kind=>(globalThis as unknown as {returnProbe:{release(kind:string):void}}).returnProbe.release(kind),nestedOutcome);
 if(nestedOutcome==='success')await expect(page.getByRole('region',{name:'Submitted work',exact:true}).getByText('Synthetic response',{exact:true})).toBeVisible();else await expect(page.getByRole('region',{name:'Submitted work',exact:true}).getByRole('alert')).toBeVisible();
 const afterNested=await page.evaluate(()=>{const f=(globalThis as unknown as {returnProbe:{drafts:{model(slot:string):unknown};journal:{pending():unknown[]}}}).returnProbe;return{selected:f.drafts.model('school:actor:selected-staff-submission')??null,editor:f.drafts.model('school:actor:teacher-submission-editor:40000000-0000-4000-8000-000000000101')??null,pending:f.journal.pending().length}});
 if(nestedOutcome!=='success')expect(await page.evaluate(()=>(globalThis as unknown as {returnProbe:{drafts:{get(slot:string):unknown}}}).returnProbe.drafts.get('school:actor:/v1/submissions/40000000-0000-4000-8000-000000000101/return'))).toBeUndefined();
 if(changed)await page.evaluate(()=>{Object.assign((globalThis as unknown as {returnProbe:{submission:Record<string,unknown>}}).returnProbe.submission,{revision:2,status:'RESUBMITTED',previousSubmissionId:'40000000-0000-4000-8000-000000000105',sourceReturnId:'40000000-0000-4000-8000-000000000106'});});
 await page.evaluate(()=>dispatchEvent(new Event('focus')));await expect(page.locator('[data-submission-choice] button[aria-current="true"]')).toHaveCount(1);
 await expect(page.getByRole('region',{name:'Submitted work',exact:true}).getByText('Synthetic response',{exact:true})).toBeVisible();
 const afterFocus={feedbackCount:await feedback.count(),selectedCount:await page.locator('.submission-section').count()};console.log(JSON.stringify({mode:'ACTUAL_LEARNING_QUERY_SOURCE_AND_ACTION_OWNERS_NO_NETWORK_WRITES',nestedOutcome,before,afterNested,afterFocus,errors}));
 expect(before.pending).toBe(pending?1:0);expect(afterNested.pending).toBe(pending?1:0);expect(afterFocus.selectedCount).toBe(1);expect(errors).toEqual([]);
 const remainsOpen=pending||nestedOutcome!=='denied'&&!changed;expect(afterFocus.feedbackCount).toBe(remainsOpen?1:0);
 if(remainsOpen){await expect(feedback).toHaveValue(pending||nestedOutcome==='success'&&typed?'Synthetic private unsent feedback':'');if(pending)await expect(feedback).toBeDisabled();}
 expect(await page.evaluate(()=>(globalThis as unknown as {returnProbe:{journal:{pending():unknown[]}}}).returnProbe.journal.pending())).toEqual(original);
 expect(await page.evaluate(()=>(globalThis as unknown as {returnProbe:{writes:number}}).returnProbe.writes)).toBe(pending?1:0);
});
