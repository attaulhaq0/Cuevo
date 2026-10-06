import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRequire } from 'node:module';
import { Providers } from '../../../shared/session/providers.tsx';
import { LearningApiError } from '../../../shared/api/client.ts';
import * as views from '../components/audit.tsx';
import type { SchoolAuditRow } from '../model.ts';
import { WorkspacePageHeading } from '@cuevo/ui';

Object.assign(globalThis, { React });
type Element = { textContent: string; querySelector(selector: string): Element | null; querySelectorAll(selector: string): Element[]; hasAttribute(name: string): boolean };
const { parse } = createRequire(import.meta.url)('next/dist/compiled/node-html-parser') as { parse(html: string): Element };
const row: SchoolAuditRow = { id: 'private-row', actorName: 'Mariam', action: 'school.guardian.configure', objectType: 'school_operation', objectId: 'private-object', objectName: null, outcome: 'succeeded', occurredAt: '2026-10-04T10:24:37Z', requestId: 'private-request' };
const source = { loading: false, loadingMore: false, error: null as LearningApiError | null, moreError: null as LearningApiError | null, nextCursor: 'next-cursor' as string | null };
function render(input = source, previous = false, next = true, locale: 'en' | 'ar' = 'en') {
  assert.equal(typeof views.SchoolAuditView, 'function');
  return renderToStaticMarkup(createElement(Providers, { initialLocale: locale, config: { supabaseUrl: '', supabasePublishableKey: '', apiUrl: '' }, children: createElement(views.SchoolAuditView, { source: input, rows: [row], locale, canPrevious: previous, canNext: next, onPrevious() {}, onNext() {}, onRefresh() {} }) }));
}
test('Audit cursor page renders one native source reader with Previous and Next and no fabricated totals', () => {
  const html = render(), document = parse(html);
  assert.equal(document.querySelectorAll('.school-audit-row').length, 1);
  assert.match(html, /Previous|Next/);
  assert.doesNotMatch(html, /Load more|Page \d+ of|Total records|of \d+ records/);
  assert.equal(document.querySelector('[data-audit-previous]')!.hasAttribute('disabled'), true);
  assert.equal(document.querySelector('[data-audit-next]')!.hasAttribute('disabled'), false);
});
test('Audit pending Next preserves the page and disables page navigation', () => {
  const document = parse(render({ ...source, loadingMore: true }, true));
  assert.equal(document.querySelectorAll('.school-audit-row').length, 1);
  assert.equal(document.querySelector('[data-audit-previous]')!.hasAttribute('disabled'), true);
  assert.equal(document.querySelector('[data-audit-next]')!.hasAttribute('disabled'), true);
});
test('Audit unavailable continuation keeps current facts and page retry without an all-clear claim', () => {
  const html = render({ ...source, moreError: new LearningApiError('unavailable') });
  assert.equal(parse(html).querySelectorAll('.school-audit-row').length, 1);
  assert.match(html, /loaded page of current records/);
  assert.doesNotMatch(html, /All records loaded/);
});
test('Audit current denied and loading sources withhold native facts and old page navigation', () => {
  for (const input of [{ ...source, error: new LearningApiError('denied') }, { ...source, moreError: new LearningApiError('unauthorized') }, { ...source, loading: true }]) {
    const document = parse(render(input, true));
    assert.equal(document.querySelectorAll('.school-audit-row').length, 0);
    assert.equal(document.querySelectorAll('[data-audit-next]').length, 0);
    assert.equal(document.querySelectorAll('[data-audit-previous]').length, 0);
  }
});
test('Audit Arabic uses the same single page and named navigation controls', () => {
  const html = render({ ...source, nextCursor: null }, true, false, 'ar'), document = parse(html);
  assert.match(html, /السابق|التالي/);
  assert.equal(document.querySelectorAll('.school-audit-row').length, 1);
  assert.equal(document.querySelector('[data-audit-next]')!.hasAttribute('disabled'), true);
});

test('content-first Audit keeps one page title and retains source limits and page navigation', () => {
  const html = renderToStaticMarkup(createElement(Providers, { initialLocale: 'en', config: { supabaseUrl: '', supabasePublishableKey: '', apiUrl: '' }, children: createElement(React.Fragment, null, createElement(WorkspacePageHeading, { title: 'School audit' }), createElement(views.SchoolAuditView, { source, rows: [row], locale: 'en', canPrevious: false, canNext: true, pageHeading: true, onPrevious() {}, onNext() {}, onRefresh() {} })) }));
  assert.equal((html.match(/>School audit<\//g) ?? []).length, 1); assert.match(html, /<h2>Family access change<\/h2>/); assert.match(html, /Private work and audit payloads are excluded/); assert.match(html, /data-audit-next/); assert.match(html, /Mariam/);
});
