import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Providers } from '../../../shared/session/providers.tsx';
import { GradebookDetailFrame } from '../components/gradebook.tsx';
import { EvidenceReading } from '../components/evidence-reading.tsx';
import type { Evidence } from '../model.ts';

Object.assign(globalThis, { React });
const id = '40000000-0000-4000-8000-000000000001';
const evidence: Evidence = { id, model: 'numeric', context: { status: 'READY', learnerName: 'Lina', assessmentTitle: 'Explain the checking step', courseTitle: 'School mathematics', className: 'Cedar', yearGroupName: 'Year 8', academicYearName: '2026–2027', referenceTitle: 'Checking reasons', recordedByName: 'Ms Rana', labelBasis: 'CURRENT_REGISTERED_NAMES_AND_SOURCE_TASK', identityRequiresReview: false, submittedAt: '2026-10-03T09:00:00Z', submissionRevision: 1 }, sourceType: 'SUBMISSION', sourceObjectId: id, learnerId: id, actorId: id, createdAt: '2026-10-03T10:00:00Z', quality: 'TEACHER_ENTERED', referenceId: id, referenceVersion: 'school-v1', policyVersion: 2, resultId: id, revision: 1, visibility: 'PARENT_APPROVED', reviewStatus: 'APPROVED' };
function render(locale: 'en' | 'ar', known = true) {
  return renderToStaticMarkup(createElement(Providers, { initialLocale: locale, config: { supabaseUrl: '', supabasePublishableKey: '', apiUrl: '' }, children: createElement(GradebookDetailFrame, { kind: 'evidence', learnerName: known ? 'Lina' : null, assessmentTitle: known ? 'Explain the checking step' : null, onClose() {}, children: createElement(EvidenceReading, { evidence }) }) }));
}

for (const locale of ['en', 'ar'] as const) test(`${locale}: opened gradebook result and its exact evidence have distinct human landmark names`, () => {
  const html = render(locale);
  const names = Array.from(html.matchAll(/<section[^>]*aria-label="([^"]+)"/g), match => match[1]);
  assert.equal(names.length, 2);
  assert.equal(new Set(names).size, 2);
  assert.match(names[0], /Lina · Explain the checking step/);
  assert.equal(names[1], locale === 'en' ? 'View evidence' : 'عرض الشواهد');
  assert.match(html, /tabindex="-1" class="gradebook-detail"/);
  assert.match(html, /<h3>[^<]*Lina · Explain the checking step<\/h3>/);
  assert.match(html, /Ms Rana/);
  assert.match(html, /evidence-provenance/);
});

test('missing gradebook human context stays unavailable and never uses a source ID as its landmark', () => {
  const html = render('en', false), label = /class="gradebook-detail" aria-label="([^"]+)"/.exec(html)?.[1];
  assert.ok(label); assert.match(label, /unavailable/i); assert.doesNotMatch(label, new RegExp(id));
});
