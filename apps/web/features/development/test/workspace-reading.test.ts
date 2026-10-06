import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CommandJournal, LearningApiError } from '../../../shared/api/client.ts';
import { FormDrafts } from '../../../shared/session/form-drafts.ts';

const policy = { id: '30000000-0000-4000-8000-000000000001', version: 4, points: { practice: 0, revision: 7, reflection: 13 }, milestones: [], approvedBy: '30000000-0000-4000-8000-000000000002', approvedAt: '2026-10-03T00:00:00Z' };
const base = { loaded: true, loading: false, loadingMore: false, error: null, moreError: null, nextCursor: null, loadMore() {} };
const fixture = { app: {} as Record<string, unknown>, policyState: { ...base, data: [policy] } as Record<string, unknown>, emptyState: { ...base, data: [] } };
Object.assign(globalThis, { React, developmentReadingFixture: fixture });
// Only read/session inputs are replaced; the actual owner, policy renderer,
// shared controls, errors and source parsers are rendered in this Node test.
registerHooks({ load(url, context, nextLoad) {
  const path = url.replaceAll('\\', '/');
  if (path.endsWith('/shared/session/providers.tsx')) return { format: 'module', shortCircuit: true, source: 'export function useApp(){return globalThis.developmentReadingFixture.app}' };
  if (path.endsWith('/shared/hooks/use-paginated-query.ts')) return { format: 'module', shortCircuit: true, source: 'export function usePaginatedLearningQuery(path,parse){const source=path?.includes("/policies")?globalThis.developmentReadingFixture.policyState:globalThis.developmentReadingFixture.emptyState;return{...source,data:source.data.map(parse),loadMore(){}}}' };
  return nextLoad(url, context);
} });
const { DevelopmentWorkspace } = await import('../components/development-workspace.tsx');
function render(role = 'admin', policyState: Record<string, unknown> = {}) {
  fixture.policyState = { ...base, data: [policy], ...policyState };
  fixture.app = { locale: 'en', online: true, status: 'ready', accessGeneration: 1, accessToken: 'synthetic-token', apiUrl: 'https://fixture.invalid', commandJournal: new CommandJournal(), formDrafts: new FormDrafts(), refreshAccess() {}, reportDiagnostic() {}, membership: { role, schoolId: policy.id, userId: policy.approvedBy, entitlements: ['learning', 'learner.state'] } };
  return renderToStaticMarkup(createElement(DevelopmentWorkspace));
}

test('administrator configuration reads exact approved values before a learner is selected and mounts no personal record panels', () => {
  const html = render();
  assert.equal((html.match(/<h1/g) ?? []).length, 1); assert.match(html, /<h1[^>]*>Development<\/h1>/);
  assert.match(html, /development-configuration/);
  assert.match(html, /Practice points<\/dt><dd>0/);
  assert.match(html, /Current approved recognition policy: 4/);
  assert.match(html, /Choose a learner with complete current school context/);
  assert.doesNotMatch(html, /development-journey|development-recognition|development-ledger|private-|All available records loaded/);
});

test('an incomplete policy page cannot show a previous policy as current or approve from an inferred version', () => {
  const html = render('admin', { nextCursor: 'next-policy' });
  assert.doesNotMatch(html, /Current approved recognition policy: 4|Practice points<\/dt>|Approved on|No recognition policy has been approved/);
  assert.match(html, /disabled="" class="button button--primary ">Approve recognition policy/);
  assert.match(html, /Load more: Recognition policies/);
});

test('a failed policy read keeps recovery visible and withholds previous approved values', () => {
  const html = render('admin', { error: new LearningApiError('denied') });
  assert.equal((html.match(/<h1/g) ?? []).length, 1);
  assert.match(html, /role="alert"/);
  assert.match(html, /Refresh development/);
  assert.doesNotMatch(html, /Practice points<\/dt>|Current approved recognition policy: 4|Approved on/);
});

test('staff without administrator role cannot mount policy approval and unknown learner context stays an explicit selection', () => {
  const html = render('teacher');
  assert.match(html, /Choose a learner with complete current school context/);
  assert.doesNotMatch(html, /development-configuration|Approve recognition policy|Create learning period|development-journey/);
  assert.match(html, /data-state="unknown"/); assert.match(html, /data-state="empty"/);
});

test('Student without a current learning period gets one source prerequisite and no empty ledger or milestones', () => {
  const html = render('student');
  assert.equal((html.match(/Choose a learning period to open its recorded points, actions and milestones\./g) ?? []).length, 1);
  assert.match(html, /data-state="unknown"/);
  assert.doesNotMatch(html, /aria-label="Activity ledger"|development-milestones|development-total/);
  assert.match(html, /Learning goals|development-companion/);
});

test('Admin period reading owns one canonical prerequisite and does not claim selection during loading or failure',()=>{
 const html=render();assert.equal((html.match(/Choose a learning period to open its recorded points, actions and milestones\./g)??[]).length,1);assert.match(html,/<section class="development-panel development-period"[\s\S]*?data-state="unknown"/);
 const previous=fixture.emptyState;fixture.emptyState={...base,data:[],loaded:false,loading:true};const loading=render();assert.match(loading,/<section class="development-panel development-period"[\s\S]*?data-state="loading"/);assert.doesNotMatch(loading,/Choose a learning period to open/);fixture.emptyState=previous;
});
