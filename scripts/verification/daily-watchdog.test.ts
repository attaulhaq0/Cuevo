import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';

const repository='attaulhaq0/Cuevo',sha='a'.repeat(40),olderSha='b'.repeat(40),workflowId=123,runId=42;
const now=Date.parse('2026-10-08T03:47:00Z'),firstExpectedDate='2026-10-07';
const yaml=createRequire(import.meta.url)('js-yaml') as {load(text:string):Record<string,unknown>;dump(value:unknown):string};
type Row=Record<string,unknown>;
async function owner() {
  let value:Row={};
  try {value=await import(pathToFileURL(resolve(import.meta.dirname,'daily-watchdog.ts')).href);}catch(error){if((error as NodeJS.ErrnoException).code!=='ERR_MODULE_NOT_FOUND')throw error;}
  assert.equal(typeof value.planDailyRegressionSlot,'function','daily watchdog must implement the approved UTC obligation owner');
  return value as {planDailyRegressionSlot:(now:number,date:string)=>Row;observeDailyRegression:(input:Row,transport:(url:string,init:RequestInit)=>Promise<Response>)=>Promise<Row>;readDailyWatchdogContext:(env:Record<string,string|undefined>,checkoutSha:string)=>Row;validateDailyWatchdogWorkflow:(text:string)=>string[];dailyWatchdogExitCode:(result:Row)=>number};
}
const repoRow=()=>({id:987,full_name:repository,default_branch:'main',url:`https://api.github.com/repos/${repository}`});
const workflow=()=>({id:workflowId,name:'Cuevo full regression',path:'.github/workflows/full-regression.yml',state:'active',url:`https://api.github.com/repos/${repository}/actions/workflows/${workflowId}`});
const run=(fields:Row={})=>({id:runId,run_attempt:1,workflow_id:workflowId,head_sha:olderSha,head_branch:'main',event:'schedule',path:'.github/workflows/full-regression.yml',status:'completed',conclusion:'success',
  created_at:'2026-10-08T00:19:00Z',updated_at:'2026-10-08T02:00:00Z',run_started_at:'2026-10-08T00:20:00Z',repository:{id:987,full_name:repository},head_repository:{id:987,full_name:repository},pull_requests:[],
  url:`https://api.github.com/repos/${repository}/actions/runs/${runId}`,html_url:`https://github.com/${repository}/actions/runs/${runId}`,...fields});
const jobNames=['technical-mvp','codeql-evidence','secret-scan','required'];
const jobs=()=>jobNames.map((name,index)=>({id:100+index,name,run_id:runId,head_sha:olderSha,workflow_name:'Cuevo full regression',status:'completed',conclusion:'success',started_at:'2026-10-08T00:20:00Z',completed_at:'2026-10-08T02:00:00Z',
  url:`https://api.github.com/repos/${repository}/actions/jobs/${100+index}`,html_url:`https://github.com/${repository}/actions/runs/${runId}/job/${100+index}`}));
