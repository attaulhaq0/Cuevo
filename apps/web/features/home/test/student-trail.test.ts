import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { StudentTrailAssets, StudentTrailContext } from '../trail-model.ts';

// The Node/tsx feature runner also loads @cuevo/ui outside the web tsconfig.
// Supply the classic JSX runtime for that isolated test process only.
Object.assign(globalThis, { React });
const { StudentTrailView } = await import('../components/student-trail.tsx');

const assets: StudentTrailAssets = { background: '/background.webp', foxi: '/foxi.webp', lesson: '/lesson.webp', work: '/work.webp', feedback: '/feedback.webp', practice: '/practice.webp', reflect: '/reflect.webp', grow: '/grow.webp', milestone: '/milestone.webp' };
function context(): StudentTrailContext {
  return { displayName: null, schoolName: null, availability: 'ready', goal: null, task: null, stages: [{ key: 'lesson', title: 'Read the lesson', description: 'Explore current material', state: 'unknown' }], feedback: null, upcoming: null, recognition: { status: 'unavailable', totalPoints: null, periodLabel: null, currentMilestone: null, entries: [] }, classChallenge: null, help: null, companion: { visible: false, name: 'Foxi' } };
}
function render(value: StudentTrailContext, locale: 'en' | 'ar' = 'en') { return renderToStaticMarkup(createElement(StudentTrailView, { context: value, assets, locale })); }

test('unknown context does not turn missing recognition into zero or invent human/source labels', () => {
  const html = render(context());
  assert.match(html, /Welcome back!/);
  assert.match(html, /Your next step is not available yet/);
  assert.match(html, /Recorded points are not available yet/);
  assert.doesNotMatch(html, /point-total|Noor|Maths|Level|Completed|student-trail__foxi-crop/);
});
test('zero is shown only for a confirmed recorded total and never while processing', () => {
  const value = context(); value.recognition = { ...value.recognition, status: 'recorded', totalPoints: 0 };
  assert.match(render(value), /point-total.*?<strong>0<\/strong>/);
  value.recognition.status = 'processing';
  const pending = render(value); assert.doesNotMatch(pending, /point-total/); assert.match(pending, /still being processed/);
});
test('completion ticks require an explicit completed stage; a submitted task is still awaiting review', () => {
  const value = context(); value.stages[0].state = 'available';
  value.task = { title: 'Compare your two explanations', description: 'Read your current attempt', course: 'Learning course', unit: null, state: 'submitted', primaryAction: null };
  assert.doesNotMatch(render(value), /student-trail__complete/);
  assert.match(render(value), /Submitted for review/);
  value.stages[0].state = 'complete'; assert.match(render(value), /aria-label="Completed"/);
});
test('authorized human context is rendered as text, with explicit missing unit and teacher states', () => {
  const value = context(); value.displayName = 'Samira <script>';
  value.task = { title: 'Explain a different method', description: 'Compare your approaches', course: 'Problem solving · Year 6', unit: null, state: 'revision', primaryAction: { label: 'Revise this work', onClick() {} } };
  value.feedback = { teacherName: null, teacherContext: null, dateLabel: null, text: 'Keep your original explanation visible.' };
  const html = render(value); assert.match(html, /Samira &lt;script&gt;/); assert.match(html, /Problem solving · Year 6/); assert.match(html, /Unit information is not available/); assert.match(html, /Teacher information is not available/); assert.match(html, /Date is not available/); assert.match(html, /Revise this work/);
});
test('denied scope does not render stale learner/task/feedback/recognition content', () => {
  const value = context(); value.availability = 'denied'; value.displayName = 'Private learner';
  value.task = { title: 'Private task', description: 'Private content', course: 'Private course', unit: 'Private unit', state: 'available', primaryAction: null };
  const html = render(value); assert.match(html, /current access/); assert.doesNotMatch(html, /Private|background.webp|foxi.webp|milestone.webp/);
});
test('offline scope clears populated protected facts and actions until current context is checked again', () => {
  const value = context(); value.availability = 'offline'; value.displayName = 'Private learner';
  value.task = { title: 'Private task', description: 'Private content', course: 'Private course', unit: 'Private unit', state: 'available', primaryAction: { label: 'Open private work', onClick() {} } };
  value.recognition = { ...value.recognition, status: 'recorded', totalPoints: 30 };
  const html = render(value); assert.match(html, /You are offline/); assert.doesNotMatch(html, /Private|private work|point-total|background.webp/);
});
test('Arabic uses the same composition and localized unknown states with deterministic initial markup', () => {
  const value = context(); const first = render(value, 'ar'); const second = render(value, 'ar');
  assert.equal(first, second); assert.match(first, /lang="ar" dir="rtl"/); assert.match(first, /مرحبًا بعودتك/); assert.match(first, /النقاط المسجّلة غير متاحة بعد/);
});

