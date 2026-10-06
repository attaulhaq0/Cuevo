import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Providers } from '../../session/providers.tsx';
import { LearningError } from '../../components/feedback.tsx';
import { LearningApiError } from '../../api/client.ts';

function render(locale: 'en' | 'ar', error: LearningApiError) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'React');
  Object.defineProperty(globalThis, 'React', { configurable: true, value: React });
  try { return renderToStaticMarkup(createElement(Providers, { initialLocale: locale, config: { supabaseUrl: '', supabasePublishableKey: '', apiUrl: '' }, children: createElement(LearningError, { error }) })); }
  finally { if (descriptor) Object.defineProperty(globalThis, 'React', descriptor); else Reflect.deleteProperty(globalThis, 'React'); }
}

test('oversized content errors offer file and page recovery without asking users to divide a course', () => {
  const html = render('en', new LearningApiError('too-large', false, 'support-413'));
  assert.match(html, /content is too large/); assert.match(html, /smaller file/); assert.match(html, /school support/);
  assert.doesNotMatch(html, /divide the material|smaller courses/);
  assert.match(html, /role="alert"/); assert.ok(html.includes('support-413'));
});

test('Arabic oversized content guidance stays actionable and leaves uncertain retry semantics separate', () => {
  const html = render('ar', new LearningApiError('too-large'));
  assert.match(html, /المحتوى كبير جدًا/); assert.match(html, /ملفًا أصغر/);
  assert.doesNotMatch(html, /مقررات أصغر|تقسيم المحتوى/);
  const uncertain = render('en', new LearningApiError('unavailable', true));
  assert.match(uncertain, /Retry the same action without editing it/); assert.doesNotMatch(uncertain, /smaller file/);
});