async function fixture(options:{runs?:Row[];jobs?:Row[];mutate?:(url:URL,value:unknown,read:number)=>unknown;response?:(url:URL)=>Response;headers?:(url:URL)=>Record<string,string>}={}) {
  const fullWorkflowText=await readFile('.github/workflows/full-regression.yml','utf8'),calls:string[]=[],reads=new Map<string,number>();
  const input={repository,token:'synthetic-watchdog-token',checkoutSha:sha,now,firstExpectedDate,fullWorkflowText};
  const transport=async(raw:string,init:RequestInit)=>{
    calls.push(raw);const url=new URL(raw),read=(reads.get(url.pathname)??0)+1;reads.set(url.pathname,read);
    assert.equal(url.origin,'https://api.github.com');assert.equal(init.method,'GET');assert.equal(init.redirect,'error');assert.equal(init.credentials,'omit');assert.equal(init.cache,'no-store');
    assert.ok(init.signal);assert.equal((init.headers as Record<string,string>).Authorization,'Bearer synthetic-watchdog-token');
    let value:unknown;
    if(url.pathname===`/repos/${repository}`)value=repoRow();
    else if(url.pathname.endsWith('/git/ref/heads/main'))value={ref:'refs/heads/main',object:{type:'commit',sha}};
    else if(url.pathname.endsWith('/actions/workflows/full-regression.yml'))value=workflow();
    else if(url.pathname.endsWith(`/actions/workflows/${workflowId}/runs`)){const rows=options.runs??[run()];value={total_count:rows.length,workflow_runs:rows.slice((Number(url.searchParams.get('page'))-1)*100,Number(url.searchParams.get('page'))*100)};}
    else if(url.pathname.endsWith(`/actions/runs/${runId}`))value=(options.runs??[run()]).find(row=>row.id===runId)??run();
    else if(url.pathname.endsWith(`/actions/runs/${runId}/attempts/1/jobs`)){const rows=options.jobs??jobs();value={total_count:rows.length,jobs:rows};}
    else assert.fail('Unexpected metadata path');
    return options.response?.(url)??new Response(JSON.stringify(options.mutate?.(url,value,read)??value),{status:200,headers:{'content-type':'application/json',...options.headers?.(url)}});
  };
  return {input,transport,calls};
}

test('UTC overdue obligation survives new grace and rolls across day month year and exact deadline',async()=>{
  const api=await owner();
  for(const [clock,slot]of [['2026-10-08T00:16:59Z','2026-10-07T00:17:00.000Z'],['2026-10-08T00:17:00Z','2026-10-07T00:17:00.000Z'],['2026-10-08T03:16:59Z','2026-10-07T00:17:00.000Z'],['2026-10-08T03:17:00Z','2026-10-08T00:17:00.000Z'],['2026-11-01T00:47:00Z','2026-10-31T00:17:00.000Z'],['2027-01-01T00:47:00Z','2026-12-31T00:17:00.000Z']])assert.equal(api.planDailyRegressionSlot(Date.parse(clock),firstExpectedDate).slotUtc,slot);
  assert.equal(api.planDailyRegressionSlot(Date.parse('2026-10-07T03:16:59Z'),firstExpectedDate).state,'GRACE_PENDING');
  assert.equal(api.planDailyRegressionSlot(Date.parse('2026-10-07T03:17:00Z'),firstExpectedDate).slotUtc,'2026-10-07T00:17:00.000Z');
  for(const clock of [NaN,Infinity,-1,1.5])assert.throws(()=>api.planDailyRegressionSlot(clock,firstExpectedDate));
  for(const date of ['',undefined,'2026-02-30','2026-10-7','2026-10-07T00:00:00Z','2026-10-09'])assert.throws(()=>api.planDailyRegressionSlot(now,date as string));
});

test('bound daily latest attempt can succeed after main advances without borrowing current SHA or secrets',async()=>{
  const api=await owner(),f=await fixture(),result=await api.observeDailyRegression(f.input,f.transport);
  assert.equal(result.state,'REGRESSION_VERIFIED');assert.equal(result.testedSha,olderSha);assert.equal(result.currentMainSha,sha);assert.equal(result.deadlineMet,true);assert.equal(api.dailyWatchdogExitCode(result),0);
  assert.ok(f.calls.some(url=>url.endsWith('/attempts/1/jobs?per_page=100&page=1')));assert.equal(f.calls.filter(url=>new URL(url).pathname.endsWith('/runs/42')).length,2);
  const list=new URL(f.calls.find(url=>url.includes('/workflows/123/runs?'))!);assert.equal(list.searchParams.get('event'),'schedule');assert.equal(list.searchParams.get('branch'),'main');assert.equal(list.searchParams.has('head_sha'),false);assert.equal(list.searchParams.has('status'),false);
  assert.doesNotMatch(JSON.stringify(result),/synthetic-watchdog-token|PRIVATE|steps|actor/);
});

