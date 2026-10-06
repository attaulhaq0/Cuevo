import assert from 'node:assert/strict';import test from 'node:test';
import{parseNavigationIntent,navigationParameters}from'../navigation-intent.ts';
test('exact navigation intent accepts only an owner/source pair and valid identifier',()=>{
 const id='10000000-0000-4000-8000-000000000001';
 assert.deepEqual(parseNavigationIntent('learning','assessment',id),{view:'learning',source:'assessment',id});
 assert.equal(parseNavigationIntent('community','assessment',id),null);
 assert.equal(parseNavigationIntent('academic','marking','d3821d'),null);
 assert.equal(navigationParameters({view:'improvement',source:'intervention',id}).get('source'), 'intervention');
});
test('notification navigation is a typed section with no borrowed record identifier',async()=>{
 const api=await import('../navigation-intent.ts');
 assert.deepEqual(api.parseNavigationIntent('community',null,null,'notifications'),{view:'community',section:'notifications'});
 assert.equal(api.parseNavigationIntent('community','assessment','10000000-0000-4000-8000-000000000001','notifications'),null);
 assert.equal(api.parseNavigationIntent('community',null,null,'unknown'),null);
 assert.equal(api.parseNavigationIntent('learning',null,null,'notifications'),null);
 assert.equal(api.navigationParameters({view:'community',section:'notifications'}).toString(),'view=community&section=notifications');
});
