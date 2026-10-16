import {test,expect} from '@playwright/test';import{build}from'esbuild';import{readFileSync}from'node:fs';import{resolve}from'node:path';const root=resolve(import.meta.dirname,'../..');
/** The actual Progress, class-summary, query and source parsers run. Only the
 * current session is controlled; fake HTTP retains exact source context. */
async function mount(page:import('@playwright/test').Page,pagedPeople=false){const built=await build({stdin:{resolveDir:root,loader:'tsx',contents:"\nimport React,{createContext,useContext,useState}from'react';import{createRoot}from'react-dom/client';import{ProgressWorkspace}from'./apps/web/features/progress/components/progress-workspace';import{getDictionary}from'./apps/web/shared/i18n/locale';import{CommandJournal}from'./apps/web/shared/api/client';import{FormDrafts}from'./apps/web/shared/session/form-drafts';const C=createContext(null);globalThis.progressRaceC=C;globalThis.progressRaceUC=useContext;const id=n=>'f9000000-0000-4000-8000-'+String(n).padStart(12,'0'),school=id(1),teacher=id(2),learner=id(12),classId=id(3),journal=new CommandJournal(),drafts=new FormDrafts(),probe=globalThis.progressRace={events:[],writes:[],reads:[]};function Harness(){const[locale,setLocale]=useState('en'),[generation,setGeneration]=useState(1),[token,setToken]=useState('synthetic-current-token');probe.change=v=>{if(v.locale){setLocale(v.locale);document.documentElement.lang=v.locale;document.documentElement.dir=v.locale==='ar'?'rtl':'ltr';}if(v.generation)setGeneration(v.generation);if(v.token)setToken(v.token)};const app={locale,dictionary:getDictionary(locale),membership:{schoolId:school,userId:teacher,role:globalThis.progressPeopleRefresh?'coordinator':'teacher',displayName:'Current teacher',entitlements:['learner.state','learning','assessment','curriculum']},status:'ready',online:true,apiUrl:'https://progress-race.fixture.invalid',accessToken:token,accessGeneration:generation,commandJournal:journal,formDrafts:drafts,publicConfig:{apiUrl:'',supabaseUrl:'',supabasePublishableKey:''},announce(){},reportDiagnostic(){},refreshAccess(){setGeneration(x=>x+1)}};return<C.Provider value={app}><main className='workspace'><ProgressWorkspace/></main></C.Provider>}createRoot(document.getElementById('root')).render(<Harness/>);globalThis.fetch=async(raw,options)=>{const u=new URL(String(raw));probe.reads.push(u.pathname);probe.events.push({event:'read',path:u.pathname,at:performance.now()});if(options?.method==='POST'){probe.writes.push(u.pathname);throw Error('No writes');}let value={items:[],nextCursor:null};if(u.pathname==='/v1/people'){const current={userId:learner,displayName:'Lina Al-Kuwari',role:'student',classLabels:['Year 1 · Cedar · Year 1 · 2026–2027']};if(globalThis.progressPeopleRefresh){const staff=Array.from({length:132},(_,i)=>({userId:id(1000+i),displayName:'Demo staff '+i,role:'teacher',classLabels:[]}));value=u.searchParams.has('cursor')?{items:staff.slice(99),nextCursor:null}:{items:[current,...staff.slice(0,99)],nextCursor:id(1098)};}else value={items:[current],nextCursor:null};}if(u.pathname==='/v1/classes')value={items:[{id:classId,name:'Year 1 · Cedar',academicYearName:'2026–2027',yearGroupName:'Year 1'}],nextCursor:null};if(u.pathname.endsWith('/learning-summary'))value={schoolId:school,classId,generatedAt:'2026-10-07T00:00:00Z',scope:'CURRENT_CLASS_PAGE',coverage:'NOT_ESTABLISHED',observationCoverage:'RECORDED_ONLY',windowStart:null,windowEnd:null,items:[{learnerId:learner,learnerName:'Lina Al-Kuwari',academic:{numericCount:0,rubricCount:0,sources:[],moreSources:false},observed:{practice:{count:null,observationIds:[],moreSourceIds:false},revision:{count:null,observationIds:[],moreSourceIds:false},reflection:{count:null,observationIds:[],moreSourceIds:false}},support:{assignedCount:0,completedCount:0,measuredCount:0,interventionIds:[]},outcomes:{improvedCount:0,noMeaningfulChangeCount:0,inconclusiveCount:0,measurementIds:[]}}],nextCursor:null};if(u.pathname.endsWith('/state'))value={learnerId:learner,status:'UNKNOWN',generatedAt:null,version:null,academic:[],development:{practice:{count:null,observationIds:[]},revision:{count:null,observationIds:[]},reflection:{count:null,observationIds:[]},windowStart:null,windowEnd:null},engagement:{completedActivityCount:null,lastCompletedAt:null},support:{activeInterventionIds:[],items:[]},impact:{status:'unmeasured',measurementIds:[],outcomes:[]},sourceEventIds:[]};if(u.pathname==='/v1/attention-policy')value={policy:null};return new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json'}})};\n"},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',plugins:[{name:'current-progress-session-only',setup(b){b.onLoad({filter:/shared[\\/]session[\\/]providers\.tsx$/},()=>({loader:'js',contents:'export function useApp(){return globalThis.progressRaceUC(globalThis.progressRaceC)}'}));b.onLoad({filter:/\.(webp|svg|png)$/},a=>({loader:'js',contents:'export default '+JSON.stringify({src:'data:image/webp;base64,'+readFileSync(a.path).toString('base64'),width:128,height:128})}));}}]});await page.route('**/*',r=>r.abort());await page.setContent('<html lang="en"><head><title>Current Progress Back focus ownership</title></head><body><div id="root"></div></body></html>');await page.evaluate(value=>{(globalThis as unknown as{progressPeopleRefresh:boolean}).progressPeopleRefresh=value;},pagedPeople);await page.addStyleTag({content:readFileSync(resolve(root,'packages/ui/src/tokens.css'),'utf8')});await page.addScriptTag({content:built.outputFiles[0].text});}
for(const mode of ['new-current-focus','default-back']as const)test(mode==='new-current-focus'?'deferred Back focus cannot override a newly focused current learner opener':'Back retains its default browse focus when no later user focus exists',async({page})=>{const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await mount(page);await page.getByLabel('Class',{exact:true}).selectOption({label:'Year 1 · Cedar · Year 1 · 2026–2027'});const row=page.locator('[data-class-learner-id]').filter({has:page.getByRole('heading',{name:'Lina Al-Kuwari',exact:true})});await row.getByRole('button',{name:'Review this learner',exact:true}).focus();await page.keyboard.press('Enter');await expect(page.locator('.learner-detail-heading')).toBeFocused();
// Refresh replaces the remembered original row node while keeping the same
// selected learner and exact class/actor/source basis.
const originalOpener=await row.getByRole('button',{name:'Review this learner',exact:true}).elementHandle();expect(originalOpener).not.toBeNull();
await page.evaluate(()=>{
 const originalFetch=globalThis.fetch;let holdNext=true;
 const probe=globalThis as unknown as{releaseCurrentSummary?:()=>void};
 globalThis.fetch=async(input,init)=>{
  const response=await originalFetch(input,init);
  if(holdNext&&new URL(String(input)).pathname.endsWith('/learning-summary')){
   holdNext=false;await new Promise<void>(release=>{probe.releaseCurrentSummary=release;});
  }
  return response;
 };
});
await page.getByRole('button',{name:'Refresh learner state',exact:true}).click();
await expect(row).toHaveCount(0);await expect.poll(()=>originalOpener!.evaluate(node=>node.isConnected)).toBe(false);
await expect.poll(()=>page.evaluate(()=>typeof(globalThis as unknown as{releaseCurrentSummary?:()=>void}).releaseCurrentSummary)).toBe('function');
await page.evaluate(()=>(globalThis as unknown as{releaseCurrentSummary:()=>void}).releaseCurrentSummary());
await expect(row).toHaveCount(1);await expect(page.locator('.learner-detail-heading')).toHaveCount(1);await page.setViewportSize({width:390,height:844});await page.evaluate(()=>(globalThis as unknown as {progressRace:{change:(v:object)=>void}}).progressRace.change({locale:'ar'}));
await page.evaluate(()=>{const native=requestAnimationFrame;(globalThis as unknown as {backNativeFrame:typeof requestAnimationFrame}).backNativeFrame=native;window.requestAnimationFrame=callback=>{const token=native(time=>{(globalThis as unknown as {releaseCurrentBackFrame?:()=>void}).releaseCurrentBackFrame=()=>callback(time)});return token;};});await page.getByRole('button',{name:'العودة إلى الطلاب',exact:true}).click();await expect(page.locator('.learner-detail-heading')).toHaveCount(0);await expect.poll(()=>page.evaluate(()=>typeof(globalThis as unknown as {releaseCurrentBackFrame?:()=>void}).releaseCurrentBackFrame)).toBe('function');
const opener=row.getByRole('button',{name:'مراجعة هذا الطالب',exact:true});await expect(opener).toBeEnabled();if(mode==='new-current-focus'){await opener.focus();await expect(opener).toBeFocused();}await page.evaluate(()=>{window.requestAnimationFrame=(globalThis as unknown as {backNativeFrame:typeof requestAnimationFrame}).backNativeFrame;(globalThis as unknown as {releaseCurrentBackFrame:()=>void}).releaseCurrentBackFrame();});
if(mode==='default-back'){await expect(page.locator('#learner-selection')).toBeFocused();await opener.focus();}else await expect(opener).toBeFocused();await page.keyboard.press('Enter');const heading=page.getByRole('heading',{level:2,name:/^شواهد الطالب الحالي · Lina Al-Kuwari(?: ·|$)/});await expect(heading).toBeFocused();expect(errors).toEqual([]);expect(await page.evaluate(()=>(globalThis as unknown as {progressRace:{writes:string[]}}).progressRace.writes)).toEqual([]);});

async function chooseCompleteDirectoryLearner(page:import('@playwright/test').Page){
 const select=page.locator('#learner-selection');
 await expect(select).toBeDisabled();
 await page.getByRole('button',{name:'Load more',exact:true}).click();
 await expect(select).toBeEnabled();
 await select.focus();await page.keyboard.press('Home');await page.keyboard.press('ArrowDown');await page.keyboard.press('Tab');
 await expect(select).toHaveValue('f9000000-0000-4000-8000-000000000012');
 return select;
}
for(const locale of ['en','ar']as const)test(`${locale}: current selected learner rereads only its previously requested directory depth after access revalidation`,async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await mount(page,true);const select=await chooseCompleteDirectoryLearner(page);
 const before=await page.evaluate(()=>(globalThis as unknown as{progressRace:{reads:string[]}}).progressRace.reads.filter(path=>path.startsWith('/v1/people')).length);expect(before).toBe(2);
 if(locale==='ar'){await page.setViewportSize({width:320,height:844});await page.evaluate(()=>(globalThis as unknown as{progressRace:{change:(value:object)=>void}}).progressRace.change({locale:'ar'}));}
 await page.evaluate(()=>(globalThis as unknown as{progressRace:{change:(value:object)=>void}}).progressRace.change({generation:2}));
 await expect(select).toHaveValue('f9000000-0000-4000-8000-000000000012');await expect(select).toBeEnabled();
 expect(await page.evaluate(()=>(globalThis as unknown as{progressRace:{reads:string[]}}).progressRace.reads.filter(path=>path.startsWith('/v1/people')).length)).toBe(4);
 expect(await page.evaluate(()=>(globalThis as unknown as{progressRace:{writes:string[]}}).progressRace.writes)).toEqual([]);expect(errors).toEqual([]);
 await page.screenshot({path:info.outputPath(`current-learner-${locale}.png`),fullPage:true});
});
test('clearing the directory learner does not replay its old page depth on access revalidation',async({page})=>{
 await mount(page,true);const select=await chooseCompleteDirectoryLearner(page);
 await select.focus();await page.keyboard.press('Home');await page.keyboard.press('Tab');await expect(select).toHaveValue('');
 await page.evaluate(()=>(globalThis as unknown as{progressRace:{change:(value:object)=>void}}).progressRace.change({generation:2}));
 await expect.poll(()=>page.evaluate(()=>(globalThis as unknown as{progressRace:{reads:string[]}}).progressRace.reads.filter(path=>path.startsWith('/v1/people')).length)).toBe(3);
 await expect(select).toBeDisabled();await expect(select).toHaveValue('');
 expect(await page.evaluate(()=>(globalThis as unknown as{progressRace:{writes:string[]}}).progressRace.writes)).toEqual([]);
});

test('directory growth beyond the previously read depth still requires explicit continuation',async({page})=>{
 await mount(page,true);const select=await chooseCompleteDirectoryLearner(page);
 await page.evaluate(()=>{
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async(input,init)=>{
   const response=await originalFetch(input,init),url=new URL(String(input));
   if(url.pathname==='/v1/people'&&url.searchParams.has('cursor')){
    const payload=await response.json();
    payload.nextCursor=url.searchParams.get('cursor')==='f9000000-0000-4000-8000-000000001098'?'f9000000-0000-4000-8000-000000001131':null;
    return new Response(JSON.stringify(payload),{status:200,headers:{'Content-Type':'application/json'}});
   }
   return response;
  };
  (globalThis as unknown as{progressRace:{change:(value:object)=>void}}).progressRace.change({generation:2});
 });
 await expect(page.getByRole('button',{name:'Load more',exact:true})).toHaveAttribute('data-page-cursor','f9000000-0000-4000-8000-000000001131');
 await expect(select).toBeDisabled();await expect(select).toHaveValue('');
 expect(await page.evaluate(()=>(globalThis as unknown as{progressRace:{reads:string[]}}).progressRace.reads.filter(path=>path==='/v1/people').length)).toBe(4);
 await page.getByRole('button',{name:'Load more',exact:true}).click();await expect(select).toBeEnabled();
 await expect(select).toHaveValue('f9000000-0000-4000-8000-000000000012');
 expect(await page.evaluate(()=>(globalThis as unknown as{progressRace:{reads:string[]}}).progressRace.reads.filter(path=>path==='/v1/people').length)).toBe(5);
});

test('a denied continuation stops automatic rereading until the user retries the current page',async({page})=>{
 await mount(page,true);const select=await chooseCompleteDirectoryLearner(page);
 await page.evaluate(()=>{
  const originalFetch=globalThis.fetch;let denyNext=true;
  globalThis.fetch=async(input,init)=>{
   const response=await originalFetch(input,init),url=new URL(String(input));
   if(denyNext&&url.pathname==='/v1/people'&&url.searchParams.has('cursor')){
    denyNext=false;return new Response(JSON.stringify({code:'FORBIDDEN'}),{status:403,headers:{'Content-Type':'application/json'}});
   }
   return response;
  };
  (globalThis as unknown as{progressRace:{change:(value:object)=>void}}).progressRace.change({generation:2});
 });
 await expect(page.locator('.pagination-actions [role="alert"]')).toHaveCount(1);
 await expect(select).toBeDisabled();await expect(select).toHaveValue('');
 expect(await page.evaluate(()=>(globalThis as unknown as{progressRace:{reads:string[]}}).progressRace.reads.filter(path=>path==='/v1/people').length)).toBe(4);
 await page.getByRole('button',{name:'Load more',exact:true}).click();await expect(select).toBeEnabled();
 await expect(select).toHaveValue('f9000000-0000-4000-8000-000000000012');
 expect(await page.evaluate(()=>(globalThis as unknown as{progressRace:{writes:string[]}}).progressRace.writes)).toEqual([]);
});

test('a changed access token clears the old directory read intent',async({page})=>{
 await mount(page,true);const select=await chooseCompleteDirectoryLearner(page);
 await page.evaluate(()=>(globalThis as unknown as{progressRace:{change:(value:object)=>void}}).progressRace.change({token:'synthetic-replacement-token'}));
 await expect(page.getByRole('button',{name:'Load more',exact:true})).toBeEnabled();
 await expect(select).toBeDisabled();await expect(select).toHaveValue('');
 expect(await page.evaluate(()=>(globalThis as unknown as{progressRace:{reads:string[]}}).progressRace.reads.filter(path=>path==='/v1/people').length)).toBe(3);
 expect(await page.evaluate(()=>(globalThis as unknown as{progressRace:{writes:string[]}}).progressRace.writes)).toEqual([]);
});