test('complete stable empty list means missing while API failures remain unknown and previous slot is checked during new grace',async()=>{
  const api=await owner(),empty=await fixture({runs:[]}),missing=await api.observeDailyRegression({...empty.input,now:Date.parse('2026-10-08T02:47:00Z')},empty.transport);
  assert.equal(missing.state,'MISSING');assert.equal(missing.slotUtc,'2026-10-07T00:17:00.000Z');assert.equal(api.dailyWatchdogExitCode(missing),1);
  for(const status of [403,404,429,503]){const f=await fixture({response:()=>new Response('PRIVATE TOKEN BODY',{status})}),result=await api.observeDailyRegression(f.input,f.transport);assert.equal(result.state,'UNVERIFIABLE');assert.doesNotMatch(JSON.stringify(result),/PRIVATE|TOKEN BODY/);}
});

test('newer failed or unfinished scheduled work supersedes older green and failure never becomes zero or healthy',async()=>{
  const api=await owner();
  for(const [status,conclusion,state]of [['completed','failure','REGRESSION_FAILED'],['completed','cancelled','REGRESSION_FAILED'],['completed','timed_out','REGRESSION_FAILED'],['completed','neutral','REGRESSION_FAILED'],['queued',null,'OVERDUE_PENDING'],['in_progress',null,'OVERDUE_PENDING'],['waiting',null,'OVERDUE_PENDING']]) {
    const current=run({status,conclusion}),f=await fixture({runs:[run({id:41,created_at:'2026-10-08T00:18:00Z',url:`https://api.github.com/repos/${repository}/actions/runs/41`,html_url:`https://github.com/${repository}/actions/runs/41`}),current]});
    const result=await api.observeDailyRegression(f.input,f.transport);assert.equal(result.state,state);assert.equal(result.runId,42);assert.equal(api.dailyWatchdogExitCode(result),1);
  }
});

test('latest attempt job proof requires all four exact successful full-regression gates',async()=>{
  const api=await owner();
  for(const altered of [jobs().filter(row=>row.name!=='technical-mvp'),[...jobs(),jobs()[0]],jobs().map(row=>row.name==='codeql-evidence'?{...row,name:'renamed-codeql'}:row),jobs().map(row=>row.name==='codeql-evidence'?{...row,conclusion:'skipped'}:row)]){const f=await fixture({jobs:altered});assert.notEqual((await api.observeDailyRegression(f.input,f.transport)).state,'REGRESSION_VERIFIED');}
  for(const conclusion of ['failure','cancelled','skipped','neutral',null]){const f=await fixture({jobs:jobs().map(row=>row.name==='required'?{...row,conclusion}:row)});assert.notEqual((await api.observeDailyRegression(f.input,f.transport)).state,'REGRESSION_VERIFIED');}
  for(const fields of [{run_id:43},{head_sha:sha},{workflow_name:'Other'},{html_url:'https://evil.invalid/'}]){const f=await fixture({jobs:jobs().map((row,index)=>index?row:{...row,...fields})});assert.equal((await api.observeDailyRegression(f.input,f.transport)).state,'UNVERIFIABLE');}
});

test('run identity attempt chronology source and stable-list changes are unverified rather than missing',async()=>{
  const api=await owner();
  for(const fields of [{workflow_id:124},{head_branch:'feature'},{event:'push'},{event:'workflow_dispatch'},{event:'pull_request'},{path:'.github/workflows/other.yml'},{path:'.github/workflows/full-regression.yml@feature'},{repository:{id:1,full_name:repository}},{head_repository:{id:987,full_name:'foreign/Cuevo'}},{pull_requests:[{}]},{created_at:'2026-10-08T04:00:00Z'},{updated_at:'2026-10-08T00:18:00Z'},{html_url:'https://github.com/foreign/Cuevo/actions/runs/42'}]){const f=await fixture({runs:[run(fields)]});assert.equal((await api.observeDailyRegression(f.input,f.transport)).state,'UNVERIFIABLE',JSON.stringify(fields));}
  for(const mode of ['attempt','conclusion','source','list']){const f=await fixture({mutate:(url,value,read)=>{if(mode==='list'&&url.pathname.endsWith('/runs')&&read>1)return{total_count:0,workflow_runs:[]};if(url.pathname.endsWith('/runs/42')&&read>1)return{...(value as Row),...(mode==='attempt'?{run_attempt:2}:mode==='source'?{head_sha:sha}:{conclusion:'failure'})};return value;}});assert.equal((await api.observeDailyRegression(f.input,f.transport)).state,'UNVERIFIABLE');}
});

