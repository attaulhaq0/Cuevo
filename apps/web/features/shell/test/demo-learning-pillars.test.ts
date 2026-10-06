import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DemoLearningPillars } from '../components/demo-learning-pillars.tsx';
Object.assign(globalThis, { React });

test('rubric presentation preserves the pinned school example without assigning a learner level', () => {
  const source = JSON.parse(readFileSync(new URL('../../../../../supabase/seed/curriculum/synthetic-pathway-v1/assessment.json', import.meta.url), 'utf8'));
  const html = renderToStaticMarkup(createElement(DemoLearningPillars, { scene: 'rubric', locale: 'en' }));
  for (const criterion of source.rubric.criteria) for (const level of criterion.levels) {
    assert.ok(html.includes(criterion.title) && html.includes(level.label) && html.includes(level.description));
  }
  assert.match(html, /No level is selected/);
  assert.doesNotMatch(html, /<input|<select|aria-checked|data-result-id/);
});

for (const locale of ['en', 'ar'] as const) for (const scene of ['learning-loop', 'rubric', 'self-regulation', 'institution', 'signals'] as const) {
  test(locale + ' ' + scene + ' is a labeled presentation with one primary heading and no domain inputs', () => {
    const html = renderToStaticMarkup(createElement(DemoLearningPillars, { scene, locale }));
    assert.equal((html.match(/<h1>/g) ?? []).length, 1);
    assert.ok(html.includes('data-presentation-pillars="' + scene + '"'));
    assert.ok(html.includes('dir="' + (locale === 'ar' ? 'rtl' : 'ltr') + '"'));
    assert.doesNotMatch(html, /<form|<input|<textarea|data-result-id|[0-9a-f]{8}-[0-9a-f-]{27}/);
    assert.ok(html.includes(locale === 'ar' ? 'تصوّر توضيحي للعرض' : 'Presentation illustration'));
  });
}
