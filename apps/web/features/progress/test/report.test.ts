import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAcademicReport, renderAcademicReport } from '../report.ts';
import { LearningApiError } from '../../../shared/api/client.ts';
const row = { id: '10000000-0000-4000-8000-000000000001', submissionId: '10000000-0000-4000-8000-000000000002', assessmentId: '10000000-0000-4000-8000-000000000003', learnerId: '10000000-0000-4000-8000-000000000004', actorId: '10000000-0000-4000-8000-000000000005', parentVisible: false, model: 'numeric', revision: 1, score: 0, maxScore: 10, feedback: '<script>unsafe</script>', status: 'RELEASED', policyVersion: 1, referenceId: '10000000-0000-4000-8000-000000000006', referenceVersion: 'v1', evidenceId: '10000000-0000-4000-8000-000000000007', createdAt: '2026-10-01T00:00:00Z', nativeResult: { type: 'numeric', score: 0, maxScore: 10, policyVersion: 1 }, assessmentTitle: '<b>School task</b>', referenceTitle: 'Objective' };
const report = { schemaVersion: '1', schoolId: '10000000-0000-4000-8000-000000000008', learnerId: '10000000-0000-4000-8000-000000000004', generatedAt: '2026-10-01T00:01:00Z', scope: 'CURRENT_RELEASED_PAGE', coverage: 'NOT_ESTABLISHED', items: [row], nextCursor: null };
test('report envelope keeps exact learner/current source and unknown coverage', () => { assert.equal(parseAcademicReport(report).items[0].model, 'numeric'); assert.throws(() => parseAcademicReport({ ...report, coverage: 'COMPLETE_TRANSCRIPT' }), LearningApiError); assert.throws(() => parseAcademicReport({ ...report, items: [{ ...row, learnerId: 'other' }] }), LearningApiError); });
const parentContext = { schoolId: report.schoolId, learnerId: report.learnerId, periodId: '', parent: true };
test('current Parent report rejects learner-private rows before rendering or download', () => {
  assert.throws(() => parseAcademicReport(report, parentContext), LearningApiError);
  const approved = parseAcademicReport({ ...report, items: [{ ...row, parentVisible: true }] }, parentContext);
  assert.equal(approved.items[0].nativeResult.type, 'numeric');
  assert.equal(approved.items[0].model === 'numeric' ? approved.items[0].score : null, 0);
  assert.equal(parseAcademicReport(report, { ...parentContext, parent: false }).items[0].parentVisible, false);
});
test('current report binds every page to exact school, learner and selected period', () => {
  const shared = { ...report, items: [{ ...row, parentVisible: true }] };
  assert.throws(() => parseAcademicReport(shared, { ...parentContext, schoolId: row.actorId }), LearningApiError);
  assert.throws(() => parseAcademicReport(shared, { ...parentContext, learnerId: row.actorId }), LearningApiError);
  assert.throws(() => parseAcademicReport(shared, { ...parentContext, periodId: row.actorId }), LearningApiError);
  const period = { id: '10000000-0000-4000-8000-000000000009', name: 'School source period', revision: 2, startsOn: '2026-10-01', endsOn: '2026-10-31', basis: 'SOURCE_SUBMITTED_DATE_UTC' };
  const periodReport = { ...shared, scope: 'CURRENT_RELEASED_PERIOD_PAGE', period };
  assert.throws(() => parseAcademicReport(periodReport, parentContext), LearningApiError);
  assert.equal(parseAcademicReport(periodReport, { ...parentContext, periodId: period.id }).period?.revision, 2);
  assert.throws(() => parseAcademicReport({ ...periodReport, items: [{ ...row, parentVisible: false }] }, { ...parentContext, periodId: period.id }), LearningApiError);
});
test('download report escapes school text and retains native zero plus Arabic RTL', () => { const html = renderAcademicReport(parseAcademicReport(report), 'ar'); assert.ok(html.includes('dir="rtl"')); assert.ok(html.includes('&lt;script&gt;unsafe&lt;/script&gt;')); assert.ok(!html.includes('<script>')); assert.ok(html.includes('0 / 10') || html.includes('٠ / ١٠')); assert.ok(html.includes('NOT_ESTABLISHED')); });

test('current report presents authorized human school and learner identity before source IDs', () => {
  const parsed = parseAcademicReport({ ...report, schoolName: 'Synthetic school — مدرسة', learnerName: 'Aisha <script>name</script>' });
  const html = renderAcademicReport(parsed, 'en');
  assert.ok(html.includes('Synthetic school — مدرسة'));
  assert.ok(html.includes('Aisha &lt;script&gt;name&lt;/script&gt;'));
  assert.ok(!html.includes('<script>name</script>'));
});
test('period report export states the exact school period and source date basis',()=>{const parsed=parseAcademicReport({...report,scope:'CURRENT_RELEASED_PERIOD_PAGE',period:{id:'10000000-0000-4000-8000-000000000009',name:'School source period',revision:2,startsOn:'2026-10-01',endsOn:'2026-10-31',basis:'SOURCE_SUBMITTED_DATE_UTC'}});const html=renderAcademicReport(parsed,'ar');assert.ok(html.includes('School source period'));assert.ok(html.includes('CURRENT_RELEASED_PERIOD_PAGE'));assert.ok(html.includes('UTC'));assert.throws(()=>parseAcademicReport({...report,scope:'CURRENT_RELEASED_PERIOD_PAGE'}),LearningApiError);});

test('standalone report labels the recorded source date truthfully and keeps native values in LTR UTC context',()=>{
 const source=parseAcademicReport(report);const html=renderAcademicReport(source,'en');const ar=renderAcademicReport(source,'ar');
 assert.ok(html.includes('Source record date (UTC)'));assert.ok(ar.includes('تاريخ السجل المصدر (UTC)'));
 assert.doesNotMatch(html,/Result released at/);assert.doesNotMatch(ar,/وقت إصدار النتيجة/);
 assert.match(html,/<p class="native" dir="ltr">0 \/ 10<\/p>/);assert.ok(html.includes('12:00 AM'));
});