test('late success preserves recovered-late truth and run updated_at cannot fake completion time',async()=>{
  const api=await owner(),f=await fixture({runs:[run({updated_at:'2026-10-08T03:40:00Z'})],jobs:jobs().map(row=>({...row,completed_at:'2026-10-08T03:30:00Z'}))}),result=await api.observeDailyRegression(f.input,f.transport);
  assert.equal(result.state,'REGRESSION_VERIFIED');assert.equal(result.deadlineMet,false);assert.equal(result.recoveredLate,true);
  const onTime=await fixture({runs:[run({updated_at:'2026-10-08T03:40:00Z'})]});assert.equal((await api.observeDailyRegression(onTime.input,onTime.transport)).deadlineMet,true);
});

test('pagination bounds duplicates malformed JSON oversized streams and foreign links cannot produce missing or success',async()=>{
  const api=await owner();
  for(const value of [{total_count:1001,workflow_runs:[]},{total_count:1,workflow_runs:[]},{total_count:2,workflow_runs:[run(),run()]}]){const f=await fixture({mutate:(url,original)=>url.pathname.endsWith('/runs')?value:original});assert.equal((await api.observeDailyRegression(f.input,f.transport)).state,'UNVERIFIABLE');}
  for(const link of ['<https://evil.invalid/runs?page=2>; rel="next"',`<https://api.github.com/repos/${repository}/actions/workflows/123/runs?branch=feature&page=2>; rel="next"`]){const f=await fixture({headers:(url):Record<string,string>=>url.pathname.endsWith('/runs')?{link}:{}});assert.equal((await api.observeDailyRegression(f.input,f.transport)).state,'UNVERIFIABLE');}
  for(const response of [()=>new Response('{PRIVATE',{headers:{'content-type':'application/json'}}),()=>new Response('{}',{headers:{'content-type':'application/json','content-length':'3000000'}}),()=>new Response('{}',{status:302,headers:{location:'https://evil.invalid/'}})]){const f=await fixture({response});assert.equal((await api.observeDailyRegression(f.input,f.transport)).state,'UNVERIFIABLE');}
});

test('trusted main context checks precede token access and missing activation is configuration review',async()=>{
  const api=await owner(),env={CI:'true',GITHUB_ACTIONS:'true',RUNNER_ENVIRONMENT:'github-hosted',GITHUB_SERVER_URL:'https://github.com',GITHUB_API_URL:'https://api.github.com',GITHUB_REPOSITORY:repository,GITHUB_REF:'refs/heads/main',GITHUB_SHA:sha,GITHUB_WORKFLOW_SHA:sha,GITHUB_JOB:'watchdog',GITHUB_WORKFLOW:'Cuevo daily regression watchdog',GITHUB_WORKFLOW_REF:`${repository}/.github/workflows/daily-watchdog.yml@refs/heads/main`,GITHUB_EVENT_NAME:'schedule',CUEVO_WATCHDOG_SCHEDULE:'47 * * * *',CUEVO_DAILY_REGRESSION_FIRST_EXPECTED_DATE:firstExpectedDate,GH_TOKEN:'synthetic-watchdog-token'};
  assert.equal(api.readDailyWatchdogContext(env,sha).repository,repository);
  for(const fields of [{GITHUB_REPOSITORY:'foreign/Cuevo'},{GITHUB_REF:'refs/heads/feature'},{GITHUB_EVENT_NAME:'pull_request'},{CUEVO_WATCHDOG_SCHEDULE:'17 0 * * *'},{GITHUB_SHA:olderSha},{GITHUB_WORKFLOW_SHA:undefined},{GITHUB_WORKFLOW_SHA:olderSha},{GITHUB_JOB:'codeql'},{NODE_OPTIONS:'--import evil'}]){let tokenRead=false;const unsafe={...env,...fields};Object.defineProperty(unsafe,'GH_TOKEN',{get(){tokenRead=true;throw Error('PRIVATE TOKEN');}});assert.throws(()=>api.readDailyWatchdogContext(unsafe,sha));assert.equal(tokenRead,false);}
  for(const date of [undefined,'','2026-02-30']){const f=await fixture();const result=await api.observeDailyRegression({...f.input,firstExpectedDate:date},f.transport);assert.equal(result.state,'CONFIGURATION_REVIEW');assert.equal(f.calls.length,0);assert.equal(api.dailyWatchdogExitCode(result),1);}
});

