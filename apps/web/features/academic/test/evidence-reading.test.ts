import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Providers } from '../../../shared/session/providers.tsx';
import type { Evidence } from '../model.ts';
import { EvidenceReading } from '../components/evidence-reading.tsx';
const id = '10000000-0000-4000-8000-000000000001';
const evidence: Evidence = { id, model: 'numeric', context: { status: 'REQUIRES_REVIEW', learnerName: null, assessmentTitle: null, courseTitle: null, className: null, yearGroupName: null, academicYearName: null, referenceTitle: null, recordedByName: null, labelBasis: 'CURRENT_REGISTERED_NAMES_AND_SOURCE_TASK', identityRequiresReview: false, submittedAt: null, submissionRevision: null }, sourceType: 'SUBMISSION', sourceObjectId: id, learnerId: id, actorId: id, createdAt: '2026-10-03T10:00:00Z', quality: 'TEACHER_ENTERED', referenceId: id, referenceVersion: 'school-v1', policyVersion: 2, resultId: id, revision: 1, visibility: 'PARENT_APPROVED', reviewStatus: 'APPROVED' };
function render(locale: 'en' | 'ar', source: Evidence = evidence) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'React'); Object.defineProperty(globalThis, 'React', { configurable: true, value: React });
  try { return renderToStaticMarkup(createElement(Providers, { initialLocale: locale, config: { supabaseUrl: '', supabasePublishableKey: '', apiUrl: '' }, children: createElement(EvidenceReading, { evidence: source }) })); }
  finally { if (previous) Object.defineProperty(globalThis, 'React', previous); else Reflect.deleteProperty(globalThis, 'React'); }
}
test('source evidence identifies its recorded meaning and keeps identifiers inside an explicit detail', () => {
  const html = render('en'); const visible = html.split('<details>')[0];
  assert.match(visible, /Teacher entered|Approved current parent/); assert.match(visible, /unavailable/i); assert.doesNotMatch(visible, new RegExp(id));
  assert.match(html, /<details>.*10000000/s); assert.doesNotMatch(html, /<form|<input|Release result|Create correction/);
});
test('Trail evidence reading preserves authorized human context and recorder from the strict source', () => {
  const html = render('en', { ...evidence, context: { status: 'READY', learnerName: 'Lina', assessmentTitle: 'Recorded algebra work', courseTitle: 'Mathematics', className: 'Cedar', yearGroupName: 'Year 8', academicYearName: '2026–2027', referenceTitle: 'Algebra objective', recordedByName: 'Ms Rana', labelBasis: 'CURRENT_REGISTERED_NAMES_AND_SOURCE_TASK', identityRequiresReview: false, submittedAt: '2026-10-03T09:00:00Z', submissionRevision: 1 } });
  const visible = html.split('<details>')[0];
  for (const label of ['Lina', 'Recorded algebra work', 'Mathematics', 'Cedar', 'Year 8', 'Algebra objective', 'Ms Rana']) assert.ok(visible.includes(label));
  assert.doesNotMatch(visible, /Recorder name is unavailable|10000000/);
});
test('Arabic evidence keeps the same approved scope without inventing recorder identity', () => {
  const html = render('ar'); assert.match(html, /أدخله المعلّم/); assert.match(html, /غير متاح/); assert.doesNotMatch(html.split('<details>')[0], new RegExp(id));
});
test('evidence technical identifiers stay behind a closed bilingual technical disclosure',()=>{
 for(const locale of ['en','ar'] as const){const html=render(locale);assert.match(html,locale==='en'?/<summary>Technical details<\/summary>/:/<summary>تفاصيل تقنية<\/summary>/);assert.doesNotMatch(html,/<details[^>]* open/);assert.match(html.split('<details>')[0],/UTC/);assert.match(html,new RegExp(id));}
});
