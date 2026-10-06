import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { registerHooks } from 'node:module';
import { CommandJournal } from '../../../shared/api/client.ts';
import { FormDrafts } from '../../../shared/session/form-drafts.ts';
const fixture = { app: {} as Record<string, unknown> };
Object.assign(globalThis, { React, progressHeadingFixture: fixture });
registerHooks({ load(url, context, nextLoad) {
  if (url.replaceAll('\\', '/').endsWith('/shared/session/providers.tsx')) return { format: 'module', shortCircuit: true, source: 'export function useApp(){return globalThis.progressHeadingFixture.app}' };
  return nextLoad(url, context);
} });
const { ProgressWorkspace } = await import('../components/progress-workspace.tsx');
function render(locale: 'en' | 'ar', ready = false) {
  fixture.app = { locale, status: ready ? 'ready' : 'not-configured', online: true, apiUrl: '', accessToken: ready ? 'synthetic' : null, accessGeneration: 1,
    commandJournal: new CommandJournal(), formDrafts: new FormDrafts(), refreshAccess() {}, reportDiagnostic() {}, membership: ready ? { userId: 'current-student', schoolId: 'school', role: 'student', displayName: 'Alex Hassan', entitlements: ['learning', 'assessment', 'curriculum', 'learner.state'] } : null };
  return renderToStaticMarkup(createElement(ProgressWorkspace));
}
test('Progress owns one localized h1 without a guessed learner while current access is unavailable', () => {
  for (const locale of ['en', 'ar'] as const) {
    const html = render(locale);
    assert.equal((html.match(/<h1/g) ?? []).length, 1); assert.match(html, locale === 'en' ? /<h1[^>]*>Progress<\/h1>/ : /<h1[^>]*>التقدّم<\/h1>/);
    assert.doesNotMatch(html, /learner-detail-heading|progress-detail/);
  }
});
test('current learner Progress keeps its owned h1 while native snapshot loading has a separate exact h2', () => {
  const html = render('en', true);
  assert.equal((html.match(/<h1/g) ?? []).length, 1); assert.match(html, /<h1[^>]*>Progress<\/h1>/);
  assert.match(html, /<h2[^>]*learner-detail-heading[^>]*>.*Alex Hassan/); assert.match(html, /Loading learner state/);
  assert.doesNotMatch(html, /<h1[^>]*>Alex Hassan/);
});
