import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Providers } from '../../../shared/session/providers.tsx';
import { LearningApiError } from '../../../shared/api/client.ts';
import { SchoolSourceContinuation } from '../components/source-continuation.tsx';

type Continuation = { nextCursor: string | null; loading: boolean; loadingMore: boolean; loaded: boolean; moreError: LearningApiError | null; loadMore(): void };
const empty: Continuation = { nextCursor: null, loading: false, loadingMore: false, loaded: true, moreError: null, loadMore() {} };
function render(query: Continuation, allowPage = true) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'React'); Object.defineProperty(globalThis, 'React', { configurable: true, value: React });
  try { return renderToStaticMarkup(createElement(Providers, { initialLocale: 'en', config: { supabaseUrl: '', supabasePublishableKey: '', apiUrl: '' }, children: createElement(SchoolSourceContinuation, { query, label: 'Recorded attendance', allowPage }) })); }
  finally { if (previous) Object.defineProperty(globalThis, 'React', previous); else Reflect.deleteProperty(globalThis, 'React'); }
}
test('finished or disabled school source readers do not reserve empty continuation rows', () => {
  assert.equal(render(empty), '');
  assert.equal(render({ ...empty, loaded: false }), '');
});
test('actual continuation keeps its named paging control and original callback', () => {
  const html = render({ ...empty, nextCursor: 'next-current-page' });
  assert.match(html, /Load more: Recorded attendance/);
  assert.match(html, /Recorded attendance/);
});
test('source continuation errors remain visible even when there is no next cursor', () => {
  const html = render({ ...empty, moreError: new LearningApiError('unavailable') });
  assert.match(html, /role="alert"/);
  assert.match(html, /school service is unavailable/);
});
test('a denied parent continuation never exposes a paging control and retains its refusal', () => {
  assert.equal(render({ ...empty, nextCursor: 'denied-page' }, false), '');
  const html = render({ ...empty, nextCursor: 'denied-page', moreError: new LearningApiError('denied') }, false);
  assert.match(html, /role="alert"/); assert.doesNotMatch(html, /Load more/);
});
