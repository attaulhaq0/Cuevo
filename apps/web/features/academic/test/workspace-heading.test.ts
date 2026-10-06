import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { registerHooks } from 'node:module';
import { CommandJournal, LearningApiError } from '../../../shared/api/client.ts';
import { FormDrafts } from '../../../shared/session/form-drafts.ts';
Object.assign(globalThis, { React });
for (const locale of ['en', 'ar'] as const) test(`${locale}: Academic uses one current section heading and only admitted exact source context`, async () => {
  const { AcademicPageHeading } = await import('../components/academic-workspace.tsx');
  for (const section of ['references', 'rubrics', 'marking', 'gradebook', 'results'] as const) {
    const html = renderToStaticMarkup(createElement(AcademicPageHeading, { locale, section }));
    assert.equal((html.match(/<h1/g) ?? []).length, 1); assert.match(html, /tabindex="-1"/); assert.doesNotMatch(html, /School access verified|source-key/);
  }
  const html = renderToStaticMarkup(createElement(AcademicPageHeading, { locale, section: 'marking', title: 'Explain the checking step', caption: 'Lina · Cedar' }));
  assert.match(html, /<h1[^>]*>Explain the checking step<\/h1>/); assert.match(html, /Lina · Cedar/); assert.equal((html.match(/<h1/g) ?? []).length, 1);
});

const fixture = { app: {} as Record<string, unknown>, loading: false, error: null as LearningApiError | null, calls: [] as string[] };
Object.assign(globalThis, { academicHeadingFixture: fixture });
registerHooks({ load(url, context, nextLoad) {
  const path = url.replaceAll('\\', '/');
  if (path.endsWith('/shared/session/providers.tsx')) return { format: 'module', shortCircuit: true, source: 'export function useApp(){return globalThis.academicHeadingFixture.app}' };
  if (path.endsWith('/shared/hooks/use-paginated-query.ts')) return { format: 'module', shortCircuit: true, source: 'export function usePaginatedLearningQuery(path){const f=globalThis.academicHeadingFixture;if(path)f.calls.push(path);return{data:[],loaded:!f.loading,loading:f.loading,loadingMore:false,error:f.error,moreError:null,nextCursor:null,loadMore(){}}}' };
  if (path.endsWith('/shared/hooks/use-child-context.ts')) return { format: 'module', shortCircuit: true, source: 'export function useChildContext(){return{parent:false,child:null,query:{loaded:true,loading:false,error:null,data:[],nextCursor:null}}}' };
  return nextLoad(url, context);
} });
test('actual Academic mounted root keeps one heading in empty/loading/denied and exact-source recovery without new reads', async () => {
  const { AcademicWorkspace } = await import('../components/academic-workspace.tsx');
  fixture.app = { locale: 'en', status: 'ready', online: true, apiUrl: '', accessToken: 'synthetic', accessGeneration: 1, publicConfig: { supabaseUrl: '', supabasePublishableKey: '', apiUrl: '' }, formDrafts: new FormDrafts(), commandJournal: new CommandJournal(), refreshAccess() {}, reportDiagnostic() {}, membership: { role: 'teacher', userId: 'actor', schoolId: 'school', entitlements: ['learning', 'assessment', 'curriculum'] } };
  for (const input of [{ loading: false, error: null }, { loading: true, error: null }, { loading: false, error: new LearningApiError('denied') }]) {
    Object.assign(fixture, input); fixture.calls = [];
    const html = renderToStaticMarkup(createElement(AcademicWorkspace));
    assert.equal((html.match(/<h1/g) ?? []).length, 1); assert.match(html, /<h1[^>]*>Marking<\/h1>/);
    assert.deepEqual(fixture.calls, ['/v1/marking?limit=100']);
  }
  const html = renderToStaticMarkup(AcademicWorkspace({ intent: { view: 'academic', source: 'marking', id: 'selected-source' } }));
  assert.equal((html.match(/<h1/g) ?? []).length, 1); assert.match(html, /Back to the previous step/);
});
