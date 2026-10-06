import assert from 'node:assert/strict';
import test from 'node:test';
import * as model from '../model.ts';
import {CommandJournal}from'../../../shared/api/client.ts';
const id='00000000-0000-4000-8000-000000000001',revisionId='00000000-0000-4000-8000-000000000002';
test('Portfolio reader intent contains only exact item and immutable revision identity',()=>{
 const parse=model.parsePortfolioReadingSelection;
 assert.deepEqual(parse({itemId:id,revisionId,revision:2}),{itemId:id,revisionId,revision:2});
 for(const value of [null,{},[],{itemId:id,revisionId,revision:0},{itemId:id,revisionId,revision:2,reflection:'private'},{itemId:id,revisionId:'old',revision:2}])assert.equal(parse(value),null);
});
test('Portfolio reading never chooses a sibling or carries a reader across revision or source loss',()=>{
 const intent={itemId:id,revisionId,revision:2},row={id,revisionId,revision:2};
 assert.equal(model.currentPortfolioReading([row],null,true),null);
 assert.equal(model.currentPortfolioReading([row],intent,false),null);
 assert.equal(model.currentPortfolioReading([row],intent,true),row);
 assert.equal(model.currentPortfolioReading([{...row,revision:3}],intent,true),null);
 assert.equal(model.currentPortfolioReading([{...row,revisionId:id}],intent,true),null);
 assert.equal(model.currentPortfolioReading([row,row],intent,true),null);
});
test('Portfolio navigation locks original owner commands without changing their key or body',()=>{
 for(const path of ['/v1/portfolio/items','/v1/portfolio/items/'+id+'/reflection','/v1/portfolio/items/'+id+'/review','/v1/portfolio/items/'+id+'/parent-revoke','/v1/portfolio/collections','/v1/assets/'+id+'/finalize'])assert.equal(model.portfolioNavigationLocked([{key:'original',path,body:{expectedRevision:2}}]),true);
 assert.equal(model.portfolioNavigationLocked([{key:'other',path:'/v1/courses',body:{}}]),false);
});
test('pending Portfolio receipt context survives UI remount only for the original current-session key',()=>{
 const journal=new CommandJournal(),command=journal.prepare('/v1/portfolio/items/'+id+'/review','/v1/portfolio/items/'+id+'/review',{expectedRevision:2});
 const first=model.portfolioPendingReadingContexts(journal,'school:teacher');first.set(command.key,{itemId:id,revisionId,revision:2});
 assert.deepEqual(model.portfolioPendingReadingContexts(journal,'school:teacher').get(command.key),{itemId:id,revisionId,revision:2});
 assert.equal(model.portfolioPendingReadingContexts(journal,'school:other').size,0);
 model.portfolioPendingReadingContexts(journal,'school:teacher').set(command.key,{itemId:id,revisionId,revision:2});journal.confirm(command.path,command.key);assert.equal(model.portfolioPendingReadingContexts(journal,'school:teacher').size,0);
});
