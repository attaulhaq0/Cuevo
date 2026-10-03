import assert from 'node:assert/strict';
import test from 'node:test';
import { schoolAccessRevision, schoolAccessBasis } from '../model.ts';
test('access revision binds exact complete relationship tuple without borrowing another source', () => {
 const rows=[{id:'one',classId:'a',studentId:'x',revision:4},{id:'two',classId:'b',studentId:'x',revision:7}];
 assert.equal(schoolAccessRevision('enrollment',{classId:'a'},rows),undefined);
 assert.equal(schoolAccessRevision('enrollment',{classId:'a',studentId:'x'},rows),4);
 assert.equal(schoolAccessRevision('enrollment',{classId:'b',studentId:'x'},rows),7);
 assert.equal(schoolAccessRevision('enrollment',{classId:'c',studentId:'x'},rows),0);
 assert.equal(schoolAccessRevision('person',{},[{id:'p',revision:3}],'p'),3);
});
test('same-scope source refresh cannot silently upgrade the approval basis of working access input',()=>{
 const previous={values:{classId:'a',studentId:'x',status:'active'},basis:{expectedRevision:4}};
 const fresh=[{id:'one',classId:'a',studentId:'x',revision:5},{id:'two',classId:'b',studentId:'x',revision:7}];
 assert.equal(schoolAccessBasis('enrollment',{classId:'a',studentId:'x'},fresh,previous),4);
 assert.equal(schoolAccessBasis('enrollment',{classId:'b',studentId:'x'},fresh,previous),7);
});
