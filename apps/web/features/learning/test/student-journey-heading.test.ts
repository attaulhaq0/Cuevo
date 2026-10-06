import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StudentLearningJourney } from '../components/student-learning-journey.tsx';
import { Providers } from '../../../shared/session/providers.tsx';
import type { Lesson } from '../model.ts';
import { studentJourneyAr, studentJourneyEn } from '../student-journey-messages.ts';

Object.assign(globalThis, { React });
const lesson: Lesson = { id: 'lesson', title: 'Check the method', sequence: 1, body: 'Read the example.', status: 'PUBLISHED', activities: [{ id: 'activity', title: 'Explain your choice', kind: 'practice', instructions: 'Use the method and explain one step.', sequence: 1, completion: null }] };

test('content-first lesson and activity reading do not repeat the title already supplied by the current page', () => {
  for(const activityId of [null,'activity']){
    const html=renderToStaticMarkup(createElement(Providers,{initialLocale:'en',config:{apiUrl:'',supabaseUrl:'',supabasePublishableKey:''},children:createElement(StudentLearningJourney,{lesson,courseId:'course',activityId,pageHeading:true,onSelect(){},renderWork(){return null;}})}));
    assert.doesNotMatch(html,/<h2[^>]*>(Check the method|Explain your choice)<\/h2>/);
    assert.match(html,/Your learning journey/);
    assert.match(html,activityId?/Use the method and explain one step/:/Read the example/);
  }
});

test('lesson and selected activity panels follow the workspace heading without skipped levels in both languages', () => {
  for (const locale of ['en', 'ar'] as const) {
    const t = locale === 'ar' ? studentJourneyAr : studentJourneyEn;
    for (const activityId of [null, 'activity']) {
      let commands = 0;
      const journey = createElement(StudentLearningJourney, { lesson, courseId: 'course', activityId, onSelect() { commands++; }, renderWork() { commands++; return createElement('form'); } });
      const html = renderToStaticMarkup(createElement(Providers, { initialLocale: locale, config: { apiUrl: '', supabaseUrl: '', supabasePublishableKey: '' }, children: createElement('main', null, createElement('h1', null, locale === 'ar' ? 'التعلّم' : 'Learning'), journey) }));
      assert.ok(html.includes(`<h2>${t.title}</h2>`));
      assert.match(html, /<h2 tabindex="-1">(?:Explain your choice|Check the method)<\/h2>/);
      if (activityId) assert.ok(html.includes(`<h3>${t.activityThinking}</h3>`));
      const levels = [...html.matchAll(/<h([1-6])(?:\s|>)/g)].map(match => Number(match[1]));
      assert.equal(levels.filter(level => level === 1).length, 1);
      levels.slice(1).forEach((level, index) => assert.ok(level <= levels[index] + 1, `Heading level ${levels[index]} must precede ${level} without a jump`));
      assert.equal(commands, 0);
      assert.doesNotMatch(html, /<form/);
    }
  }
});