test('known Student greeting uses localized Arabic punctuation and keeps the name bidi-isolated', () => {
  const value = context(); value.displayName = 'Lina Al-Kuwari';
  assert.match(render(value, 'ar'), /مرحبًا، <bdi>Lina Al-Kuwari<\/bdi>!/);
  assert.match(render(value, 'en'), /Hello, <bdi>Lina Al-Kuwari<\/bdi>!/);
});
test('view has no autonomous award path and does not turn unknown participation into an unchecked choice', () => {
  const value = context(); value.classChallenge = { title: 'Share a method', description: 'Learning together', periodLabel: null, alias: null, participating: null, participationLabel: 'Participation is unavailable' };
  const html = render(value); assert.match(html, /role="status">Participation is unavailable/); assert.doesNotMatch(html, /type="checkbox"/); assert.doesNotMatch(html, /\b(?:Level|XP|earned|award)\b/i);
});
test('pending secondary read and presentation actions retain disabled and busy semantics', () => {
  const value = context(); const pending = { label: 'Pending records', pending: true, onClick() {} };
  value.upcoming = { title: 'Next current task', description: 'Read your next task', availabilityLabel: null, action: null, viewAll: pending };
  value.recognition.action = pending;
  value.companion.hideAction = { ...pending, label: 'Pending presentation' };
  const html = render(value);
  assert.equal((html.match(/disabled="" aria-busy="true"/g) || []).length, 3);
});
test('primary task precedes stage navigation in keyboard order and completed navigation names the confirmed state', () => {
  const value = context(); value.task = { title: 'Compare explanations', description: 'Your current work', course: null, unit: null, state: 'available', primaryAction: { label: 'Open current task', onClick() {} } };
  value.stages[0] = { ...value.stages[0], state: 'complete', action: { label: 'Open lesson', onClick() {} } };
  const html = render(value); assert.ok(html.indexOf('Open current task') < html.indexOf('aria-label="Read the lesson. Completed. Open lesson"')); assert.match(html, /Completed. Open lesson/);
});
test('task-first reading order also places goal and character preference controls after the current action', () => {
  const value = context(); value.task = { title: 'Compare explanations', description: 'Your current work', course: null, unit: null, state: 'available', primaryAction: { label: 'Open current task', onClick() {} } };
  value.goal = { text: 'Make a clearer explanation', action: { label: 'Edit my goal', onClick() {} } };
  value.companion.hideAction = { label: 'Change my character preference', onClick() {} };
  const html = render(value); assert.ok(html.indexOf('Open current task') < html.indexOf('Edit my goal')); assert.ok(html.indexOf('Edit my goal') < html.indexOf('Change my character preference'));
});

test('current-step illustration composes one separate platform with an unstretched subject', () => {
  const value = context();
  const html = renderToStaticMarkup(createElement(StudentTrailView, { context: value, assets: { ...assets, workSubject: '/work-subject.webp', pedestal: '/pedestal.svg' }, locale: 'en' }));
  assert.match(html, /student-trail__work-subject/);
  assert.match(html, /student-trail__pedestal/);
  assert.doesNotMatch(html, /class="student-trail__illustration student-trail__work"/);
  assert.equal((html.match(/src="\/pedestal.svg"/g) || []).length, 1);
});

