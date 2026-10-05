import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { registerHooks } from 'node:module';
import { CommandJournal, LearningApiError } from '../../../shared/api/client.ts';
import { FormDrafts } from '../../../shared/session/form-drafts.ts';
const policy = { id: 'c5000000-0000-4000-8000-000000000001', version: 0, enabled: false, purpose: 'BASIC_INCIDENT_NOTE', retentionStatus: 'SYNTHETIC_ONLY', ownerId: null, retentionNote: null };
const fixture = { app: {} as Record<string, unknown>, mode: 'loading' as 'loading' | 'denied' | 'disabled' };
Object.assign(globalThis, { React, restrictedHeadingFixture: fixture, restrictedHeadingPolicy: policy });
registerHooks({ load(url, context, nextLoad) {
  const path = url.replaceAll('\\', '/');
  if (path.endsWith('/shared/session/providers.tsx')) return { format: 'module', shortCircuit: true, source: 'export function useApp(){return globalThis.restrictedHeadingFixture.app}' };
  if (path.endsWith('/shared/hooks/use-api.ts')) return { format: 'module', shortCircuit: true, source: 'import{commonEn}from"../i18n/common";export function useApi(){return{t:commonEn}}export function useApiQuery(path,parse){const f=globalThis.restrictedHeadingFixture;return{data:path&&f.mode==="disabled"?parse(globalThis.restrictedHeadingPolicy):null,loading:!!path&&f.mode==="loading",error:path&&f.mode==="denied"?globalThis.restrictedHeadingDenial:null}}' };
  if (path.endsWith('/shared/hooks/use-paginated-query.ts')) return { format: 'module', shortCircuit: true, source: 'export function usePaginatedLearningQuery(){return{data:[],loaded:true,loading:false,loadingMore:false,error:null,moreError:null,nextCursor:null,loadMore(){}}}' };
  return nextLoad(url, context);
} });
const { RestrictedRecordsWorkspace } = await import('../components/workspace.tsx');
function render(locale: 'en' | 'ar', ready = false) {
  fixture.app = { locale, status: ready ? 'ready' : 'not-configured', online: true, apiUrl: '', accessToken: ready ? 'synthetic' : null, accessGeneration: 1,
    commandJournal: new CommandJournal(), formDrafts: new FormDrafts(), refreshAccess() {}, reportDiagnostic() {}, membership: ready ? { userId: 'c5000000-0000-4000-8000-000000000002', schoolId: 'school', role: 'teacher', entitlements: ['school.operations', 'restricted.records'] } : null };
  return renderToStaticMarkup(createElement(RestrictedRecordsWorkspace));
}
test('Restricted workspace retains one localized h1 without revealing private records before authorization', () => {
  for (const locale of ['en', 'ar'] as const) {
    const html = render(locale);
    assert.equal((html.match(/<h1/g) ?? []).length, 1); assert.match(html, locale === 'en' ? /<h1[^>]*>Restricted school notes<\/h1>/ : /<h1[^>]*>ملاحظات مدرسية مقيّدة<\/h1>/);
    assert.doesNotMatch(html, /Objective observed context|Record a factual school note|data-restricted-id/);
  }
});
test('Restricted current policy loading denial and disabled states each retain one h1 with local limits', () => {
  Object.assign(globalThis, { restrictedHeadingDenial: new LearningApiError('denied') });
  for (const mode of ['loading', 'denied', 'disabled'] as const) {
    fixture.mode = mode; const html = render('en', true);
    assert.equal((html.match(/<h1/g) ?? []).length, 1); assert.match(html, /Restricted school notes/);
    assert.doesNotMatch(html, /Record a factual school note|data-restricted-id/);
    if (mode === 'denied') assert.match(html, /role="alert"/);
    if (mode === 'disabled') assert.match(html, /Synthetic operational demonstration only|Restricted records are disabled/);
    if (mode === 'loading') assert.match(html, /data-state="loading"/);
    if (mode === 'disabled') assert.match(html, /data-state="unavailable"/);
  }
});
