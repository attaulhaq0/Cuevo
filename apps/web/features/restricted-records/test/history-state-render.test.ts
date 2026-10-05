import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { transformSync } from 'esbuild';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CommandJournal, LearningApiError } from '../../../shared/api/client.ts';
import { FormDrafts } from '../../../shared/session/form-drafts.ts';
import { commonAr, commonEn } from '../../../shared/i18n/common.ts';

const id = (n: number) => `d6000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const record = { id: id(3), courseId: id(4), learnerId: id(5), title: 'School factual note', note: 'Current factual context', occurredAt: '2026-10-05T10:00:00Z', revision: 1, authorId: id(2), authorName: 'Current teacher', learnerName: 'School learner', courseTitle: 'Current reasoning course', className: 'Cedar', state: 'AWAITING_REVIEW', followUpOwnerId: null, followUpOwnerName: null, followUpInstructions: null, followUpNote: null, retentionStatus: 'SYNTHETIC_ONLY' };
const fixture = { app: {} as Record<string, unknown>, history: { items: [] as Record<string, unknown>[], nextCursor: null as string | null }, current: true, loading: false, error: null as LearningApiError | null, cursor: null as string | null };
Object.assign(globalThis, { React, restrictedHistoryFixture: fixture, restrictedHistoryCommonEn: commonEn, restrictedHistoryCommonAr: commonAr });
registerHooks({ load(url, context, next) {
  const path = url.replaceAll('\\', '/');
  if (path.endsWith('/shared/session/providers.tsx')) return { format: 'module', shortCircuit: true, source: 'export function useApp(){return globalThis.restrictedHistoryFixture.app}' };
  if (path.endsWith('/shared/hooks/use-api.ts')) return { format: 'module', shortCircuit: true, source: `export function useApi(){const f=globalThis.restrictedHistoryFixture;return{journal:f.app.commandJournal,t:f.app.locale==='ar'?globalThis.restrictedHistoryCommonAr:globalThis.restrictedHistoryCommonEn}}export function useApiQuery(path,parse){const f=globalThis.restrictedHistoryFixture;if(!path)return{data:null,loading:false,error:null};if(path.endsWith('/policy'))return{data:parse({id:'${id(1)}',version:1,enabled:true,purpose:'BASIC_INCIDENT_NOTE',retentionStatus:'SYNTHETIC_ONLY',ownerId:'${id(2)}',retentionNote:'Synthetic policy'}),loading:false,error:null};if(f.loading||f.error)return{data:null,loading:f.loading,error:f.error};const data=parse(f.history);return{data:f.current?data:{...data,scope:'previous source'},loading:false,error:null}}` };
  if (path.endsWith('/shared/hooks/use-paginated-query.ts')) return { format: 'module', shortCircuit: true, source: `export function usePaginatedLearningQuery(path,parse){return{data:path?.startsWith('/v1/restricted-records?')?[parse(${JSON.stringify(record)})]:[],loaded:!!path,loading:false,loadingMore:false,error:null,moreError:null,nextCursor:null,loadMore(){}}}` };
  if (path.endsWith('/restricted-records/components/workspace.tsx')) return { format: 'module', shortCircuit: true, source: transformSync(readFileSync(new URL(url), 'utf8').replace('useState<string|null>(null),[historyCursor,setHistoryCursor]=useState<string|null>(null)', `useState<string|null>('${id(3)}'),[historyCursor,setHistoryCursor]=useState<string|null>(globalThis.restrictedHistoryFixture.cursor)`), { loader: 'tsx', format: 'esm', jsx: 'automatic' }).code };
  return next(url, context);
} });
const { RestrictedRecordsWorkspace } = await import('../components/workspace.tsx');
function reset(locale: 'en' | 'ar', role: 'teacher' | 'admin' = 'teacher') { fixture.history = { items: [], nextCursor: null }; fixture.current = true; fixture.loading = false; fixture.error = null; fixture.cursor = null; const drafts = new FormDrafts(); drafts.saveModel(`${id(1)}:${id(2)}:/v1/restricted-records:intent`, { action: { id: record.id, kind: 'correct', courseId: record.courseId, learnerId: record.learnerId, revision: record.revision, occurredAt: record.occurredAt, authorId: record.authorId } }); fixture.app = { locale, status: 'ready', online: true, apiUrl: 'https://fixture.invalid', accessToken: 'synthetic', accessGeneration: 1, membership: { schoolId: id(1), userId: id(2), role, entitlements: ['school.operations', 'restricted.records'] }, formDrafts: drafts, commandJournal: new CommandJournal(), refreshAccess() {}, reportDiagnostic() {} }; }
const render = () => renderToStaticMarkup(createElement(RestrictedRecordsWorkspace));
test('existing private record terminal zero history requires review with localized recovery rather than silence', () => {
  for (const locale of ['en', 'ar'] as const) for (const role of ['teacher', 'admin'] as const) { reset(locale, role); const html = render(); assert.match(html, /data-state="review"/); assert.match(html, locale === 'en' ? /history.*unconfirmed/i : /السجل.*مؤكد/); assert.doesNotMatch(html, /data-state="empty"/); }
});
test('private history zero continued page and missing current envelope remain unknown', () => {
  for (const state of ['cursor', 'next', 'stale'] as const) { reset('en'); if (state === 'cursor') fixture.cursor = id(90); if (state === 'next') fixture.history.nextCursor = id(90); if (state === 'stale') fixture.current = false; const html = render(); assert.match(html, /data-state="unknown"/); assert.doesNotMatch(html, /data-state="empty"/); }
});
test('denied and loading private history keep their original state while preserving the selected factual source', () => {
  for (const state of ['loading', 'denied'] as const) { reset('en'); fixture.loading = state === 'loading'; fixture.error = state === 'denied' ? new LearningApiError('denied') : null; const html = render(); assert.match(html, new RegExp('data-state="' + (state === 'loading' ? 'loading' : 'denied') + '"')); assert.match(html, /Current factual context/); assert.doesNotMatch(html, /history.*unconfirmed/i); }
});
test('current immutable private history remains readable and a stale envelope cannot render its notes', () => {
  reset('ar'); fixture.history.items = [{ id: id(10), revision: 1, title: 'Earlier factual note', note: 'Historical private factual context', state: 'AWAITING_REVIEW', reason: 'Source correction review', createdAt: '2026-10-05T10:00:00Z' }]; assert.match(render(), /Historical private factual context/); fixture.current = false; assert.doesNotMatch(render(), /Historical private factual context/);
});
test('missing private history cannot mutate an original factual-correction command', () => {
  reset('en'); const journal = fixture.app.commandJournal as CommandJournal; journal.prepare(`/v1/restricted-records/${record.id}/correct`, `/v1/restricted-records/${record.id}/correct`, { expectedRevision: record.revision, title: 'Original factual title', note: 'Original private factual input', reason: 'Human correction', confirmCorrection: true }); const original = journal.pending(); render(); assert.deepEqual(journal.pending(), original); fixture.error = new LearningApiError('denied'); render(); assert.deepEqual(journal.pending(), original);
});
