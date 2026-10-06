import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { registerHooks } from 'node:module';
import { CommandJournal, LearningApiError } from '../../../shared/api/client.ts';
import { FormDrafts } from '../../../shared/session/form-drafts.ts';
Object.assign(globalThis, { React });
for (const locale of ['en', 'ar'] as const) test(`${locale}: Curriculum names the actual peer or current configuration action without source claims`, async () => {
  const { CurriculumPageHeading } = await import('../components/curriculum-workspace.tsx');
  for (const section of ['versions', 'references', 'programmes', 'overlays'] as const) {
    const html = renderToStaticMarkup(createElement(CurriculumPageHeading, { locale, section }));
    assert.equal((html.match(/<h1/g) ?? []).length, 1); assert.doesNotMatch(html, /undefined|customer.ready|Official/);
  }
  const html = renderToStaticMarkup(createElement(CurriculumPageHeading, { locale, section: 'versions', title: 'Review declared period planning', caption: 'Cedar · Autumn' }));
  assert.match(html, /<h1[^>]*>Review declared period planning<\/h1>/); assert.match(html, /Cedar · Autumn/);
});

const fixture = { app: {} as Record<string, unknown>, loading: false, loaded: true, loadingMore: false, error: null as LearningApiError | null, moreError: null as LearningApiError | null, nextCursor: null as string | null, paths: [] as string[] };
Object.assign(globalThis, { curriculumHeadingFixture: fixture });
registerHooks({ load(url, context, nextLoad) {
  const path = url.replaceAll('\\', '/');
  if (path.endsWith('/shared/session/providers.tsx')) return { format: 'module', shortCircuit: true, source: 'export function useApp(){return globalThis.curriculumHeadingFixture.app}' };
  if (path.endsWith('/shared/hooks/use-paginated-query.ts')) return { format: 'module', shortCircuit: true, source: 'export function usePaginatedLearningQuery(path){const f=globalThis.curriculumHeadingFixture;if(path)f.paths.push(path);return{data:[],loaded:f.loaded&&!f.loading,loading:f.loading,loadingMore:f.loadingMore,error:f.error,moreError:f.moreError,nextCursor:f.nextCursor,loadMore(){}}}' };
  return nextLoad(url, context);
} });
test('actual Curriculum current records retain one h1 through empty loading and denied source states', async () => {
  const { CurriculumWorkspace } = await import('../components/curriculum-workspace.tsx');
  fixture.app = { locale: 'en', status: 'ready', online: true, apiUrl: '', accessToken: 'synthetic', accessGeneration: 1, formDrafts: new FormDrafts(), commandJournal: new CommandJournal(), publicConfig: { supabaseUrl: '', supabasePublishableKey: '', apiUrl: '' }, refreshAccess() {}, reportDiagnostic() {}, membership: { role: 'teacher', userId: 'actor', schoolId: 'school', entitlements: ['curriculum'] } };
  for (const input of [{ loading: false, error: null }, { loading: true, error: null }, { loading: false, error: new LearningApiError('denied') }]) {
    Object.assign(fixture, input); fixture.paths = []; const html = renderToStaticMarkup(createElement(CurriculumWorkspace));
    assert.equal((html.match(/<h1/g) ?? []).length, 1); assert.match(html, /<h1[^>]*>Curriculum sources<\/h1>/);
    assert.equal(fixture.paths.filter(path => path.startsWith('/v1/curriculum/')).length, 4);
  }
});

test('Curriculum shows one icon empty state only for the current complete successful record page', async () => {
  const { CurriculumWorkspace } = await import('../components/curriculum-workspace.tsx');
  for (const locale of ['en', 'ar'] as const) {
    fixture.app = { locale, status: 'ready', online: true, apiUrl: '', accessToken: 'synthetic', accessGeneration: 1, formDrafts: new FormDrafts(), commandJournal: new CommandJournal(), refreshAccess() {}, reportDiagnostic() {}, membership: { role: 'teacher', userId: 'actor', schoolId: 'school', entitlements: ['curriculum'] } };
    for (const input of [ {}, { loaded: false }, { loading: true }, { nextCursor: 'next-current' }, { loadingMore: true, nextCursor: 'next-current' }, { moreError: new LearningApiError('denied'), nextCursor: 'next-current' } ]) {
      Object.assign(fixture, { loaded: true, loading: false, loadingMore: false, error: null, moreError: null, nextCursor: null }, input);
      const html = renderToStaticMarkup(createElement(CurriculumWorkspace));
      assert.equal((html.match(/<h1/g) ?? []).length, 1);
      assert.equal((html.match(/data-state="empty"/g) ?? []).length, Object.keys(input).length ? 0 : 1);
      if (!Object.keys(input).length) assert.match(html, /cuevo-workspace-state__icon/);
      if (input.nextCursor) assert.match(html, input.loadingMore ? /Loading more|جارٍ تحميل المزيد/ : /Load more|تحميل المزيد/);
      if (input.moreError) assert.match(html, /role="alert"/);
    }
  }
});
