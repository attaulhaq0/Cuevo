import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StudentAssessmentJourneyLink } from '../components/learning-workspace.tsx';
import { CourseView } from '../components/course-editor.tsx';
import { Providers } from '../../../shared/session/providers.tsx';
import { learningAr, learningEn } from '../messages.ts';
import type { Assessment } from '../model.ts';

Object.assign(globalThis, { React });
const task = { id: 'task-source', courseId: 'course-source', title: 'Explain one method' } as Assessment;
test('direct Student task offers its exact course journey without mounting another command owner', () => {
  let calls = 0;
  const onOpen = (courseId: string) => { assert.equal(courseId, task.courseId); calls++; };
  const element = createElement(StudentAssessmentJourneyLink, { assessment: task, locale: 'en', onOpen });
  const html = renderToStaticMarkup(element);
  assert.match(html, /Open learning journey/);
  assert.match(html, /course’s units and lessons/);
  assert.doesNotMatch(html, /task-source|course-source|<form|level|points|mastery/);
  assert.equal(calls, 0);
  const arabic = renderToStaticMarkup(createElement(StudentAssessmentJourneyLink, { assessment: task, locale: 'ar', onOpen }));
  assert.match(arabic, /فتح رحلة التعلّم/);
  assert.doesNotMatch(arabic, /course-source|task-source|<form/);
  assert.equal(calls, 0);
  const link = StudentAssessmentJourneyLink({ assessment: task, locale: 'ar', onOpen });
  link.props.children[1].props.onClick();
  assert.equal(calls, 1);
});

test('a course opened from one task names its return destination in English and Arabic', () => {
  for (const locale of ['en', 'ar'] as const) {
    const t = locale === 'ar' ? learningAr : learningEn;
    const course = createElement(CourseView, { courseId: task.courseId, canAuthor: false, onBack() {}, backLabel: t.backTask });
    const html = renderToStaticMarkup(createElement(Providers, { initialLocale: locale, config: { apiUrl: '', supabaseUrl: '', supabasePublishableKey: '' }, children: course }));
    assert.ok(html.includes(t.backTask));
    assert.ok(!html.includes(t.backCourses));
    assert.doesNotMatch(html, /course-source|task-source|<form/);
  }
});