test('watchdog workflow is distinct main-only fixed hourly/manual reader with exact public activation variable and no writes',async()=>{
  const api=await owner(),text=await readFile('.github/workflows/daily-watchdog.yml','utf8');assert.deepEqual(api.validateDailyWatchdogWorkflow(text),[]);
  const flow=yaml.load(text);assert.equal(flow.name,'Cuevo daily regression watchdog');assert.deepEqual(flow.on,{schedule:[{cron:'47 * * * *'}],workflow_dispatch:null});assert.deepEqual(flow.permissions,{contents:'read',actions:'read'});
  for(const mutate of [(row:Row)=>{row.on={push:null};},(row:Row)=>{row.permissions={contents:'read',actions:'write'};},(row:Row)=>{row.env={GH_TOKEN:'${{ secrets.PAT }}'};},(row:Row)=>{(row.concurrency as Row)['cancel-in-progress']=true;},(row:Row)=>{const job=((row.jobs as Row).watchdog as Row);job.if='always()';},(row:Row)=>{const job=((row.jobs as Row).watchdog as Row);(job.steps as Row[]).push({run:'gh run rerun 42'});}]){const altered=yaml.load(text);mutate(altered);assert.ok(api.validateDailyWatchdogWorkflow(yaml.dump(altered)).length>0);}
});

test('actual documented job links and optional workflow names retain endpoint-bound identity',async()=>{
  const api=await owner(),actualJobs=jobs().map(row=>{const value={...row,html_url:`https://github.com/${repository}/runs/${runId}/jobs/${row.id}`};delete (value as Row).workflow_name;return value;});
  const f=await fixture({jobs:actualJobs});assert.equal((await api.observeDailyRegression(f.input,f.transport)).state,'REGRESSION_VERIFIED');
});

test('half-open slot window includes next-midnight delayed work and excludes exact next-slot creation',async()=>{
  const api=await owner(),clock=Date.parse('2026-10-08T03:16:00Z');
  const late=run({created_at:'2026-10-08T00:16:00Z',run_started_at:'2026-10-08T00:16:10Z'}),f=await fixture({runs:[late]});
  assert.equal((await api.observeDailyRegression({...f.input,now:clock},f.transport)).state,'REGRESSION_VERIFIED');
  const next=await fixture({runs:[run({created_at:'2026-10-08T00:17:00Z'})]});assert.equal((await api.observeDailyRegression({...next.input,now:clock},next.transport)).state,'MISSING');
});

test('provider rows outside the requested time range are unavailable rather than an invented empty window',async()=>{
  const api=await owner(),f=await fixture({runs:[run({created_at:'2026-10-07T23:59:59Z'})]});
  assert.equal((await api.observeDailyRegression(f.input,f.transport)).state,'UNVERIFIABLE');
});

test('valid complete pagination finds newest later-page scheduled failure and preserves every original filter',async()=>{
  const api=await owner(),older=Array.from({length:100},(_,index)=>run({id:1000+index,created_at:'2026-10-08T00:18:00Z',url:`https://api.github.com/repos/${repository}/actions/runs/${1000+index}`,html_url:`https://github.com/${repository}/actions/runs/${1000+index}`}));
  const f=await fixture({runs:[...older,run({conclusion:'failure'})],headers:(url):Record<string,string>=>{if(!url.pathname.endsWith('/runs')||url.searchParams.get('page')!=='1')return{};const next=new URL(url);next.searchParams.set('page','2');return{link:`<${next}>; rel="next"`};}});
  const result=await api.observeDailyRegression(f.input,f.transport);assert.equal(result.state,'REGRESSION_FAILED');assert.equal(result.runId,42);assert.equal(f.calls.filter(url=>url.includes('page=2')).length,2);
});

