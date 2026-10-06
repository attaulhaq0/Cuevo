import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { SchoolAutomation } from '../automation-model.ts';
import { SchoolAutomationReading } from '../components/automation-reading.tsx';

const ids = ['LEARNER_STATE', 'ATTENTION', 'RECOGNITION', 'COMMUNICATION', 'INTELLIGENCE'] as const;
const conditions = { windowDays: 14, minimumDecline: null, maxScore: null, missingDueCount: null, practicePoints: null, revisionPoints: null, reflectionPoints: null, parentCommunicationEnabled: null, fixtureEnabled: null, liveEnabled: null, executionConfigured: null };
const review: SchoolAutomation = { windowStart: '2026-10-01T00:00:00Z', windowEnd: '2026-10-04T00:00:00Z', approvals: 'EXISTING_HUMAN_APPROVALS_UNCHANGED', policies: ids.map(id => ({ id, version: id === 'ATTENTION' ? 2 : null, configured: id === 'ATTENTION', enabled: id === 'ATTENTION', approvedBy: id === 'ATTENTION' ? 'Mariam Al-Nuaimi' : null, approvedAt: null, conditions })), execution: { scope: 'RETURNED_ALLOWLIST_EVENTS_IN_WINDOW', returned: 1, truncated: false, pending: 0, processing: 0, completed: 1, failed: 0, retried: 0, receiptCount: 1, latestCompletionAt: '2026-10-04T00:00:00Z', runs: [{ id: '10000000-0000-4000-8000-000000000001', family: 'LEARNER_STATE', state: 'COMPLETED', occurredAt: '2026-10-04T00:00:00Z', attemptCount: 1, error: null, completedAt: '2026-10-04T00:00:00Z', receiptRecorded: true }] } };
function render(selected: SchoolAutomation['policies'][number]['id'] | null = null, locale: 'en' | 'ar' = 'en', source = review) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'React'); Object.defineProperty(globalThis, 'React', { configurable: true, value: React });
  try { return renderToStaticMarkup(createElement(SchoolAutomationReading, { review: source, locale, selectedId: selected, onSelected() {}, onControl() {} })); }
  finally { if (previous) Object.defineProperty(globalThis, 'React', previous); else Reflect.deleteProperty(globalThis, 'React'); }
}
test('all five current policy labels remain selectable while only the actual selected rule is expanded', () => {
  const html = render('ATTENTION');
  assert.equal((html.match(/<option value=/g) ?? []).length, 5);
  assert.equal((html.match(/class="school-automation-policy"/g) ?? []).length, 1);
  assert.match(html, /Factual attention rules/); assert.match(html, /Minimum native-score decline|Observation window/);
  assert.match(html, /compatible current evidence/); assert.match(html, /Mariam Al-Nuaimi/); assert.match(html, /Approval date not recorded/);
  assert.doesNotMatch(html, /Refresh separate native academic and observed-action projections/);
});
test('initial selected policy comes from the current learner-state record and unknown approval remains unknown', () => {
  const html = render(); assert.match(html, /Learner state refresh/); assert.match(html, /Not configured/);
  assert.match(html, /Policy version<\/dt><dd>Unknown/); assert.match(html, /Approved by<\/dt><dd><bdi>Unknown/);
  assert.doesNotMatch(html, /Rule builder|Run automation|Retry job|value="null"/);
});
test('execution counts and every native receipt stay available inside a closed bounded disclosure', () => {
  const html = render();
  assert.match(html, /school-automation-runs"><summary/); assert.doesNotMatch(html, /school-automation-runs" open/);
  assert.match(html, /Queue processing completed/); assert.match(html, /Claim attempts/); assert.match(html, /Execution provenance/);
  assert.match(html, /10000000-0000-4000-8000-000000000001/);
  assert.match(html, /does not establish a learner outcome, XP award or cause/);
});
test('Arabic selection retains native policy facts and processing limitations without an English duplicate detail', () => {
  const html = render('COMMUNICATION', 'ar');
  assert.match(html, /اتصال داخل التطبيق ضمن الصلاحيات/); assert.match(html, /لا يعني تسليم بريد أو إشعار خارجي/);
  assert.equal((html.match(/class="school-automation-policy"/g) ?? []).length, 1);
  assert.doesNotMatch(html, /Permissioned in-app communication|Run automation/);
});
test('partial processing and failed native source remain review states while actual zero points remain zero', () => {
  const source: SchoolAutomation = { ...review, policies: review.policies.map(policy => policy.id === 'RECOGNITION' ? { ...policy, conditions: { ...policy.conditions, practicePoints: 0 } } : policy), execution: { ...review.execution, truncated: true, failed: 1, completed: 0, receiptCount: 0, latestCompletionAt: null, runs: [{ ...review.execution.runs[0], state: 'FAILED', error: 'LEASE_EXHAUSTED', receiptRecorded: false, completedAt: null }] } };
  const html = render('RECOGNITION', 'en', source);
  assert.match(html, /Practice points: 0/); assert.match(html, /2,000-event review limit/);
  assert.match(html, /Processing claims exhausted/); assert.doesNotMatch(html, /Recorded processed receipt<\/p>/);
});

test('zero returned runs in a truncated review remains partial rather than claiming no runs in the window',()=>{
 for(const locale of['en','ar']as const){const source:SchoolAutomation={...review,execution:{...review.execution,returned:0,truncated:true,pending:0,processing:0,completed:0,failed:0,retried:0,receiptCount:0,latestCompletionAt:null,runs:[]}};const html=render(null,locale,source);assert.doesNotMatch(html,locale==='en'?/No allowlisted events are recorded/:/لا توجد أحداث مسموحة مسجّلة/);assert.match(html,/data-state="review"/);assert.doesNotMatch(html,/data-state="empty"/);}
});
