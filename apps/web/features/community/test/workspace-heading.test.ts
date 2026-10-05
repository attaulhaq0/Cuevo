import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { registerHooks } from 'node:module';
import { CommandJournal, LearningApiError } from '../../../shared/api/client.ts';
import { FormDrafts } from '../../../shared/session/form-drafts.ts';
const room = { id: 'room', classId: 'class', ownerId: 'teacher', name: 'Checking explanations', type: 'CLASS' as const, status: 'ACTIVE' as const, canModerate: false, canPost: false, privateTopic: 'cuevo:school:room:room' };
const fixture = { app: {} as Record<string, unknown>, loading: false, error: null as LearningApiError | null, room: false };
Object.assign(globalThis, { React, communityHeadingFixture: fixture });
registerHooks({ load(url, context, nextLoad) {
  const path = url.replaceAll('\\', '/');
  if (path.endsWith('/shared/session/providers.tsx')) return { format: 'module', shortCircuit: true, source: 'export function useApp(){return globalThis.communityHeadingFixture.app}' };
  if (path.endsWith('/shared/hooks/use-paginated-query.ts')) return { format: 'module', shortCircuit: true, source: 'export function usePaginatedLearningQuery(path){const f=globalThis.communityHeadingFixture;return{data:f.room&&path?.endsWith("rooms?limit=100")?[globalThis.communityHeadingRoom]:[],loaded:!f.loading,loading:f.loading,loadingMore:false,error:f.error,moreError:null,nextCursor:null,context:"current",loadMore(){}}}' };
  return nextLoad(url, context);
} });
const { CommunityWorkspace } = await import('../components/community-workspace.tsx');
const { RoomDiscussion } = await import('../components/room-discussion.tsx');
function app(locale: 'en' | 'ar' = 'en', status = 'ready') {
  fixture.app = { locale, status, online: true, apiUrl: '', accessToken: 'synthetic', accessGeneration: 1, publicConfig: { supabaseUrl: '', supabasePublishableKey: '', apiUrl: '' }, formDrafts: new FormDrafts(), commandJournal: new CommandJournal(), refreshAccess() {}, reportDiagnostic() {}, membership: { role: 'student', userId: 'actor', schoolId: 'school', entitlements: ['community'] } };
}
test('Community directory owns one useful h1 through empty loading and denied states', () => {
  for (const input of [{ loading: false, error: null }, { loading: true, error: null }, { loading: false, error: new LearningApiError('denied') }]) {
    Object.assign(fixture, input); app();
    const html = renderToStaticMarkup(createElement(CommunityWorkspace));
    assert.equal((html.match(/<h1/g) ?? []).length, 1); assert.match(html, /<h1[^>]*>Class rooms and groups<\/h1>/);
    assert.match(html, /current school-approved members/);
  }
  app('ar', 'not-configured'); const html = renderToStaticMarkup(createElement(CommunityWorkspace));
  assert.equal((html.match(/<h1/g) ?? []).length, 1);
});
test('explicit current room owns its human h1 once and keeps discussion safety', () => {
  fixture.loading = false; fixture.error = null; fixture.room = true; Object.assign(globalThis, { communityHeadingRoom: room }); app();
  const html = renderToStaticMarkup(createElement(RoomDiscussion, { room, onBack() {} }));
  assert.equal((html.match(/<h1/g) ?? []).length, 1); assert.match(html, /<h1[^>]*>Checking explanations<\/h1>/);
  assert.match(html, /Back to rooms|current school-approved members/);
});
test('denied selected room keeps one generic recovery h1 and withholds its private source title', () => {
  fixture.error = new LearningApiError('denied'); fixture.room = true; app();
  const html = renderToStaticMarkup(createElement(RoomDiscussion, { room, onBack() {} }));
  assert.equal((html.match(/<h1/g) ?? []).length, 1); assert.match(html, /<h1[^>]*>Class discussion<\/h1>/);
  assert.doesNotMatch(html, /Checking explanations/); assert.match(html, /role="alert"/);
});
