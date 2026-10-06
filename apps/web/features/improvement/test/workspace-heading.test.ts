import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { registerHooks } from 'node:module';
import { CommandJournal, LearningApiError } from '../../../shared/api/client.ts';
import { FormDrafts } from '../../../shared/session/form-drafts.ts';
Object.assign(globalThis, { React });
for (const locale of ['en', 'ar'] as const) test(`${locale}: Next steps names current admitted sections and exact practice without inferring outcome`, async () => {
  const { ImprovementPageHeading } = await import('../components/improvement-workspace.tsx');
  for (const section of ['proposals', 'interventions', 'outcomes', 'runs', 'evaluation', 'execution', 'budget', 'policy'] as const) {
    const html = renderToStaticMarkup(createElement(ImprovementPageHeading, { locale, section }));
    assert.equal((html.match(/<h1/g) ?? []).length, 1); assert.doesNotMatch(html, /undefined|Improved|source-key/);
  }
  const html = renderToStaticMarkup(createElement(ImprovementPageHeading, { locale, section: 'interventions', title: 'Compare the two worked examples' }));
  assert.match(html, /<h1[^>]*>Compare the two worked examples<\/h1>/);
});

const fixture = { app: {} as Record<string, unknown>, loading: false, error: null as LearningApiError | null, detail: false };
Object.assign(globalThis, { improvementHeadingFixture: fixture });
registerHooks({ load(url, context, nextLoad) {
  const path = url.replaceAll('\\', '/');
  if (path.endsWith('/shared/session/providers.tsx')) return { format: 'module', shortCircuit: true, source: 'export function useApp(){return globalThis.improvementHeadingFixture.app}' };
  if (path.endsWith('/shared/hooks/use-paginated-query.ts')) return { format: 'module', shortCircuit: true, source: 'export function usePaginatedLearningQuery(){const f=globalThis.improvementHeadingFixture;return{data:[],loaded:!f.loading,loading:f.loading,loadingMore:false,error:f.error,moreError:null,nextCursor:null,loadMore(){}}}' };
  if (path.endsWith('/shared/hooks/use-api.ts')) return { format: 'module', shortCircuit: true, source: 'export function useApiQuery(path){const f=globalThis.improvementHeadingFixture;return{loading:false,error:null,data:f.detail?(path.includes("budget")?{schoolReserved:0,policy:null}:{current:null}):null}}export function useApi(){const f=globalThis.improvementHeadingFixture;return{t:{errorDenied:"Permission denied"},journal:f.app.commandJournal}}' };
  return nextLoad(url, context);
} });
test('actual Next steps empty loading and denied pages plus exact recovery keep one content h1', async () => {
  const { ImprovementWorkspace } = await import('../components/improvement-workspace.tsx');
  fixture.app = { locale: 'en', status: 'ready', online: true, apiUrl: '', accessToken: 'synthetic', accessGeneration: 1, formDrafts: new FormDrafts(), commandJournal: new CommandJournal(), publicConfig: { supabaseUrl: '', supabasePublishableKey: '', apiUrl: '' }, refreshAccess() {}, reportDiagnostic() {}, membership: { role: 'teacher', userId: 'actor', schoolId: 'school', entitlements: ['learning', 'assessment', 'curriculum', 'improvement'] } };
  for (const input of [{ loading: false, error: null }, { loading: true, error: null }, { loading: false, error: new LearningApiError('denied') }]) {
    Object.assign(fixture, input); const html = renderToStaticMarkup(createElement(ImprovementWorkspace));
    assert.equal((html.match(/<h1/g) ?? []).length, 1); assert.match(html, /<h1[^>]*>Proposals<\/h1>/);
  }
  const html = renderToStaticMarkup(ImprovementWorkspace({ intent: { view: 'improvement', source: 'intervention', id: 'current-task' } }));
  assert.equal((html.match(/<h1/g) ?? []).length, 1); assert.match(html, /Back to the previous step/);
});

test('content-first Budget and Policy keep one title plus current unknown cost and human approval facts', async () => {
  const { IntelligenceBudgetPanel } = await import('../components/budget-policy.tsx');
  const { SchoolIntelligencePolicyPanel } = await import('../components/school-policy.tsx');
  const { WorkspacePageHeading } = await import('@cuevo/ui');
  fixture.detail = true;
  const budget = renderToStaticMarkup(createElement(React.Fragment, null, createElement(WorkspacePageHeading, { title: 'Analysis budget limits' }), createElement(() => IntelligenceBudgetPanel({ pageHeading: true }))));
  assert.equal((budget.match(/>Analysis budget limits<\//g) ?? []).length, 1); assert.match(budget, /billed cost is unknown/); assert.match(budget, /Approve budget limits/);
  const policy = renderToStaticMarkup(createElement(React.Fragment, null, createElement(WorkspacePageHeading, { title: 'School analysis policy' }), createElement(() => SchoolIntelligencePolicyPanel({ pageHeading: true }))));
  assert.equal((policy.match(/>School analysis policy<\//g) ?? []).length, 1); assert.match(policy, /Approve analysis policy/);
});
