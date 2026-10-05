import assert from'node:assert/strict';
import test from'node:test';
import{validateReleaseControls}from'./cicd-contracts';

const founder=()=>({type:'User',reviewer:{id:95836629,login:'attaulhaq0',type:'User',node_id:'current-user'}});
const controls=(environment='production')=>({
 repository:{full_name:'owner/repo',name:'repo',owner:{id:1,login:'owner',type:'Organization'}},
 environment:{id:7,name:environment,can_admins_bypass:false,protection_rules:[{id:8,type:'required_reviewers',prevent_self_review:false,reviewers:[founder()]},{id:9,type:'branch_policy'}],deployment_branch_policy:{protected_branches:false,custom_branch_policies:true}},
 branches:{total_count:1,branch_policies:[{id:10,name:'main',type:'branch'}]},
 signatures:{enabled:true},
 main:{enforce_admins:{enabled:true},required_status_checks:{strict:true,contexts:['required']},allow_force_pushes:{enabled:false},allow_deletions:{enabled:false},required_pull_request_reviews:{dismiss_stale_reviews:true,require_code_owner_reviews:false,required_approving_review_count:0,require_last_push_approval:false,bypass_pull_request_allowances:{users:[],teams:[],apps:[]}}},
});
type MutableControls={environment:{id?:number;name:string;can_admins_bypass?:boolean;protection_rules:{id:number;type:string;prevent_self_review?:boolean;reviewers?:{type:string;reviewer:{id:number;login?:string;type:string}}[];wait_timer?:number}[];deployment_branch_policy:{protected_branches:boolean;custom_branch_policies:boolean}};branches:{total_count:number;branch_policies:{id:number;name:string;type:string}[]};signatures:{enabled:boolean};main:{enforce_admins:{enabled:boolean};required_status_checks:{strict:boolean;contexts:string[]};allow_force_pushes?:{enabled:boolean};allow_deletions?:{enabled:boolean};required_pull_request_reviews?:{dismiss_stale_reviews:boolean;require_code_owner_reviews:boolean;required_approving_review_count:number;require_last_push_approval?:boolean;bypass_pull_request_allowances?:{users:{id:number}[];teams:{id:number}[];apps?:{id:number}[]}}}};
function changed(edit:(value:MutableControls)=>void){const value:MutableControls=controls();edit(value);return value;}
test('exact founder can approve a main-only protected environment while PR and signed required CI stay mandatory',()=>{for(const environment of['staging','production'])assert.doesNotThrow(()=>validateReleaseControls(controls(environment),{environment,repository:'owner/repo'}));});

