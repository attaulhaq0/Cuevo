import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAcademicReport, renderAcademicReport } from '../report.ts';
import { LearningApiError } from '../../../shared/api/client.ts';
test('Arabic numeric report preserves score then maximum inside an explicit LTR ratio', () => {
  const parsed = parseAcademicReport({ ...report, items: [{ ...row, score: 7, nativeResult: { ...row.nativeResult, score: 7 } }] });
  const html = renderAcademicReport(parsed, 'ar');
  const score = new Intl.NumberFormat('ar').format(7); const maximum = new Intl.NumberFormat('ar').format(10);
  assert.ok(html.includes(`<bdi dir="ltr">${score} / ${maximum}</bdi>`));
});
const row = { id: '10000000-0000-4000-8000-000000000001', submissionId: '10000000-0000-4000-8000-000000000002', assessmentId: '10000000-0000-4000-8000-000000000003', learnerId: '10000000-0000-4000-8000-000000000004', actorId: '10000000-0000-4000-8000-000000000005', parentVisible: false, model: 'numeric', revision: 1, score: 0, maxScore: 10, feedback: '<script>unsafe</script>', status: 'RELEASED', policyVersion: 1, referenceId: '10000000-0000-4000-8000-000000000006', referenceVersion: 'v1', evidenceId: '10000000-0000-4000-8000-000000000007', createdAt: '2026-10-01T00:00:00Z', nativeResult: { type: 'numeric', score: 0, maxScore: 10, policyVersion: 1 }, assessmentTitle: '<b>School task</b>', referenceTitle: 'Objective' };
const report = { schemaVersion: '1', schoolId: '10000000-0000-4000-8000-000000000008', learnerId: '10000000-0000-4000-8000-000000000004', generatedAt: '2026-10-01T00:01:00Z', scope: 'CURRENT_RELEASED_PAGE', coverage: 'NOT_ESTABLISHED', items: [row], nextCursor: null };
test('report envelope keeps exact learner/current source and unknown coverage', () => { assert.equal(parseAcademicReport(report).items[0].model, 'numeric'); assert.throws(() => parseAcademicReport({ ...report, coverage: 'COMPLETE_TRANSCRIPT' }), LearningApiError); assert.throws(() => parseAcademicReport({ ...report, items: [{ ...row, learnerId: 'other' }] }), LearningApiError); });
test('download report escapes school text and retains native zero plus Arabic RTL', () => { const html = renderAcademicReport(parseAcademicReport(report), 'ar'); assert.ok(html.includes('dir="rtl"')); assert.ok(html.includes('&lt;script&gt;unsafe&lt;/script&gt;')); assert.ok(!html.includes('<script>')); assert.ok(html.includes('0 / 10') || html.includes('٠ / ١٠')); assert.ok(html.includes('NOT_ESTABLISHED')); });

test('current report presents authorized human school and learner identity before source IDs', () => {
  const parsed = parseAcademicReport({ ...report, schoolName: 'Synthetic school — مدرسة', learnerName: 'Aisha <script>name</script>' });
  const html = renderAcademicReport(parsed, 'en');
  assert.ok(html.includes('Synthetic school — مدرسة'));
  assert.ok(html.includes('Aisha &lt;script&gt;name&lt;/script&gt;'));
  assert.ok(!html.includes('<script>name</script>'));
});
test('period report export states the exact school period and source date basis',()=>{const parsed=parseAcademicReport({...report,scope:'CURRENT_RELEASED_PERIOD_PAGE',period:{id:'10000000-0000-4000-8000-000000000009',name:'School source period',revision:2,startsOn:'2026-10-01',endsOn:'2026-10-31',basis:'SOURCE_SUBMITTED_DATE_UTC'}});const html=renderAcademicReport(parsed,'ar');assert.ok(html.includes('School source period'));assert.ok(html.includes('CURRENT_RELEASED_PERIOD_PAGE'));assert.ok(html.includes('UTC'));assert.throws(()=>parseAcademicReport({...report,scope:'CURRENT_RELEASED_PERIOD_PAGE'}),LearningApiError);});
test('report primary text preserves objective and native facts while exact version stays in source disclosure',()=>{const html=renderAcademicReport(parseAcademicReport({...report,items:[{...row,referenceVersion:'opaque-source-identity'}]}),'en');assert.ok(html.includes('opaque-source-identity'));const source=html.indexOf('<details>',html.indexOf('<article>'));assert.ok(source>0);assert.ok(!html.slice(html.indexOf('<article>'),source).includes('opaque-source-identity'));});
