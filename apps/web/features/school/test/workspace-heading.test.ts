import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { registerHooks } from 'node:module';
import { CommandJournal, LearningApiError } from '../../../shared/api/client.ts';
import { FormDrafts } from '../../../shared/session/form-drafts.ts';
Object.assign(globalThis, { React });
for (const locale of ['en', 'ar'] as const) test(`${locale}: School section headings stay present before any source or child selection`, async () => {
  const { SchoolPageHeading } = await import('../components/school-workspace.tsx');
  for (const section of ['setup', 'approvedContext', 'people', 'policies', 'accounts', 'audit', 'automation', 'observationPolicy', 'parentSupport', 'daily'] as const) {
    const html = renderToStaticMarkup(createElement(SchoolPageHeading, { locale, section }));
    assert.equal((html.match(/<h1/g) ?? []).length, 1); assert.match(html, /tabindex="-1"/); assert.doesNotMatch(html, /undefined|School access verified/);
  }
  const html = renderToStaticMarkup(createElement(SchoolPageHeading, { locale, section: 'parentSupport', caption: 'Lina · Current school' }));
  assert.match(html, /Lina · Current school/); assert.equal((html.match(/<h1/g) ?? []).length, 1);
});

const fixture = { app: {} as Record<string, unknown>, loading: true, error: null as LearningApiError | null };
Object.assign(globalThis, { schoolHeadingFixture: fixture });
registerHooks({ load(url, context, nextLoad) {
  const path = url.replaceAll('\\', '/');
  if (path.endsWith('/shared/session/providers.tsx')) return { format: 'module', shortCircuit: true, source: 'export function useApp(){return globalThis.schoolHeadingFixture.app}' };
  if (path.endsWith('/shared/hooks/use-paginated-query.ts')) return { format: 'module', shortCircuit: true, source: 'export function usePaginatedLearningQuery(){return{data:[],loaded:true,loading:false,loadingMore:false,error:null,moreError:null,nextCursor:null,loadMore(){}}}' };
  if (path.endsWith('/shared/hooks/use-child-context.ts')) return { format: 'module', shortCircuit: true, source: 'export function useChildContext(){return{parent:false,child:null,query:{loaded:true,loading:false,error:null,data:[],nextCursor:null}}}' };
  if (path.endsWith('/shared/hooks/use-api.ts')) return { format: 'module', shortCircuit: true, source: 'export function useApiQuery(){const f=globalThis.schoolHeadingFixture;return{loading:f.loading,error:f.error,data:null}}export function useApi(){return{t:{errorDenied:"Permission denied"}}}' };
  return nextLoad(url, context);
} });
test('actual School initial loading and current source refusal retain a useful page heading', async () => {
  const { SchoolWorkspace } = await import('../components/school-workspace.tsx');
  fixture.app = { locale: 'en', status: 'ready', online: true, apiUrl: '', accessToken: 'synthetic', accessGeneration: 1, formDrafts: new FormDrafts(), commandJournal: new CommandJournal(), membership: { role: 'admin', userId: 'actor', schoolId: 'school', entitlements: ['school.operations'] } };
  for (const input of [{ loading: true, error: null }, { loading: false, error: new LearningApiError('denied') }]) {
    Object.assign(fixture, input); const html = renderToStaticMarkup(createElement(SchoolWorkspace));
    assert.equal((html.match(/<h1/g) ?? []).length, 1); assert.match(html, /<h1[^>]*>Setup<\/h1>/); assert.match(html, /Loading|Permission denied/);
  }
});

test('content-first approved support omits its repeated title while retaining child context and recovery', async () => {
  const { ParentLearningSupport } = await import('../components/parent-learning-support.tsx');
  const { WorkspacePageHeading } = await import('@cuevo/ui');
  fixture.app = { ...fixture.app, membership: { role: 'parent', userId: 'actor', schoolId: 'school', entitlements: ['school.operations'] } };
  fixture.loading = true; fixture.error = null;
  const html = renderToStaticMarkup(createElement(React.Fragment, null, createElement(WorkspacePageHeading, { title: 'Approved learning support' }), createElement(ParentLearningSupport, { learnerId: 'learner', learnerName: 'Lina', refresh: 0, pageHeading: true })));
  assert.equal((html.match(/>Approved learning support<\//g) ?? []).length, 1); assert.match(html, /Lina/); assert.match(html, /Refresh approved support/); assert.match(html, /Private approval notes are excluded/);
});

test('content-first campus and daily roots keep source explanations and controls without repeated titles', async () => {
  const { ApprovedSchoolContext } = await import('../components/approved-context.tsx');
  const { SchoolDaily } = await import('../components/daily.tsx');
  const { WorkspacePageHeading } = await import('@cuevo/ui');
  fixture.app = { ...fixture.app, membership: { role: 'teacher', userId: 'actor', schoolId: 'school', entitlements: ['school.operations'] } };
  fixture.loading = false; fixture.error = null;
  const approved = renderToStaticMarkup(createElement(React.Fragment, null, createElement(WorkspacePageHeading, { title: 'Campus and approved learning support' }), createElement(() => ApprovedSchoolContext({ pageHeading: true }))));
  assert.equal((approved.match(/>Campus and approved learning support<\//g) ?? []).length, 1); assert.match(approved, /No diagnosis or grade inference/);
  const source = { loaded: true, loading: false, loadingMore: false, error: null, moreError: null, nextCursor: null, loadMore() {} };
  const daily = renderToStaticMarkup(createElement(React.Fragment, null, createElement(WorkspacePageHeading, { title: 'Daily operations' }), createElement(SchoolDaily, { pageHeading: true, attendance: [], timetable: [], calendar: [], periods: [], terms: [], classes: [], subjects: [], people: [], canAdmin: false, canAttend: false, onChanged() {}, selectedClass: '', day: '2026-10-05', onDayChange() {}, onClassChange() {}, sources: { attendance: source, timetable: source, calendar: source, periods: source, terms: source, classes: source, subjects: source, people: source } })));
  assert.equal((daily.match(/>Daily operations<\//g) ?? []).length, 1); assert.match(daily, /type="date"/); assert.match(daily, /Missing records are not absence/);
});

test('content-first Automation keeps one title and its approval explanation and refresh', async () => {
  const { SchoolAutomationReview } = await import('../components/automation.tsx');
  const { WorkspacePageHeading } = await import('@cuevo/ui');
  fixture.app = { ...fixture.app, membership: { role: 'admin', userId: 'actor', schoolId: 'school', entitlements: ['school.operations'] } };
  fixture.loading = true;
  const html = renderToStaticMarkup(createElement(React.Fragment, null, createElement(WorkspacePageHeading, { title: 'Automation review' }), createElement(SchoolAutomationReview, { pageHeading: true })));
  assert.equal((html.match(/>Automation review<\//g) ?? []).length, 1); assert.match(html, /Approval boundary/); assert.match(html, /human approval requirements/); assert.match(html, /Refresh automation review/);
});
