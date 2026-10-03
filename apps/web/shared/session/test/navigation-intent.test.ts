import assert from 'node:assert/strict';import test from 'node:test';
import{parseNavigationIntent,navigationParameters}from'../navigation-intent.ts';
test('exact navigation intent accepts only an owner/source pair and valid identifier',()=>{
 const id='10000000-0000-4000-8000-000000000001';
 assert.deepEqual(parseNavigationIntent('learning','assessment',id),{view:'learning',source:'assessment',id});
 assert.equal(parseNavigationIntent('community','assessment',id),null);
 assert.equal(parseNavigationIntent('academic','marking','d3821d'),null);
 assert.equal(navigationParameters({view:'improvement',source:'intervention',id}).get('source'), 'intervention');
});