test('sole heading owns workspace focus in ready and denied states and current native feedback remains supplied UI', () => {
  const value = context(); value.feedback = { teacherName: null, teacherContext: null, dateLabel: null, text: 'Use the released descriptors.' };
  const headingRef = { current: null };
  const html = renderToStaticMarkup(createElement(StudentTrailView, { context: value, assets, locale: 'en', headingRef, nativeFeedback: createElement('dl', { 'aria-label': 'Released native rubric' }, createElement('dd', null, 'School-authored descriptor')) }));
  assert.equal((html.match(/<h1/g) || []).length, 1); assert.match(html, /<h1 tabindex="-1"/); assert.match(html, /Released native rubric/); assert.match(html, /School-authored descriptor/);
  value.availability = 'denied';
  const denied = renderToStaticMarkup(createElement(StudentTrailView, { context: value, assets, locale: 'en', headingRef }));
  assert.equal((denied.match(/<h1/g) || []).length, 1); assert.match(denied, /<h1 tabindex="-1"/);
});

test('confirmed empty work does not receive submitted or unknown task status', () => {
  const value = context(); value.stages = [];
  value.task = { title: 'No new work is waiting', description: 'Current available records are complete.', course: null, unit: null, state: 'empty', primaryAction: null };
  const html = render(value); assert.match(html, /No new work is waiting/); assert.doesNotMatch(html, /student-trail__record-state|Submitted for review/);
});

test('selected work shows the learner reflection and review state without repeating native grades or claiming family publication', () => {
  const value = context();
  value.portfolio = { state: 'ready', items: [{ title: 'My selected explanation', reflection: 'I checked the reason for each step.', contextLabel: 'Reasoning · Cedar class · Year 6', reviewed: false, dateLabel: '4 Oct 2026' }], action: { label: 'Open my portfolio', onClick() {} } };
  const html = render(value);
  assert.match(html, /My selected work/); assert.match(html, /I checked the reason for each step/); assert.match(html, /Waiting for review/); assert.match(html, /Open my portfolio/);
  assert.match(html, /<p class="student-trail__reflection" dir="auto">I checked the reason/); assert.doesNotMatch(html, /<details class="student-trail__reflection"/);
  assert.doesNotMatch(html, /Parent approved|score|<textarea/);
  value.availability = 'denied'; assert.doesNotMatch(render(value), /My selected explanation|I checked the reason/);
});

test('portfolio empty and loading are distinct and do not remove independent current work', () => {
  const value = context(); value.task = { title: 'Current authorized task', description: 'Explain one idea', course: null, unit: null, state: 'available', primaryAction: null };
  value.portfolio = { state: 'empty', items: [] };
  assert.match(render(value), /Choose released work/);
  value.portfolio.state = 'loading'; const html = render(value); assert.match(html, /Checking your selected work/); assert.doesNotMatch(html, /Choose released work/); assert.match(html, /Current authorized task/);
});

test('the period picker and quiet action have one supplied owner within the desk composition', () => {
  const value = context();
  const html = renderToStaticMarkup(createElement(StudentTrailView, { context: value, assets, locale: 'en', periodControl: createElement('select', { 'aria-label': 'Recognition period' }, createElement('option', null, 'Choose a period')), presentationAction: { label: 'Use quiet presentation', onClick() {} } }));
  assert.equal((html.match(/aria-label="Recognition period"/g) || []).length, 1); assert.equal((html.match(/Use quiet presentation/g) || []).length, 1);
  assert.match(html, /student-trail__desk/);
});

test('Student task continuation stays with its current task panel and no repeated footer navigation appears', () => {
  const value = context();
  const html = renderToStaticMarkup(createElement(StudentTrailView, { context:value, assets, upcomingControls:createElement('button',null,'Load current tasks') }));
  assert.equal((html.match(/Load current tasks/g) ?? []).length,1);
  const upcoming = html.slice(html.indexOf('student-trail__upcoming '),html.indexOf('student-trail__bottom-row'));
  assert.match(upcoming,/Load current tasks/);
  assert.doesNotMatch(html,/<footer|student-trail__footer|Upcoming school events|Open class community/);
});
