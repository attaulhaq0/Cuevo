import {createHash} from 'node:crypto';
import {lstatSync,readFileSync,realpathSync} from 'node:fs';
import {isAbsolute,join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
import {z} from 'zod';
import {canonicalReleaseExecutionJson} from './release-review';

export const SOURCE_TEST_COHORT_FILE='scripts/database/hosted-schema-continuation-executor.test.ts';
const titles=[
 'controlled continuation executor runs source-locked bounded children to230 under one stage journal per owner',
 'controlled continuation executor stops an unknown child without later consumption or automatic retry',
 'controlled continuation refuses late child-file drift after admission before its CLI consumer',
 'controlled continuation lock-release failure downgrades the current stage and never authorizes replay',
 'version two schema-and-accounts null fingerprints continue under actual native pairing with historical completion unchanged',
 'all prepared children receive cleanup even when the first child disposal is unconfirmed',
 'selected original native intent uses one current-authorized CLI and unchanged original journal before ordinary continuation',
 'selected original intent rejects changed retained selection bytes before native lease or CLI',
 'selected original intent rejects partial native catalogue at history123 without replacement intent',
 'selected original intent preserves original COMMITTED link when installed marker becomes unknown',
 'selected original intent refuses an existing changed local record without overwriting it',
 'selected original intent refuses an unknown CLI outcome and never resumes the no-SQL path',
 'genuine original core token revoked during awaited journal read admits zero CLI and no terminal record',
 'genuine original core token lost after CLI preserves unknown effect and refuses committed publication',
 'graduated native execution preserves the actual fresh terminal proof link after a long original CLI',
 'genuine admitted terminal acknowledgement preserves confirmed commitment when original authority expires during readback',
 'fresh selector-free package verifies the original linked native receipt and resumes only later stages',
 'current official admission cannot substitute another selected original intent fingerprint',
 'next-stage batch construction refusal preserves acknowledged native commit and actual lease cleanup',
 'unknown original CLI without a terminal journal cannot replay from a fresh current package',
 'durable original attempt reservation uncertainty cannot reach SQL or be reused',
 'one owned prepared admission handle spans original child work and is disposed after native cleanup',
 'original successful child exit stays distinct from a later official admission failure',
 'selected child144 reconciliation cannot enter native work without its exact protected context',
 'held residual child144 execution skips the installed20 files and confirms only remaining164 180 and231 work',
] as const;
const children=['COMMIT_REPLY_LOST','READBACK_MISMATCH','LEASE_LOST_AFTER_CREATE'] as const;
const assignments=[
 {id:'continuation-1',ordinals:[6,12,17,22,24]},
 {id:'continuation-2',ordinals:[2,7,11,14,19]},
 {id:'continuation-3',ordinals:[9,15,20,23,25]},
 {id:'continuation-4',ordinals:[1,3,8,10,21]},
 {id:'continuation-5',ordinals:[4,5,13,16,18]},
] as const;
export const SOURCE_TEST_COHORT_IDS=assignments.map(row=>row.id);
const digest=z.string().regex(/^[a-f0-9]{64}$/),time=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),duration=z.number().finite().min(0).max(86400000),count=z.number().int().nonnegative().max(10000),positive=z.number().int().positive().max(1000000);
const identitySchema=z.object({sourceSha:z.string().regex(/^[a-f0-9]{40}$/),treeSha:z.string().regex(/^[a-f0-9]{40}$/),sourceLockSha256:digest,nodeVersion:z.string().regex(/^v24[.][0-9]+[.][0-9]+$/),runId:z.string().regex(/^[1-9][0-9]{0,18}$/).nullable(),runAttempt:z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable(),scope:z.literal('source-contracts'),partitionSha256:digest}).strict().refine(value=>(value.runId===null)===(value.runAttempt===null));
const caseSchema=z.object({titleSha256:digest,suiteSha256:digest.nullable(),line:positive,column:positive,nesting:count.max(1),testNumber:positive,startedAtMs:time,completedAtMs:time,durationMs:duration,outcome:z.literal('PASSED')}).strict();
const countsSchema=z.object({tests:count,passed:count,failed:z.literal(0),cancelled:z.literal(0),skipped:z.literal(0),todo:z.literal(0),suites:z.literal(0),topLevel:count}).strict();
const summarySchema=z.object({counts:countsSchema,durationMs:duration,success:z.literal(true)}).strict();
const fileReportSchema=z.object({path:z.literal(SOURCE_TEST_COHORT_FILE),sha256:digest,startedAtMs:time,completedAtMs:time,durationMs:duration,summary:summarySchema,cases:z.array(caseSchema).min(1).max(28),suites:z.array(z.never()).max(0)}).strict();
const reportSchema=z.object({version:z.literal(1),purpose:z.literal('CUEVO_CI_TEST_TIMINGS'),status:z.literal('PASSED'),effectAuthority:z.literal(false),timeTargetAchieved:z.literal(false),fileBytesConfirmed:z.literal(true),observationBasis:z.literal('SUPPLIED_NODE_EVENT_STREAM'),identity:identitySchema,startedAtMs:time,completedAtMs:time,reasons:z.array(z.never()).max(0),summary:summarySchema,files:z.array(fileReportSchema).length(1)}).strict();
const inventorySchema=z.object({ordinal:positive.max(25),titleSha256:digest,sourceLine:positive,sourceColumn:positive,children:z.array(digest).max(3)}).strict();
const cohortSchema=z.object({id:z.enum(['continuation-1','continuation-2','continuation-3','continuation-4','continuation-5']),pattern:z.string().min(1).max(4096),ordinals:z.array(positive.max(25)).min(1).max(25),expectedTopLevel:positive.max(25),expectedCases:positive.max(28)}).strict();
const planSchema=z.object({version:z.literal(1),purpose:z.literal('CUEVO_CLOSED_CONTINUATION_TEST_COHORTS'),file:z.object({path:z.literal(SOURCE_TEST_COHORT_FILE),sha256:digest}).strict(),policySha256:digest,inventorySha256:digest,inventory:z.array(inventorySchema).length(25),cohorts:z.array(cohortSchema).length(5)}).strict();
export type SourceTestCohortPlan=z.infer<typeof planSchema>;
const receiptBodySchema=z.object({version:z.literal(1),purpose:z.literal('CUEVO_SOURCE_TEST_COHORT'),id:cohortSchema.shape.id,identity:identitySchema,file:z.object({path:z.literal(SOURCE_TEST_COHORT_FILE),sha256:digest}).strict(),policySha256:digest,inventorySha256:digest,commandSha256:digest,reportSha256:digest,reportStartedAtMs:time,reportCompletedAtMs:time,reportSummary:summarySchema,startedAtMs:time,completedAtMs:time,durationMs:duration,exitCode:z.literal(0),signal:z.null(),cleanupConfirmed:z.literal(true),summary:summarySchema,cases:z.array(caseSchema).min(1).max(28)}).strict();
export const sourceTestCohortReceiptSchema=receiptBodySchema.extend({receiptSha256:digest}).strict();
export type SourceTestCohortReceipt=z.infer<typeof sourceTestCohortReceiptSchema>;
export const sourceTestCohortEvidenceSchema=z.object({version:z.literal(1),purpose:z.literal('CUEVO_SOURCE_TEST_COHORT_UNION'),file:z.object({path:z.literal(SOURCE_TEST_COHORT_FILE),sha256:digest}).strict(),policySha256:digest,inventorySha256:digest,receipts:z.array(sourceTestCohortReceiptSchema).length(5)}).strict();
const failure=()=>Error('Closed continuation test cohort evidence requires review; private contents withheld.'),hash=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex'),same=(a:unknown,b:unknown)=>canonicalReleaseExecutionJson(a)===canonicalReleaseExecutionJson(b);
const escaped=(value:string)=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const pattern=(ordinals:readonly number[])=>'^(?:'+ordinals.map(number=>escaped(titles[number-1])).join('|')+')$';
const commandDescriptor=(selectedPattern:string)=>['--import','<REPO_ROOT>/node_modules/tsx/dist/loader.mjs','--test','--test-name-pattern='+selectedPattern,'--test-reporter=<REPO_ROOT>/scripts/verification/ci-test-timings-reporter.ts',SOURCE_TEST_COHORT_FILE];
const policySha256=hash(canonicalReleaseExecutionJson({version:1,file:SOURCE_TEST_COHORT_FILE,titles,children,assignments}));
function parsed<T>(schema:z.ZodType<T>,value:unknown):T{return schema.parse(JSON.parse(canonicalReleaseExecutionJson(value)));}
function plan(value:unknown):SourceTestCohortPlan{
 const valuePlan=parsed(planSchema,value);
 if(valuePlan.policySha256!==policySha256||valuePlan.inventorySha256!==hash(canonicalReleaseExecutionJson(valuePlan.inventory)))throw failure();
 for(const[index,row]of valuePlan.inventory.entries())if(row.ordinal!==index+1||row.titleSha256!==hash(titles[index])||!same(row.children,index===20?children.map(hash):[]))throw failure();
 for(const[index,row]of valuePlan.cohorts.entries()){const fixed=assignments[index];if(row.id!==fixed.id||!same(row.ordinals,fixed.ordinals)||row.pattern!==pattern(fixed.ordinals)||row.expectedTopLevel!==fixed.ordinals.length||row.expectedCases!==fixed.ordinals.length+(fixed.ordinals.some(number=>number===21)?3:0))throw failure();}
 return valuePlan;
}
/** Finite source discovery for this one existing owner; no callback executes. */
export function discoverSourceTestCohortPlan(sourceValue:unknown):SourceTestCohortPlan{
 try{
  if(typeof sourceValue!=='string'||Buffer.byteLength(sourceValue)>512*1024)throw failure();
  const file=ts.createSourceFile(SOURCE_TEST_COHORT_FILE,sourceValue,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS),calls:ts.CallExpression[]=[],nested:ts.CallExpression[]=[];let testImport=false;
  if((file as ts.SourceFile&{parseDiagnostics:readonly unknown[]}).parseDiagnostics.length)throw failure();
  for(const statement of file.statements)if(ts.isImportDeclaration(statement)&&ts.isStringLiteral(statement.moduleSpecifier)&&statement.moduleSpecifier.text==='node:test'){
   const bindings=statement.importClause?.namedBindings;if(!bindings||!ts.isNamedImports(bindings)||bindings.elements.some(row=>row.propertyName!==undefined||!['test','before','after'].includes(row.name.text)))throw failure();testImport=bindings.elements.some(row=>row.name.text==='test');
  }
  const visit=(node:ts.Node)=>{
   if(ts.isStringLiteral(node)&&node.text==='node:test'&&(!ts.isImportDeclaration(node.parent)||node.parent.moduleSpecifier!==node))throw failure();
   if(ts.isIdentifier(node)&&node.text==='test'&&!ts.isImportSpecifier(node.parent)&&!(ts.isPropertyAccessExpression(node.parent)&&node.parent.name===node)&&(!ts.isCallExpression(node.parent)||node.parent.expression!==node))throw failure();
   if(ts.isVariableDeclaration(node)&&node.initializer?.getText(file)==='test')throw failure();
   if(ts.isElementAccessExpression(node)&&['test','t'].includes(node.expression.getText(file)))throw failure();
   if(ts.isCallExpression(node)){
    if(ts.isIdentifier(node.expression)&&node.expression.text==='test'){if(node.parent.parent!==file||!ts.isStringLiteral(node.arguments[0])||node.arguments.length!==2||!ts.isArrowFunction(node.arguments[1])&&!ts.isFunctionExpression(node.arguments[1]))throw failure();calls.push(node);}
    else if(ts.isPropertyAccessExpression(node.expression)&&(node.expression.expression.getText(file)==='test'||node.expression.expression.getText(file)==='t'&&node.expression.name.text==='test')){
     if(node.expression.expression.getText(file)!=='t'||node.expression.name.text!=='test'||node.arguments.length!==2||node.arguments[0].getText(file)!=='mode')throw failure();nested.push(node);
    }
   }
   ts.forEachChild(node,visit);
  };visit(file);
  if(!testImport||calls.length!==25||nested.length!==1)throw failure();
  const childCall=nested[0],loop=childCall.parent.parent.parent;if(!ts.isForOfStatement(loop)||!ts.isAsExpression(loop.expression)||loop.expression.type.getText(file)!=='const'||!ts.isArrayLiteralExpression(loop.expression.expression)||!same(loop.expression.expression.elements.map(row=>ts.isStringLiteral(row)?row.text:null),children)||loop.initializer.getText(file)!=='const mode')throw failure();
  let enclosing:ts.Node=childCall;while(enclosing.parent&&enclosing.parent!==file)enclosing=enclosing.parent;if(enclosing!==calls[20].parent)throw failure();
  const inventory=calls.map((call,index)=>{if((call.arguments[0]as ts.StringLiteral).text!==titles[index])throw failure();const location=file.getLineAndCharacterOfPosition(call.getStart(file));return{ordinal:index+1,titleSha256:hash(titles[index]),sourceLine:location.line+1,sourceColumn:location.character+1,children:index===20?children.map(hash):[]};});
  return plan({version:1,purpose:'CUEVO_CLOSED_CONTINUATION_TEST_COHORTS',file:{path:SOURCE_TEST_COHORT_FILE,sha256:hash(sourceValue)},policySha256,inventorySha256:hash(canonicalReleaseExecutionJson(inventory)),inventory,cohorts:assignments.map(row=>({id:row.id,pattern:pattern(row.ordinals),ordinals:[...row.ordinals],expectedTopLevel:row.ordinals.length,expectedCases:row.ordinals.length+(row.ordinals.some(number=>number===21)?3:0)}))});
 }catch{throw failure();}
}
/** Current exact physical bytes only. The result is metadata, not test authority. */
export function readSourceTestCohortPlan(repoRoot:string):SourceTestCohortPlan{
 try{if(!isAbsolute(repoRoot)||resolve(repoRoot)!==repoRoot)throw failure();let current=repoRoot;for(const part of [...SOURCE_TEST_COHORT_FILE.split('/'),'']){const stat=lstatSync(current);if(stat.isSymbolicLink()||realpathSync(current)!==current||(part?!stat.isDirectory():!stat.isFile()||stat.nlink!==1||stat.size>512*1024))throw failure();if(part)current=join(current,part);}return discoverSourceTestCohortPlan(readFileSync(current,'utf8'));}catch{throw failure();}
}
export function sourceTestCohortCommand(input:{repoRoot:string;plan:unknown;cohortId:string}):string[]{
 try{if(!isAbsolute(input.repoRoot)||resolve(input.repoRoot)!==input.repoRoot)throw failure();const checked=plan(input.plan),cohort=checked.cohorts.find(row=>row.id===input.cohortId);if(!cohort)throw failure();return['--import',pathToFileURL(join(input.repoRoot,'node_modules/tsx/dist/loader.mjs')).href,'--test','--test-name-pattern='+cohort.pattern,'--test-reporter='+pathToFileURL(join(input.repoRoot,'scripts/verification/ci-test-timings-reporter.ts')).href,SOURCE_TEST_COHORT_FILE];}catch{throw failure();}
}
function verifyCases(checked:SourceTestCohortPlan,id:string,cases:z.infer<typeof caseSchema>[],summary:z.infer<typeof summarySchema>,startedAtMs:number,completedAtMs:number){
 const cohort=checked.cohorts.find(row=>row.id===id);if(!cohort||completedAtMs<startedAtMs||cases.length!==cohort.expectedCases||summary.counts.tests!==cohort.expectedCases||summary.counts.passed!==cohort.expectedCases||summary.counts.topLevel!==cohort.expectedTopLevel)throw failure();
 const parents=cases.filter(row=>row.nesting===0),expected=cohort.ordinals.map(number=>checked.inventory[number-1]);if(parents.length!==expected.length||new Set(cases.map(row=>row.titleSha256)).size!==cases.length||!same(parents.map(row=>row.titleSha256).sort(),expected.map(row=>row.titleSha256).sort()))throw failure();
 const definitions=new Set<string>();for(const row of cases){if(row.completedAtMs<row.startedAtMs||row.startedAtMs<startedAtMs||row.completedAtMs>completedAtMs)throw failure();const definition=hash(canonicalReleaseExecutionJson({titleSha256:row.titleSha256,suiteSha256:row.suiteSha256,line:row.line,column:row.column,nesting:row.nesting}));if(definitions.has(definition))throw failure();definitions.add(definition);if(row.nesting===0){if(row.suiteSha256!==null)throw failure();}else{const parent=parents.find(parent=>expected.find(item=>item.titleSha256===parent.titleSha256)?.children.includes(row.titleSha256));if(!parent||row.suiteSha256!==hash(JSON.stringify([parent.titleSha256,parent.line,parent.column]))||row.startedAtMs<parent.startedAtMs||row.completedAtMs>parent.completedAtMs)throw failure();}}
}
/** Retains only strict actual report/command/process facts for one fixed cohort. */
export function recordSourceTestCohort(value:unknown):SourceTestCohortReceipt{
 try{const input=parsed(z.object({repoRoot:z.string(),plan:z.unknown(),cohortId:cohortSchema.shape.id,identity:identitySchema,report:reportSchema,commandArgs:z.array(z.string().max(8192)).length(6),exitCode:z.literal(0),signal:z.null(),cleanupConfirmed:z.literal(true)}).strict(),value),checked=plan(input.plan),report=input.report,file=report.files[0];
  if(!same(input.commandArgs,sourceTestCohortCommand({repoRoot:input.repoRoot,plan:checked,cohortId:input.cohortId}))||!same(report.identity,input.identity)||file.sha256!==checked.file.sha256||!same(report.summary.counts,file.summary.counts)||report.startedAtMs>file.startedAtMs||report.completedAtMs<file.completedAtMs||report.completedAtMs<report.startedAtMs)throw failure();
  verifyCases(checked,input.cohortId,file.cases,file.summary,file.startedAtMs,file.completedAtMs);
  const body=receiptBodySchema.parse({version:1,purpose:'CUEVO_SOURCE_TEST_COHORT',id:input.cohortId,identity:input.identity,file:checked.file,policySha256:checked.policySha256,inventorySha256:checked.inventorySha256,commandSha256:hash(canonicalReleaseExecutionJson(commandDescriptor(checked.cohorts.find(row=>row.id===input.cohortId)!.pattern))),reportSha256:hash(canonicalReleaseExecutionJson(report)),reportStartedAtMs:report.startedAtMs,reportCompletedAtMs:report.completedAtMs,reportSummary:report.summary,startedAtMs:file.startedAtMs,completedAtMs:file.completedAtMs,durationMs:file.durationMs,exitCode:0,signal:null,cleanupConfirmed:true,summary:file.summary,cases:file.cases});return{...body,receiptSha256:hash(canonicalReleaseExecutionJson(body))};
 }catch{throw failure();}
}
/** One original logical file after all five original process receipts agree. */
export function aggregateSourceTestCohorts(planValue:unknown,receiptsValue:unknown,identityValue:unknown,group='migration-replay-rules'){
 try{if(group!=='migration-replay-rules')throw failure();const checked=plan(planValue),identity=parsed(identitySchema,identityValue),receipts=parsed(z.array(sourceTestCohortReceiptSchema).length(5),receiptsValue);if(new Set(receipts.map(row=>row.id)).size!==5)throw failure();
  for(const receipt of receipts){const{receiptSha256,...body}=receipt,cohort=checked.cohorts.find(row=>row.id===receipt.id);if(!cohort||receiptSha256!==hash(canonicalReleaseExecutionJson(body))||!same(receipt.identity,identity)||!same(receipt.file,checked.file)||receipt.policySha256!==checked.policySha256||receipt.inventorySha256!==checked.inventorySha256||receipt.commandSha256!==hash(canonicalReleaseExecutionJson(commandDescriptor(cohort.pattern))))throw failure();
   const report=reportSchema.parse({version:1,purpose:'CUEVO_CI_TEST_TIMINGS',status:'PASSED',effectAuthority:false,timeTargetAchieved:false,fileBytesConfirmed:true,observationBasis:'SUPPLIED_NODE_EVENT_STREAM',identity:receipt.identity,startedAtMs:receipt.reportStartedAtMs,completedAtMs:receipt.reportCompletedAtMs,reasons:[],summary:receipt.reportSummary,files:[{path:receipt.file.path,sha256:receipt.file.sha256,startedAtMs:receipt.startedAtMs,completedAtMs:receipt.completedAtMs,durationMs:receipt.durationMs,summary:receipt.summary,cases:receipt.cases,suites:[]}]});if(receipt.reportSha256!==hash(canonicalReleaseExecutionJson(report))||!same(receipt.reportSummary.counts,receipt.summary.counts)||receipt.reportStartedAtMs>receipt.startedAtMs||receipt.reportCompletedAtMs<receipt.completedAtMs)throw failure();verifyCases(checked,receipt.id,receipt.cases,receipt.summary,receipt.startedAtMs,receipt.completedAtMs);}
  const cases=receipts.flatMap(row=>row.cases),definitions=cases.map(row=>({definitionSha256:hash(canonicalReleaseExecutionJson({titleSha256:row.titleSha256,suiteSha256:row.suiteSha256,line:row.line,column:row.column,nesting:row.nesting})),outcome:row.outcome}));if(cases.length!==28||new Set(definitions.map(row=>row.definitionSha256)).size!==28||new Set(cases.map(row=>row.titleSha256)).size!==28)throw failure();
  const first=Math.min(...receipts.map(row=>row.startedAtMs)),last=Math.max(...receipts.map(row=>row.completedAtMs)),cohortEvidence=sourceTestCohortEvidenceSchema.parse({version:1,purpose:'CUEVO_SOURCE_TEST_COHORT_UNION',file:checked.file,policySha256:checked.policySha256,inventorySha256:checked.inventorySha256,receipts:[...receipts].sort((a,b)=>a.id.localeCompare(b.id))});return{path:checked.file.path,sha256:checked.file.sha256,group,durationMs:last-first,cases:definitions.sort((a,b)=>a.definitionSha256.localeCompare(b.definitionSha256)),cohortEvidence};
 }catch{throw failure();}
}
/** Canonical current policy readers recheck retained receipts without rerunning tests. */
export function validateSourceTestCohortEvidence(planValue:unknown,evidenceValue:unknown,identityValue:unknown){
 try{const checked=plan(planValue),evidence=parsed(sourceTestCohortEvidenceSchema,evidenceValue);if(!same(evidence.file,checked.file)||evidence.policySha256!==checked.policySha256||evidence.inventorySha256!==checked.inventorySha256)throw failure();return aggregateSourceTestCohorts(checked,evidence.receipts,identityValue);}catch{throw failure();}
}
