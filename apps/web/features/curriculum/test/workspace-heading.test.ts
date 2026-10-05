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

const fixture = { app: {} as Record<string, unknown>, loading: false, error: null as LearningApiError | null, paths: [] as string[] };
Object.assign(globalThis, { curriculumHeadingFixture: fixture });
registerHooks({ load(url, context, nextLoad) {
  const path = url.replaceAll('\\', '/');
  if (path.endsWith('/shared/session/providers.tsx')) return { format: 'module', shortCircuit: true, source: 'export function useApp(){return globalThis.curriculumHeadingFixture.app}' };
  if (path.endsWith('/shared/hooks/use-paginated-query.ts')) return { format: 'module', shortCircuit: true, source: 'export function usePaginatedLearningQuery(path){const f=globalThis.curriculumHeadingFixture;if(path)f.paths.push(path);return{data:[],loaded:!f.loading,loading:f.loading,loadingMore:false,error:f.error,moreError:null,nextCursor:null,loadMore(){}}}' };
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
