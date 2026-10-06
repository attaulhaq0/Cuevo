import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { transformSync } from 'esbuild';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CommandJournal, LearningApiError } from '../../../shared/api/client.ts';
import { FormDrafts } from '../../../shared/session/form-drafts.ts';
import { commonAr, commonEn } from '../../../shared/i18n/common.ts';
import { getDictionary } from '../../../shared/i18n/locale.ts';
import type { PortfolioItem } from '../model.ts';

const id = (n: number) => `e5000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const item: PortfolioItem = { id: id(3), revisionId: id(4), revision: 1, learnerId: id(2), sourceModel: 'numeric', title: 'Selected explanation', reflection: 'Current private reflection', createdAt: '2026-10-05T09:00:00Z', feedback: 'Current teacher feedback', featured: false, approvalState: 'REVIEWED', parentVisible: false, reviewedAt: '2026-10-05T10:00:00Z', evidenceId: id(5), resultId: id(6), submissionId: id(7), referenceId: id(8), referenceVersion: 'v1', policyVersion: 1, nativeResult: { type: 'numeric', score: 0, maxScore: 10, policyVersion: 1 }, assessmentTitle: 'Explain a method', referenceTitle: 'Checking reasons', submissionKind: 'TEXT', sourceWorkApproved: false, identity: { status: 'READY', learnerName: 'School learner', className: 'Cedar', yearGroupName: 'Year 4', academicYearName: '2026–2027', courseTitle: 'Reasoning', assessmentTitle: 'Explain a method', submittedAt: '2026-10-05T08:00:00Z', submissionRevision: 1 } };
const base = { loaded: true, loading: false, loadingMore: false, error: null as LearningApiError | null, moreError: null as LearningApiError | null, nextCursor: null as string | null, context: 'current', loadMore() {} };
const fixture = { app: {} as Record<string, unknown>, items: [] as PortfolioItem[], history: [] as PortfolioItem[], page: { ...base }, historyPage: { ...base }, historyOpen: false };
Object.assign(globalThis, { React, portfolioNestedFixture: fixture, portfolioNestedCommonEn: commonEn, portfolioNestedCommonAr: commonAr });
registerHooks({ load(url, context, next) {
  const path = url.replaceAll('\\', '/');
  if (path.endsWith('/shared/session/providers.tsx')) return { format: 'module', shortCircuit: true, source: 'export function useApp(){return globalThis.portfolioNestedFixture.app}' };
  if (path.endsWith('/shared/hooks/use-api.ts')) return { format: 'module', shortCircuit: true, source: 'export function useApiQuery(){return{data:null,loading:false,error:null}}export function useApi(){const f=globalThis.portfolioNestedFixture;return{journal:f.app.commandJournal,t:f.app.locale==="ar"?globalThis.portfolioNestedCommonAr:globalThis.portfolioNestedCommonEn}}' };
  if (path.endsWith('/shared/hooks/use-paginated-query.ts')) return { format: 'module', shortCircuit: true, source: 'export function usePaginatedLearningQuery(path,parse){const f=globalThis.portfolioNestedFixture;const isHistory=path?.includes("/history?");const rows=isHistory?f.history:path?.startsWith("/v1/portfolio/items?")?f.items:[];return{...(isHistory?f.historyPage:path?.startsWith("/v1/portfolio/items?")?f.page:{loaded:!!path,loading:false,loadingMore:false,error:null,moreError:null,nextCursor:null,context:"other"}),data:rows.map(parse),loadMore(){}}}' };
  // The fixture opens only the original history intent; every source parser and state branch remains real.
  if (path.endsWith('/portfolio/components/portfolio-workspace.tsx')) return { format: 'module', shortCircuit: true, source: transformSync(readFileSync(new URL(url), 'utf8').replace('const [historyId, setHistoryId] = useState<string | null>(null);', `const [historyId, setHistoryId] = useState<string | null>(globalThis.portfolioNestedFixture.historyOpen?'${id(3)}':null);`), { loader: 'tsx', format: 'esm', jsx: 'automatic' }).code };
  return next(url, context);
} });
const { PortfolioWorkspace } = await import('../components/portfolio-workspace.tsx');
function reset(locale: 'en' | 'ar', role = 'coordinator', selected = false) { fixture.items = selected ? [item] : []; fixture.history = []; fixture.historyOpen = selected; fixture.page = { ...base }; fixture.historyPage = { ...base }; const drafts = new FormDrafts(); if (selected) drafts.saveModel(`${id(1)}:${id(2)}:/v1/portfolio/items:reading`, { itemId: item.id, revisionId: item.revisionId, revision: item.revision }); fixture.app = { locale, dictionary: getDictionary(locale), online: true, status: 'ready', apiUrl: 'https://fixture.invalid', accessToken: 'fictional', accessGeneration: 1, selectedChildId: '', selectChild() {}, refreshAccess() {}, reportDiagnostic() {}, formDrafts: drafts, commandJournal: new CommandJournal(), membership: { schoolId: id(1), userId: id(2), role, entitlements: ['portfolio', 'assessment'], school: { name: 'School' } } }; }
const render = () => renderToStaticMarkup(createElement(PortfolioWorkspace));
test('opened existing Portfolio history cannot render blank or claim no history after a terminal zero', () => {
  for (const locale of ['en', 'ar'] as const) for (const role of ['student', 'teacher', 'coordinator', 'admin']) { reset(locale, role, true); const html = render(); const history = html.slice(html.indexOf('class="portfolio-history"')); assert.match(history, /data-state="review"/); assert.match(history, locale === 'en' ? /history.*unconfirmed/i : /السجل.*مؤكد/); }
});
test('opened Portfolio history distinguishes incomplete zero and keeps its continuation/error owner', () => {
  for (const state of [{ loaded: false }, { nextCursor: id(90) }, { loadingMore: true }, { moreError: new LearningApiError('unavailable'), nextCursor: id(90) }]) { reset('en', 'coordinator', true); Object.assign(fixture.historyPage, state); const html = render().slice(render().indexOf('class="portfolio-history"')); assert.match(html, /data-state="unknown"/); assert.doesNotMatch(html, /data-state="empty"/); if ('nextCursor' in state) assert.match(html, /Load more/); if ('moreError' in state) assert.equal((html.match(/role="alert"/g) ?? []).length, 1); }
});
test('terminal empty Student Portfolio explains missing released sources inside one state instead of nesting two cards', () => {
  for (const locale of ['en', 'ar'] as const) { reset(locale, 'student'); const html = render(); const empty = html.slice(html.indexOf('<div class="cuevo-workspace-state" data-state="empty"'), html.indexOf('<section class="portfolio-organization"')); assert.equal((empty.match(/class="cuevo-workspace-state"/g) ?? []).length, 1); assert.match(empty, locale === 'en' ? /No released evidence is available to select/ : /لا يتاح شاهد صادر للاختيار/); }
});
test('incomplete zero Portfolio directory has localized unknown feedback and current continuation recovery', () => {
  for (const locale of ['en', 'ar'] as const) for (const state of [{ loaded: false }, { nextCursor: id(90) }, { loadingMore: true }]) { reset(locale); Object.assign(fixture.page, state); const html = render(); assert.match(html, /data-state="unknown"/); assert.doesNotMatch(html, /data-state="empty"/); if ('nextCursor' in state) assert.match(html, locale === 'en' ? /Load more/ : /تحميل المزيد/); }
});
test('failed Portfolio directory continuation retains one shared alert and the existing retry control', () => {
  reset('en'); fixture.page.moreError = new LearningApiError('unavailable'); fixture.page.nextCursor = id(90); const html = render(); assert.equal((html.match(/role="alert"/g) ?? []).length, 1); assert.match(html, /Load more/); assert.doesNotMatch(html, /data-state="empty"/);
});
test('current immutable history stays readable and current source failure withholds it', () => {
  reset('en', 'coordinator', true); fixture.history = [{ ...item, revisionId: id(10), reflection: 'Historical reflection' }]; assert.match(render(), /Historical reflection/); fixture.page.error = new LearningApiError('denied'); const html = render(); assert.doesNotMatch(html, /Historical reflection|Current private reflection/);
});
test('missing history and current source recovery cannot change an original Portfolio command key or body', () => {
  reset('en', 'student', true); const journal = fixture.app.commandJournal as CommandJournal; journal.prepare(`/v1/portfolio/items/${item.id}/reflection`, `/v1/portfolio/items/${item.id}/reflection`, { expectedRevision: item.revision, title: 'Original reflection title', reflection: 'Original private input' }); const original = journal.pending(); render(); assert.deepEqual(journal.pending(), original); fixture.page.error = new LearningApiError('denied'); render(); assert.deepEqual(journal.pending(), original);
});
