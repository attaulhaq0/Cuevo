import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { DemoGuideManifest } from '../../../shared/session/demo-guide.ts';
import { Providers } from '../../../shared/session/providers.tsx';
Object.assign(globalThis, { React });
const view = await import('../components/demo-personalization.tsx').catch(() => ({})) as typeof import('../components/demo-personalization.tsx');
const id = (n: number) => 'ce000000-0000-4000-8000-' + String(n).padStart(12, '0');
const manifest = { version: 1, schoolId: id(1), actors: { admin: id(2), coordinator: id(3), teacher: id(4), student: id(5), parent: id(6) }, records: { courseId: id(7), lessonId: id(8), activityId: id(9), proposalId: id(10), baselineSubmissionId: id(11), baselineResultId: id(12), followupResultId: id(13), assignedPracticeId: id(14), measuredPracticeId: id(15), outcomeId: id(16), portfolioId: id(17), periodId: id(18), roomId: id(19), agenticProposalId: id(20), agenticRunId: id(21), agenticPracticeId: id(22) } } as DemoGuideManifest;
const context = { schemaVersion: '1', learnerId: id(5), courseId: id(7), classId: id(23), reference: { id: id(24), version: 'school-source-v1', title: 'Explain a checking method' }, recentResults: [{ resultId: id(13), evidenceId: id(25), referenceId: id(24), referenceVersion: 'school-source-v1', score: 7, maxScore: 10 }], observations: [], priorInterventions: [], learningOptions: [], coverage: 'BOUNDED_AUTHORIZED_CONTEXT' };
const practice = { id: id(22), recommendationId: id(20), learnerId: id(5), referenceId: id(24), baselineResultId: id(13), title: 'Teacher-reviewed checking practice', instructions: 'Explain how you check every counter once.', status: 'ASSIGNED', createdAt: '2026-10-06T06:00:00Z', completedAt: null, followUpAssessmentId: null, requiresReview: false, reviewReason: null };

test('personalization binds the exact current run learner objective proposal practice and evidence', () => {
  assert.equal(typeof view.parseDemoPersonalization, 'function');
  const data = view.parseDemoPersonalization({ runId: id(21), context }, practice, manifest);
  assert.equal(data?.context.reference.title, context.reference.title);
  assert.equal(data?.practice.title, practice.title);
  for (const wrong of [{ ...practice, learnerId: id(99) }, { ...practice, id: id(99) }, { ...practice, recommendationId: id(99) }, { ...practice, baselineResultId: id(12) }, { ...practice, referenceId: id(99) }]) assert.throws(() => view.parseDemoPersonalization({ runId: id(21), context }, wrong, manifest));
  assert.throws(() => view.parseDemoPersonalization({ runId: id(99), context }, practice, manifest));
  assert.equal(view.parseDemoPersonalization({ runId: id(21), context: null }, practice, manifest), null);
});

for (const locale of ['en', 'ar'] as const) {
  test(locale + ' source explanation has four ordered human cards and native evidence with no authority controls', () => {
    const data = view.parseDemoPersonalization({ runId: id(21), context }, practice, manifest);
    const html = renderToStaticMarkup(createElement(view.DemoPersonalizationView, { locale, data }));
    assert.equal((html.match(/data-personalization-card=/g) ?? []).length, 4);
    assert.equal((html.match(/<h1>/g) ?? []).length, 1);
    assert.equal((html.match(/<h2>/g) ?? []).length, 4);
    assert.match(html, /<ol/); assert.match(html, /data-personalization-state="ready"/);
    assert.match(html, /Explain a checking method/); assert.match(html, /Teacher-reviewed checking practice/);
    const number = new Intl.NumberFormat(locale);
    assert.ok(html.includes('<strong>' + number.format(7) + ' / ' + number.format(10) + '</strong>'));
    assert.match(html, locale === 'en' ? /prepared example output/ : /معدّة مسبقًا/);
    assert.match(html, locale === 'en' ? /separate manual support/ : /الدعم اليدوي المنفصل/);
    assert.doesNotMatch(html, /ce000000|school-source-v1|<form|<input|<button|<select/);
    assert.match(html, locale === 'en' ? /unmeasured|not yet reassessed/ : /غير مقاسة|تقييمه/);
  });
  test(locale + ' unknown and denied source states never invent evidence or approval', () => {
    for (const state of ['unknown', 'denied', 'loading'] as const) {
      const html = renderToStaticMarkup(createElement(view.DemoPersonalizationView, { locale, data: null, state }));
      assert.match(html, new RegExp('data-state="' + state + '"'));
      assert.equal((html.match(/<h1>/g) ?? []).length, 1);
      assert.doesNotMatch(html, /data-personalization-card=|Teacher-reviewed checking practice|demo-personalization__native|data-personalization-state="ready"/);
    }
  });
}

test('a changed academic source withholds the personalization story instead of implying a current decision', () => {
  assert.throws(() => view.parseDemoPersonalization({ runId: id(21), context }, { ...practice, requiresReview: true, reviewReason: 'ACADEMIC_SOURCE_CHANGED' }, manifest));
});

test('native rubric evidence remains its original descriptors without a numeric score', () => {
  const nativeResult = { type: 'rubric', rubricId: id(30), rubricTitle: 'Checking evidence rubric', rubricVersion: 'school-rubric-v1', policyVersion: 1, normalized: null, criteria: [{ criterionKey: 'check', criterionTitle: 'Checking method', levelKey: 'explained', levelLabel: 'Explained with evidence', levelDescription: 'Explains how every counter is included.' }] };
  const result = { resultId: id(13), evidenceId: id(25), referenceId: id(24), referenceVersion: 'school-source-v1', nativeResult };
  const data = view.parseDemoPersonalization({ runId: id(21), context: { ...context, recentResults: [result] } }, practice, manifest);
  const html = renderToStaticMarkup(createElement(Providers, { initialLocale: 'en', config: { supabaseUrl: '', supabasePublishableKey: '', apiUrl: '' }, children: createElement(view.DemoPersonalizationView, { locale: 'en', data }) }));
  assert.match(html, /Checking evidence rubric/); assert.match(html, /Explained with evidence/); assert.match(html, /Explains how every counter is included/);
  assert.doesNotMatch(html, /demo-personalization__native|data-state="unknown"/);
});
