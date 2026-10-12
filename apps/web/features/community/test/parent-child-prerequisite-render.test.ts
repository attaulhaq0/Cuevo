import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CommandJournal, LearningApiError } from '../../../shared/api/client.ts';
import { FormDrafts } from '../../../shared/session/form-drafts.ts';
import { commonAr, commonEn } from '../../../shared/i18n/common.ts';
import { conversationAr, conversationEn } from '../conversation-messages.ts';

const childId = '10000000-0000-4000-8000-000000000012';
const person = { userId: childId, displayName: 'Current child', role: 'student', classLabels: ['Cedar'] };
const query = { loaded: true, loading: false, loadingMore: false, error: null as LearningApiError | null, moreError: null as LearningApiError | null, nextCursor: null as string | null, loadMore() {} };
const fixture = { app: {} as Record<string, unknown>, people: [] as typeof person[], query: { ...query }, pagePaths: [] as (string | null)[] };
Object.assign(globalThis, { React, conversationChildFixture: fixture, conversationChildCommon: { en: commonEn, ar: commonAr } });
registerHooks({ load(url, context, nextLoad) {
  const path = url.replaceAll('\\', '/');
  if (path.endsWith('/shared/session/providers.tsx')) return { format: 'module', shortCircuit: true, source: 'export function useApp(){return globalThis.conversationChildFixture.app}' };
  if (path.endsWith('/shared/hooks/use-api.ts')) return { format: 'module', shortCircuit: true, source: 'export function useApi(){const f=globalThis.conversationChildFixture;return{t:globalThis.conversationChildCommon[f.app.locale]}}export function useApiQuery(path,parse){return{data:path?parse({id:"10000000-0000-4000-8000-000000000001",version:0,enabled:false,approvedAt:null}):null,loading:false,error:null}}' };
  if (path.endsWith('/shared/hooks/use-paginated-query.ts')) return { format: 'module', shortCircuit: true, source: 'export function usePaginatedLearningQuery(path,parse){const f=globalThis.conversationChildFixture;f.pagePaths.push(path);return path==="/v1/people?limit=100"?{...f.query,data:f.people.map(parse)}:{...f.query,loaded:!!path,data:[]}}' };
  return nextLoad(url, context);
} });
const { ParentConversations } = await import('../components/parent-conversations.tsx');
function reset(locale: 'en' | 'ar') {
  fixture.app = { locale, membership: { schoolId: '10000000-0000-4000-8000-000000000001', userId: '10000000-0000-4000-8000-000000000072', role: 'parent', entitlements: ['community'] }, selectedChildId: '', selectChild() {}, apiUrl: 'https://fixture.invalid', accessToken: 'synthetic', accessGeneration: 1, status: 'ready', online: true, formDrafts: new FormDrafts(), commandJournal: new CommandJournal() };
  fixture.people = []; fixture.query = { ...query }; fixture.pagePaths = [];
}
const render = () => renderToStaticMarkup(createElement(ParentConversations));
const copy = (locale: 'en' | 'ar') => locale === 'ar' ? conversationAr : conversationEn;
test('Parent conversations use the actual child prerequisite once for absent, loading and ambiguous sources', () => {
  for (const locale of ['en', 'ar'] as const) for (const state of ['empty', 'loading', 'ambiguous', 'unselected'] as const) {
    reset(locale);
    if (state === 'loading') fixture.query.loading = true;
    if (state === 'ambiguous' || state === 'unselected') fixture.people = [person, { ...person, userId: '10000000-0000-4000-8000-000000000013', displayName: state === 'ambiguous' ? person.displayName : 'Other child' }];
    const html = render();
    assert.ok(!html.includes(copy(locale).chooseChild));
    assert.equal((html.match(/home-context-section/g) ?? []).length, 1);
    assert.ok(!fixture.pagePaths.some(path => path?.includes('learnerId=')));
    if (state === 'empty') assert.equal((html.match(/data-state="empty"/g) ?? []).length, 1);
    if (state === 'loading') assert.equal((html.match(/data-state="loading"/g) ?? []).length, 1);
    if (state === 'ambiguous') assert.equal((html.match(/data-state="review"/g) ?? []).length, 1);
    assert.doesNotMatch(html, /conversation-list-actions|conversation-create/);
  }
});
test('Parent conversations preserve child errors and continuations without extra generic selection guidance', () => {
  for (const locale of ['en', 'ar'] as const) for (const state of ['denied', 'unavailable', 'continued', 'more-error'] as const) {
    reset(locale);
    if (state === 'denied' || state === 'unavailable') fixture.query.error = new LearningApiError(state);
    else fixture.query.nextCursor = 'later';
    if (state === 'more-error') fixture.query.moreError = new LearningApiError('unavailable');
    const html = render();
    assert.ok(!html.includes(copy(locale).chooseChild));
    assert.doesNotMatch(html, /data-state="empty"/);
    if (state !== 'continued') assert.equal((html.match(/role="alert"/g) ?? []).length, 1);
    else assert.match(html, /data-page-cursor="later"/);
    assert.ok(!fixture.pagePaths.some(path => path?.includes('learnerId=')));
  }
});
test('Parent conversations retain the existing review when a selected candidate has a failed continuation', () => {
  for (const locale of ['en', 'ar'] as const) {
    reset(locale); fixture.people = [person]; fixture.app.selectedChildId = childId;
    fixture.query.nextCursor = 'later'; fixture.query.moreError = new LearningApiError('unavailable');
    const html = render();
    assert.ok(html.includes(copy(locale).chooseChild));
    assert.match(html, /role="alert"/);
    assert.ok(!fixture.pagePaths.some(path => path?.includes('learnerId=')));
  }
});
test('Parent conversations with a current child keep the disabled-policy notice and original command journal', () => {
  for (const locale of ['en', 'ar'] as const) {
    reset(locale); fixture.people = [person];
    const journal = fixture.app.commandJournal as CommandJournal;
    const original = journal.prepare('/v1/community/conversations', '/v1/community/conversations', { learnerId: childId, title: 'Original title', body: 'Original body' });
    const html = render();
    assert.ok(!html.includes(copy(locale).chooseChild)); assert.ok(html.includes(copy(locale).disabled));
    assert.deepEqual(journal.get('/v1/community/conversations'), original);
  }
});
