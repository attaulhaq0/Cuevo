import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Providers } from '../../../shared/session/providers.tsx';
const navigation = await import('../components/staff-navigation.tsx').catch(() => ({} as typeof import('../components/staff-navigation.tsx')));
import type { Assessment, CourseDetail, Submission } from '../model.ts';

const course: CourseDetail = { id: 'course', classId: 'class', subjectId: 'subject', title: 'Learning strategies', description: 'Show your thinking', status: 'PUBLISHED', createdAt: '2026-10-03T00:00:00Z', selectedUnitId: 'unit', units: [{ id: 'unit', title: 'Checking', sequence: 1, lessons: [{ id: 'lesson', title: 'Explain your approach', sequence: 1, body: 'Protected lesson body', status: 'PUBLISHED', activities: [{ id: 'activity', title: 'Explain one choice', kind: 'practice', sequence: 1, instructions: 'Protected activity instructions' }] }] }] };
const assessment: Assessment = { id: 'task', courseId: 'course', courseTitle: 'Learning strategies', title: 'Explain one choice', instructions: 'Exact instructions', status: 'PUBLISHED', dueAt: null, policyVersion: 1, availableFrom: null, availableUntil: null, allowLate: false, assignmentState: 'OPEN', availabilityVersion: 1, submissionKind: 'TEXT', model: 'numeric', maxScore: 4, rubricId: null };
const submission: Submission = { id: 'work', assessmentId: 'task', assessmentTitle: 'Explain one choice', learnerId: 'learner', learnerName: 'Alex Reed', content: '', responseKind: 'FILE', artifactCount: 1, status: 'SUBMITTED', revision: 1, submittedAt: '2026-10-03T00:00:00Z', previousSubmissionId: null, sourceReturnId: null, returnId: null, returnFeedback: null, returnedAt: null };
function render(child: React.ReactNode, locale: 'en' | 'ar' = 'en') {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'React');
  Object.defineProperty(globalThis, 'React', { configurable: true, value: React });
  try { return renderToStaticMarkup(createElement(Providers, { initialLocale: locale, config: { supabaseUrl: '', supabasePublishableKey: '', apiUrl: '' }, children: child })); }
  finally { if (previous) Object.defineProperty(globalThis, 'React', previous); else Reflect.deleteProperty(globalThis, 'React'); }
}

test('staff course outline names the exact ancestry without mounting content or resource commands', () => {
  assert.equal(typeof navigation.CoursePreparationOutline, 'function');
  const html = render(createElement(navigation.CoursePreparationOutline, { course, resource: 'activity', lessonId: 'lesson', activityId: 'activity', disabled: false, onSelect() {} }));
  for (const text of ['Learning strategies', 'Checking', 'Explain your approach', 'Explain one choice']) assert.ok(html.includes(text));
  assert.match(html, /aria-current="page"/);
  assert.doesNotMatch(html, /Protected lesson body|Protected activity instructions|type="file"|<form/);
});

test('a hundred staff tasks remain a directory with one named selection and no preparation or resource forms', () => {
  assert.equal(typeof navigation.StaffAssessmentDirectory, 'function');
  const tasks = Array.from({ length: 100 }, (_, index) => ({ ...assessment, id: `task-${index}`, title: `Checking task ${index}` }));
  const html = render(createElement(navigation.StaffAssessmentDirectory, { assessments: tasks, selectedId: 'task-3', disabled: false, onSelect() {} }));
  assert.equal((html.match(/data-assessment-choice=/g) ?? []).length, 100);
  assert.equal((html.match(/aria-current="true"/g) ?? []).length, 1);
  assert.doesNotMatch(html, /<form|type="file"|Exact instructions/);
});

test('draft tasks and Arabic unknown course context remain selectable without an invented scale or identity', () => {
  assert.equal(typeof navigation.StaffAssessmentDirectory, 'function');
  const draft = { ...assessment, courseTitle: null, status: 'DRAFT', assignmentState: 'CLOSED', preparationVersion: 1, intendedSubmissionKind: 'QUIZ', intendedModel: 'rubric' } as Assessment;
  const html = render(createElement(navigation.StaffAssessmentDirectory, { assessments: [draft], selectedId: null, disabled: false, onSelect() {} }), 'ar');
  assert.ok(html.includes('Explain one choice'));
  assert.doesNotMatch(html, /Learning strategies|task-3|<form/);
  assert.match(html, /مسودة|خاص/);
});

test('document work has a named response type before opening its exact source and never appears as blank text', () => {
  assert.equal(typeof navigation.StaffSubmissionDirectory, 'function');
  const html = render(createElement(navigation.StaffSubmissionDirectory, { submissions: [submission], selectedId: null, disabled: false, onSelect() {} }));
  assert.match(html, /Alex Reed|Explain one choice/);
  assert.match(html, /Documents-only response/);
  assert.doesNotMatch(html, /<form|submission\.content|type="file"/);
});

test('the submitted-work directory has a distinct purpose name from the exact submitted-source reader',()=>{
  const html=render(createElement(navigation.StaffSubmissionDirectory,{submissions:[submission],selectedId:submission.id,disabled:false,onSelect(){}}));
  assert.match(html,/aria-label="Submitted work directory"/);
  assert.doesNotMatch(html,/aria-label="Submitted work"/);
});

test('a selected staff directory keeps every current choice behind a native mobile disclosure',()=>{
  const tasks=Array.from({length:100},(_,index)=>({...assessment,id:`task-${index}`,title:`Checking task ${index}`}));
  const html=render(createElement(navigation.StaffAssessmentDirectory,{assessments:tasks,selectedId:'task-99',disabled:false,onSelect(){}}));
  assert.match(html,/<details[^>]*class="learning-staff-choice-disclosure"/);
  assert.match(html,/<summary[^>]*>[^]*Checking task 99[^]*<\/summary>/);
  assert.equal((html.match(/data-assessment-choice=/g)??[]).length,100);
});
