import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CommandJournal, LearningApiError } from '../../../shared/api/client.ts';
import { FormDrafts } from '../../../shared/session/form-drafts.ts';
import { getDictionary } from '../../../shared/i18n/locale.ts';
import type { PortfolioItem } from '../model.ts';

const base = { loaded: true, loading: false, loadingMore: false, error: null, moreError: null, nextCursor: null, loadMore() {} };
const fixture = { app: {} as Record<string, unknown>, items: [] as unknown[], state: {} as Record<string, unknown> };
Object.assign(globalThis, { React, portfolioCoordinatorFixture: fixture });
// Only current session/read inputs are replaced. The real Portfolio owner,
// parsers, role controls, native result and feedback/error surfaces are rendered.
registerHooks({ load(url, context, nextLoad) {
  const path = url.replaceAll('\\', '/');
  if (path.endsWith('/shared/session/providers.tsx')) return { format: 'module', shortCircuit: true, source: 'export function useApp(){return globalThis.portfolioCoordinatorFixture.app}' };
  if (path.endsWith('/shared/hooks/use-paginated-query.ts')) return { format: 'module', shortCircuit: true, source: 'export function usePaginatedLearningQuery(path,parse){const f=globalThis.portfolioCoordinatorFixture;const source=path?.startsWith("/v1/portfolio/items?")?{...f.state,data:f.items}:{loaded:true,loading:false,loadingMore:false,error:null,moreError:null,nextCursor:null,data:[]};return{...source,data:source.data.map(parse),loadMore(){}}}' };
  return nextLoad(url, context);
} });
const { PortfolioWorkspace } = await import('../components/portfolio-workspace.tsx');
function render(locale: 'en' | 'ar' = 'en', items: unknown[] = [], state: Record<string, unknown> = {}) {
  fixture.items = items; fixture.state = { ...base, ...state };
  fixture.app = { locale, dictionary: getDictionary(locale), online: true, status: 'ready', accessGeneration: 1, selectedChildId: '', accessToken: 'synthetic-token', apiUrl: 'https://fixture.invalid', commandJournal: new CommandJournal(), formDrafts: new FormDrafts(), refreshAccess() {}, reportDiagnostic() {}, selectChild() {}, membership: { role: 'coordinator', schoolId: 'school', userId: 'reviewer', entitlements: ['learning', 'assessment', 'curriculum', 'portfolio'], school: { name: 'Reference school' } } };
  return renderToStaticMarkup(createElement(PortfolioWorkspace));
}
const item: PortfolioItem = { id: 'item', revisionId: 'revision', revision: 1, learnerId: 'learner', sourceModel: 'numeric', title: 'My explanation', reflection: 'I checked each step.', createdAt: '2026-10-05T09:00:00Z', feedback: 'Explain the check.', featured: false, approvalState: 'REVIEWED', parentVisible: false, reviewedAt: '2026-10-05T10:00:00Z', evidenceId: 'evidence', resultId: 'result', submissionId: 'submission', referenceId: 'objective', referenceVersion: 'v1', policyVersion: 1, nativeResult: { type: 'numeric', score: 0, maxScore: 10, policyVersion: 1 }, assessmentTitle: 'Explain a method', referenceTitle: 'Checking steps', submissionKind: 'TEXT', sourceWorkApproved: false, identity: { status: 'READY', learnerName: 'Alex Reed', className: 'Cedar', yearGroupName: 'Year 4', academicYearName: '2026–2027', courseTitle: 'Reasoning', assessmentTitle: 'Explain a method', submittedAt: '2026-10-05T08:00:00Z', submissionRevision: 1 } };

test('Coordinator empty Portfolio uses read-only guidance and no author or sharing controls in both languages', () => {
  for (const locale of ['en', 'ar'] as const) {
    const html = render(locale);
    assert.match(html, locale === 'en' ? /Read the permitted selected work and learner reflections\./ : /اقرأ الأعمال المختارة وتأملات الطلاب المتاحة ضمن صلاحياتك\./);
    assert.match(html, locale === 'en' ? /No permitted selected work is available/ : /لا تتاح أعمال مختارة ضمن صلاحياتك/);
    assert.match(html, locale === 'en' ? /<h2>No permitted selected work is available<\/h2>/ : /<h2>لا تتاح أعمال مختارة ضمن صلاحياتك<\/h2>/);
    assert.doesNotMatch(html, /before deciding what to share|Start with a piece of work|قبل اتخاذ قرار بشأن المشاركة|ابدأ بعمل اخترته/);
    assert.doesNotMatch(html, /portfolio-create|portfolio-organization|portfolio-review-actions|portfolio-private-files/);
    assert.equal((html.match(/<button /g) ?? []).length, 1, 'Only the existing Refresh action is offered in this confirmed empty state');
  }
});

test('Coordinator populated Portfolio starts with a named directory and withholds private reading until explicit selection', () => {
  const html = render('en', [item]);
  for (const label of ['My explanation', 'Alex Reed', 'Cedar', 'Year 4', '2026–2027']) assert.ok(html.includes(label), label);
  assert.match(html,/portfolio-reading-directory/);
  assert.doesNotMatch(html,/I checked each step\.|Explain the check\.|portfolio-item-layout/);
  assert.match(html, /Read the permitted selected work and learner reflections\./);
  assert.doesNotMatch(html, /portfolio-review-actions|portfolio-organization|portfolio-private-files|before deciding what to share/);
  assert.doesNotMatch(html, />Read submitted work<|>Edit reflection<|>Review selected work<|>Revoke parent sharing</);
});

test('Coordinator Portfolio loading and denied reads cannot show the confirmed empty state', () => {
  for (const state of [{ loading: true, loaded: false }, { error: new LearningApiError('denied') }]) {
    const html = render('en', [], state);
    assert.doesNotMatch(html, /class="portfolio-empty"/);
    assert.doesNotMatch(html, /portfolio-create|portfolio-review-actions/);
  }
});