test('stalled transport/body and streamed oversize cancel reads without leaking raw errors',async()=>{
  const api=await owner(),f=await fixture();
  let stalledCancelled=false,requestSignal:AbortSignal|undefined;
  const transport=async(_url:string,init:RequestInit)=>{requestSignal=init.signal as AbortSignal;return new Response(new ReadableStream<Uint8Array>({pull:()=>new Promise(()=>{}),cancel(){stalledCancelled=true;}}),{headers:{'content-type':'application/json'}});};
  const stalled=await api.observeDailyRegression(f.input,transport);assert.equal(stalled.state,'UNVERIFIABLE');assert.equal(requestSignal?.aborted,true);assert.equal(stalledCancelled,true);
  let cancelled=false;const huge=await fixture({response:()=>new Response(new ReadableStream<Uint8Array>({pull(controller){controller.enqueue(new Uint8Array(3*1024*1024));},cancel(){cancelled=true;}}),{headers:{'content-type':'application/json'}})});
  assert.equal((await api.observeDailyRegression(huge.input,huge.transport)).state,'UNVERIFIABLE');assert.equal(cancelled,true);
  assert.equal((await api.observeDailyRegression(f.input,async()=>{throw Error('PRIVATE TOKEN CANARY');})).state,'UNVERIFIABLE');
});

test('workflow inactivity default-branch drift and raw source changes require configuration review',async()=>{
  const api=await owner();
  for(const mode of ['state','branch']){const f=await fixture({mutate:(url,value)=>mode==='state'&&url.pathname.endsWith('/full-regression.yml')?{...(value as Row),state:'disabled_inactivity'}:mode==='branch'&&url.pathname===`/repos/${repository}`?{...(value as Row),default_branch:'other'}:value});assert.equal((await api.observeDailyRegression(f.input,f.transport)).state,'CONFIGURATION_REVIEW');}
  const f=await fixture();for(const fullWorkflowText of [f.input.fullWorkflowText.replace("cron: '17 0 * * *'","cron: '17 3 * * *'"),f.input.fullWorkflowText.replaceAll('if: always()','if: success()')]){const result=await api.observeDailyRegression({...f.input,fullWorkflowText},f.transport);assert.equal(result.state,'CONFIGURATION_REVIEW');assert.equal(f.calls.length,0);}
});

test('full source aggregate or security command tampering refuses observation before token use',async()=>{
  const api=await owner(),f=await fixture();
  for(const name of ['Require every full regression boundary','Verify canonical same-source security','Scan full history plus authored worktree']){
    const changed=yaml.load(f.input.fullWorkflowText),jobs=(changed.jobs as Row);
    const step=Object.values(jobs).flatMap(job=>(job as Row).steps as Row[]).find(row=>row.name===name)!;
    step.run='true';
    const result=await api.observeDailyRegression({...f.input,fullWorkflowText:yaml.dump(changed)},f.transport);
    assert.equal(result.state,'CONFIGURATION_REVIEW',name);assert.equal(f.calls.length,0);
  }
});

test('all four full-regression jobs require bound completion times and selected latest attempt',async()=>{
  const api=await owner();
  for(const fields of [{started_at:null,completed_at:'2026-10-07T00:00:00Z'},{completed_at:'2026-10-08T02:01:00Z'},{started_at:null,completed_at:null},{run_attempt:2}]){const f=await fixture({jobs:jobs().map(row=>row.name==='required'?{...row,...fields}:row)});assert.equal((await api.observeDailyRegression(f.input,f.transport)).state,'UNVERIFIABLE');}
  const race=await fixture({mutate:(url,value,read)=>url.pathname.endsWith('/runs/42')&&read>1?{...(value as Row),run_attempt:2}:value});
  const result=await api.observeDailyRegression(race.input,race.transport);assert.equal(result.state,'UNVERIFIABLE');assert.equal(result.deadlineMet,null);assert.equal(result.recoveredLate,null);
});
