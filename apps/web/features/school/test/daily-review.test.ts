import assert from 'node:assert/strict';
import test from 'node:test';
import { FormDrafts } from '../../../shared/session/form-drafts.ts';
import { CommandJournal, confirmCommandReceipt, LearningApiError } from '../../../shared/api/client.ts';
import { attendanceCreationCurrent, currentDailyReview, attendanceDraftKey, attendanceRecovery, attendanceReview, attendanceBody, validateAttendanceReceipt, parseAttendanceRoster, dailyAttendance, dailyCalendar } from '../daily-review-model.ts';
const id=(n:number)=>`b0000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const row={id:id(1),classId:id(2),learnerId:id(3),occurredOn:'2026-10-03',revision:2,status:'late' as const,note:'Reviewed original note',recordedAt:'2026-10-03T10:00:00Z'};
test('attendance drafts never move between class day learner or correction source',()=>{
 const drafts=new FormDrafts(),review=attendanceReview(row);const key=attendanceDraftKey(review);
 drafts.save('school:actor:'+key,{note:'Original correction'},{expectedRevision:2});
 for(const change of[{classId:id(4)},{learnerId:id(4)},{occurredOn:'2026-10-04'},{sourceId:null,expectedRevision:0}])assert.equal(drafts.get('school:actor:'+attendanceDraftKey({...review,...change})),undefined);
 assert.equal(drafts.get('school:actor:'+key)?.values.note,'Original correction');
 assert.equal(currentDailyReview(review,id(4),review.occurredOn),null);
 assert.equal(currentDailyReview(review,review.classId,'2026-10-04'),null);
 assert.deepEqual(currentDailyReview(review,review.classId,review.occurredOn),review);
});
test('exact roster refuses wrong class and missing names without authorizing a learner from another page',()=>{
 const person={id:row.learnerId,displayName:'Alex Taylor',classId:row.classId,className:'Cedar',academicYearName:'2026–2027'};
 assert.equal(parseAttendanceRoster(person,row.classId).id,row.learnerId);
 assert.throws(()=>parseAttendanceRoster({...person,classId:id(4)},row.classId),LearningApiError);
 assert.throws(()=>parseAttendanceRoster({...person,displayName:''},row.classId),LearningApiError);
});
test('attendance command fixes original tuple and revision while only status note and correction reason are edited',()=>{
 const values=new FormData();values.set('status','present');values.set('note','Current note');values.set('correctionReason','Reviewed correction');values.set('classId',id(9));values.set('studentId',id(9));values.set('occurredOn','2026-10-04');
 assert.deepEqual(attendanceBody(attendanceReview(row),values),{classId:row.classId,studentId:row.learnerId,occurredOn:row.occurredOn,expectedRevision:2,status:'present',note:'Current note',correctionReason:'Reviewed correction'});
 values.set('correctionReason','');assert.throws(()=>attendanceBody(attendanceReview(row),values),LearningApiError);
});
test('uncertain attendance recovers its original tuple and receipt before settlement after remount',()=>{
 const journal=new CommandJournal(),body={classId:row.classId,studentId:row.learnerId,occurredOn:row.occurredOn,expectedRevision:2,status:'present',note:'Current note',correctionReason:'Reviewed correction'};
 const command=journal.prepare('/v1/school/attendance','/v1/school/attendance',body);
 assert.equal(attendanceRecovery(command)?.input.studentId,row.learnerId);
 assert.throws(()=>journal.prepare(command.path,command.path,{...body,classId:id(9)}),error=>error instanceof LearningApiError&&error.uncertain);
 const receipt={...row,id:id(5),revision:3,status:'present',note:'Current note',correctionReason:'Reviewed correction'};
 for(const change of[{classId:id(9)},{learnerId:id(9)},{occurredOn:'2026-10-04'},{revision:2},{note:'Other note'}])assert.throws(()=>confirmCommandReceipt(journal,command.path,command.key,{...receipt,...change},undefined,validateAttendanceReceipt),error=>error instanceof LearningApiError&&error.uncertain);
 assert.equal(confirmCommandReceipt(journal,command.path,command.key,receipt,undefined,validateAttendanceReceipt),true);
});
test('daily records select exact class and day without missing as absent or excluding school-wide events',()=>{
 assert.deepEqual(dailyAttendance([row,{...row,id:id(4),classId:id(9)},{...row,id:id(5),occurredOn:'2026-10-04'}],row.classId,row.occurredOn),[row]);
 assert.deepEqual(dailyAttendance([row],row.classId,''),[]);
 const event={id:id(6),classId:null,startsAt:'2026-10-03T23:00:00Z',endsAt:'2026-10-04T01:00:00Z'};
 assert.deepEqual(dailyCalendar([event,{...event,id:id(7),classId:id(9)}],row.classId,'2026-10-03'),[event]);
 assert.deepEqual(dailyCalendar([event],row.classId,'2026-02-30'),[]);
});
test('a new unsent attendance review cannot assert absence after a current source record arrives',()=>{
 const review={...attendanceReview(row),expectedRevision:0,sourceId:null};
 assert.equal(attendanceCreationCurrent(review,[]),true);
 assert.equal(attendanceCreationCurrent(review,[row]),false);
 assert.equal(attendanceCreationCurrent(review,[{...row,learnerId:id(9)}]),true);
 assert.equal(attendanceCreationCurrent(attendanceReview(row),[row]),true);
});
