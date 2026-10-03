import assert from 'node:assert/strict';
import test from 'node:test';
import * as model from '../presentation-model.ts';

test('explicit Teacher review scrolls the settled exact source without stealing active input or refresh focus',()=>{
 assert.equal(typeof model.portfolioReviewFocus,'function');
 assert.equal(model.portfolioReviewFocus({reviewing:true,focusOnLoad:true,alreadyFocused:false,loading:false,settled:true,activeIntent:true}),'scroll');
 for(const change of[{activeIntent:false},{alreadyFocused:true},{loading:true},{settled:false},{focusOnLoad:false}])assert.equal(model.portfolioReviewFocus({reviewing:true,focusOnLoad:true,alreadyFocused:false,loading:false,settled:true,activeIntent:true,...change}),'none');
 assert.equal(model.portfolioReviewFocus({reviewing:false,focusOnLoad:true,alreadyFocused:false,loading:false,settled:true,activeIntent:true}),'focus');
});