test('a verified personal repository accepts genuinely omitted organization-only bypass metadata without inventing an empty list',()=>{
 const value=controls();value.repository.owner.type='User';Reflect.deleteProperty(value.main.required_pull_request_reviews,'bypass_pull_request_allowances');
 assert.deepEqual(validateReleaseControls(value,{environment:'production',repository:'owner/repo'}),{repository:'owner/repo',ownerType:'User',prBypass:'NON_CONFIGURABLE_PERSONAL_REPOSITORY'});assert.equal(Object.hasOwn(value.main.required_pull_request_reviews,'bypass_pull_request_allowances'),false);
});
test('organization unknown wrong identity or invalid personal bypass metadata fails closed',()=>{
 const omitted=()=>{const value=controls();Reflect.deleteProperty(value.main.required_pull_request_reviews,'bypass_pull_request_allowances');return value;};
 for(const value of[omitted(),{...omitted(),repository:undefined},{...omitted(),repository:{full_name:'other/repo',name:'repo',owner:{id:1,login:'other',type:'User'}}},{...omitted(),repository:{full_name:'owner/repo',name:'other',owner:{id:1,login:'owner',type:'User'}}},{...omitted(),repository:{full_name:'owner/repo',name:'repo',owner:{id:1,login:'other',type:'User'}}},{...omitted(),repository:{full_name:'owner/repo',name:'repo',owner:{id:1,login:'owner',type:'Bot'}}},{...omitted(),repository:{full_name:'owner/repo',name:'repo',owner:{id:0,login:'owner',type:'User'}}},{...omitted(),repository:{full_name:'owner/repo',name:'repo',owner:{login:'owner',type:'User'}}}])assert.throws(()=>validateReleaseControls(value,{environment:'production',repository:'owner/repo'}));
 const personal=omitted();personal.repository.owner.type='User';assert.throws(()=>validateReleaseControls(personal,{environment:'production'}));for(const bypass of[undefined,null,{}, {users:[],teams:[]},{users:[{id:1}],teams:[],apps:[]},{users:[],teams:[{id:1}],apps:[]},{users:[],teams:[],apps:[{id:1}]}]){Object.defineProperty(personal.main.required_pull_request_reviews,'bypass_pull_request_allowances',{value:bypass,configurable:true,enumerable:true});assert.throws(()=>validateReleaseControls(personal,{environment:'production',repository:'owner/repo'}));}
});
test('personal capability uses own current metadata and cannot invoke accessors or coerce unknown identity',()=>{
 let reads=0;const value=controls();value.repository.owner.type='User';Reflect.deleteProperty(value.main.required_pull_request_reviews,'bypass_pull_request_allowances');
 const bypass=Object.defineProperty({teams:[],apps:[]},'users',{enumerable:true,get(){reads++;return[];}});Object.defineProperty(value.main.required_pull_request_reviews,'bypass_pull_request_allowances',{value:bypass,configurable:true});
 assert.throws(()=>validateReleaseControls(value,{environment:'production',repository:'owner/repo'}));
 const personal=controls();personal.repository.owner.type='User';Object.defineProperty(personal.main.required_pull_request_reviews,'bypass_pull_request_allowances',{enumerable:true,get(){reads++;return{users:[],teams:[],apps:[]};}});assert.throws(()=>validateReleaseControls(personal,{environment:'production',repository:'owner/repo'}));
 const unknown=controls();Object.defineProperty(unknown.repository.owner,'type',{enumerable:true,get(){reads++;return'User';}});assert.throws(()=>validateReleaseControls(unknown,{environment:'production',repository:'owner/repo'}));assert.equal(reads,0);
 const inherited=controls();inherited.repository.owner.type='User';Reflect.deleteProperty(inherited.main.required_pull_request_reviews,'bypass_pull_request_allowances');Object.setPrototypeOf(inherited.main.required_pull_request_reviews,Object.defineProperty({},'bypass_pull_request_allowances',{get(){reads++;return{users:[],teams:[],apps:[]};}}));assert.throws(()=>validateReleaseControls(inherited,{environment:'production',repository:'owner/repo'}));assert.equal(reads,0);
});
test('wrong actor type account login extra or ambiguous environment reviewer is refused',()=>{for(const edit of[
 (v:MutableControls)=>v.environment.protection_rules[0].reviewers![0].type='Team',
 (v:MutableControls)=>v.environment.protection_rules[0].reviewers![0].reviewer.id=1,
 (v:MutableControls)=>v.environment.protection_rules[0].reviewers![0].reviewer.login='other',
 (v:MutableControls)=>v.environment.protection_rules[0].reviewers![0].reviewer.type='Bot',
 (v:MutableControls)=>delete v.environment.protection_rules[0].reviewers![0].reviewer.login,
 (v:MutableControls)=>v.environment.protection_rules[0].reviewers!.push(founder()),
 (v:MutableControls)=>v.environment.protection_rules.push({...v.environment.protection_rules[0],id:11}),
 (v:MutableControls)=>v.environment.protection_rules[0].prevent_self_review=true,
 (v:MutableControls)=>delete v.environment.protection_rules[0].prevent_self_review,
 (v:MutableControls)=>v.environment.protection_rules=[],
])assert.throws(()=>validateReleaseControls(changed(edit),{environment:'production',repository:'owner/repo'}));});
test('branch and environment bypass force deletion unsigned or incomplete metadata is refused',()=>{for(const edit of[
 (v:MutableControls)=>v.environment.can_admins_bypass=true,
 (v:MutableControls)=>v.environment.deployment_branch_policy.protected_branches=true,
 (v:MutableControls)=>v.environment.deployment_branch_policy.custom_branch_policies=false,
 (v:MutableControls)=>v.branches.branch_policies[0].name='*',
 (v:MutableControls)=>v.branches.branch_policies[0].type='tag',
 (v:MutableControls)=>v.branches.branch_policies.push({id:11,name:'other',type:'branch'}),
 (v:MutableControls)=>v.main.enforce_admins.enabled=false,
 (v:MutableControls)=>v.signatures.enabled=false,
 (v:MutableControls)=>v.main.required_status_checks.strict=false,
 (v:MutableControls)=>v.main.required_status_checks.contexts=[],
 (v:MutableControls)=>v.main.allow_force_pushes!.enabled=true,
 (v:MutableControls)=>v.main.allow_deletions!.enabled=true,
 (v:MutableControls)=>delete v.main.allow_force_pushes,
 (v:MutableControls)=>delete v.main.allow_deletions,
 (v:MutableControls)=>delete v.main.required_pull_request_reviews,
 (v:MutableControls)=>v.main.required_pull_request_reviews!.dismiss_stale_reviews=false,
 (v:MutableControls)=>v.main.required_pull_request_reviews!.require_code_owner_reviews=true,
 (v:MutableControls)=>v.main.required_pull_request_reviews!.required_approving_review_count=1,
 (v:MutableControls)=>v.main.required_pull_request_reviews!.require_last_push_approval=true,
 (v:MutableControls)=>delete v.main.required_pull_request_reviews!.bypass_pull_request_allowances,
 (v:MutableControls)=>delete v.main.required_pull_request_reviews!.bypass_pull_request_allowances!.apps,
 (v:MutableControls)=>v.main.required_pull_request_reviews!.bypass_pull_request_allowances!.users.push({id:95836629}),
 (v:MutableControls)=>v.main.required_pull_request_reviews!.bypass_pull_request_allowances!.teams.push({id:1}),
 (v:MutableControls)=>v.main.required_pull_request_reviews!.bypass_pull_request_allowances!.apps!.push({id:1}),
])assert.throws(()=>validateReleaseControls(changed(edit),{environment:'production',repository:'owner/repo'}));});
test('unsupported environment protection rule or environment name stays unknown rather than approved',()=>{assert.throws(()=>validateReleaseControls(controls('development'),{environment:'development',repository:'owner/repo'}));assert.throws(()=>validateReleaseControls(controls(),{environment:'staging',repository:'owner/repo'}));assert.throws(()=>validateReleaseControls(changed(v=>v.environment.protection_rules.push({id:12,type:'custom_deployment_protection_rule'})),{environment:'production',repository:'owner/repo'}));assert.throws(()=>validateReleaseControls({}, {environment:'production',repository:'owner/repo'}));});
test('additional supported timer and API metadata do not invent another reviewer',()=>{const value=changed(v=>v.environment.protection_rules.push({id:12,type:'wait_timer',wait_timer:15}));assert.doesNotThrow(()=>validateReleaseControls(value,{environment:'production',repository:'owner/repo'}));});
