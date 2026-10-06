import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { registerHooks } from 'node:module';
import { CommandJournal } from '../../../shared/api/client.ts';
import { FormDrafts } from '../../../shared/session/form-drafts.ts';
import { WorkspacePageHeading } from '@cuevo/ui';
import { schoolAr, schoolEn } from '../messages.ts';

const fixture = { locale: 'en', membership: { role: 'coordinator', schoolId: 'current-school', userId: 'current-coordinator' }, commandJournal: new CommandJournal(), formDrafts: new FormDrafts(), apiUrl: '', accessToken: 'synthetic', online: true, accessGeneration: 1 };
Object.assign(globalThis, { React, campusHeadingFixture: fixture, campusHeadingReads: [] as string[] });
registerHooks({ load(url, context, nextLoad) {
  const path = url.replaceAll('\\', '/');
  if (path.endsWith('/shared/session/providers.tsx')) return { format: 'module', shortCircuit: true, source: 'export function useApp(){return globalThis.campusHeadingFixture}' };
  if (path.endsWith('/shared/hooks/use-paginated-query.ts')) return { format: 'module', shortCircuit: true, source: 'export function usePaginatedLearningQuery(path,parse){if(path)globalThis.campusHeadingReads.push(path);return{data:path?.startsWith("/v1/school/campuses?")?[parse({id:"f6100000-0000-4000-8000-000000000001",name:"School north campus",location:null,retired:false})]:[],loaded:!!path,loading:false,loadingMore:false,error:null,moreError:null,nextCursor:null,loadMore(){}}}' };
  if (path.endsWith('/shared/hooks/use-api.ts')) return { format: 'module', shortCircuit: true, source: 'export function useApiQuery(){return{data:null,loading:false,error:null}}export function useApi(){return{t:{loadMore:"Load more",allLoaded:"All available records loaded"},journal:globalThis.campusHeadingFixture.commandJournal}}' };
  return nextLoad(url, context);
} });
const { ApprovedSchoolContext } = await import('../components/approved-context.tsx');

test('campus record follows the actual page or standalone section heading without changing source context', () => {
  for (const locale of ['en', 'ar'] as const) for (const pageHeading of [true, false]) {
    fixture.locale = locale;
    const copy = locale === 'ar' ? schoolAr : schoolEn;
    const html = renderToStaticMarkup(createElement(React.Fragment, null, createElement(WorkspacePageHeading, { title: copy.approvedContext }), createElement(() => ApprovedSchoolContext({ pageHeading }))));
    assert.equal((html.match(/<h1/g) ?? []).length, 1);
    assert.match(html, pageHeading ? /<h2>School north campus<\/h2>/ : /<h3>School north campus<\/h3>/);
    if (!pageHeading) assert.ok(html.includes(`<h2>${copy.approvedContext}</h2>`));
    assert.ok(html.includes(copy.campusLocationUnknown));
    assert.ok(html.includes(copy.activeCampus));
    assert.doesNotMatch(html, /<form|f6100000/);
    assert.equal(fixture.commandJournal.pending().length, 0);
  }
  const reads = (globalThis as unknown as { campusHeadingReads: string[] }).campusHeadingReads;
  assert.ok(reads.every(path => ['/v1/school/campuses?limit=25', '/v1/school/learning-support?limit=25'].includes(path)));
});
