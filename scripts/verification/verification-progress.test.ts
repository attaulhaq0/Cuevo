import assert from 'node:assert/strict';
import { test } from 'node:test';

test('progress records actual phase result and duration while refusing private fields and arbitrary labels',async()=>{
 const { verificationProgress }=await import('./verification-progress');
 assert.deepEqual(verificationProgress({profile:'routine',phase:'critical-browser',event:'START'}),{stdout:'START routine critical-browser',summary:'| critical-browser | START | — |\n'});
 assert.deepEqual(verificationProgress({profile:'full-runtime',phase:'database',event:'END',exitCode:1,durationMs:1500}),{stdout:'END full-runtime database FAILED 1500ms',summary:'| database | FAILED | 1500 ms |\n'});
 assert.match(verificationProgress({profile:'routine',phase:'source-freeze',event:'END',exitCode:0,durationMs:0}).stdout,/PASSED 0ms$/);
 for(const phase of ['backend-build','web-build'])assert.match(verificationProgress({profile:'main-staging',phase,event:'END',exitCode:0,durationMs:12}).stdout,new RegExp(phase+' PASSED 12ms$'));
 for(const value of [{profile:'routine',phase:'database',event:'END',exitCode:0,durationMs:-1},{profile:'routine',phase:'private pupil content',event:'START'},{profile:'routine',phase:'database',event:'END',exitCode:0,durationMs:1,error:'private raw diagnostic'},{profile:'routine',phase:'database',event:'START',durationMs:100}])assert.throws(()=>verificationProgress(value));
});
