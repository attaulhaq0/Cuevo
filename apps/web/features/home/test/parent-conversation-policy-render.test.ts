import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CommandJournal, LearningApiError } from '../../../shared/api/client.ts';
import { FormDrafts } from '../../../shared/session/form-drafts.ts';
import { commonAr, commonEn } from '../../../shared/i18n/common.ts';

const school = '00000000-0000-4000-8000-000000000001';
const child = '00000000-0000-4000-8000-000000000002';
const parent = '00000000-0000-4000-8000-000000000003';
const teacher = '00000000-0000-4000-8000-000000000004';
const policy = { id: school, version: 1, enabled: true, approvedAt: '2026-10-05T00:00:00Z' };
const thread = { id: school, learnerId: child, parentId: parent, teacherId: teacher, classId: school, subjectId: school, title: 'Discuss the explanation', learnerName: 'Alex Reed', parentName: 'Sam Reed', teacherName: 'Maya', className: 'Cedar', academicYearName: '2026–2027', subjectName: 'Reasoning', createdAt: '2026-10-05T00:00:00Z', state: 'OPEN', stateVersion: 0, canModerate: false };
const portfolio = { id: school, revisionId: school, revision: 1, learnerId: child, sourceModel: 'numeric', title: 'My checked explanation', reflection: 'I checked every step.', createdAt: '2026-10-05T00:00:00Z', feedback: 'Explain the check.', featured: false, approvalState: 'REVIEWED', parentVisible: true, reviewedAt: '2026-10-05T01:00:00Z', evidenceId: school, resultId: school, submissionId: school, referenceId: school, referenceVersion: 'school-v1', policyVersion: 1, nativeResult: { type: 'numeric', score: 0, maxScore: 4, policyVersion: 1 }, assessmentTitle: 'Explain a method', referenceTitle: 'Checking reasons' };
const base = { loaded: true, loading: false, loadingMore: false, error: null, moreError: null, nextCursor: null, loadMore() {} };
const fixture = { app: {} as Record<string, unknown>, policy: policy as unknown, policyState: {} as Record<string, unknown>, policyEnvelope: undefined as unknown, retainedPolicy: undefined as unknown, threadEnvelopes: [] as unknown[], retainedThreads: undefined as unknown[] | undefined, directoryState: {} as Record<string, unknown>, directoryPaths: [] as string[], policyPaths: [] as string[] };
Object.assign(globalThis, { React, parentPolicyReadingFixture: fixture });
// Replace only current session and read inputs. Render the real Home adapter,
// child selector, strict source parsers, Trail view and shared error surfaces.
registerHooks({ load(url, context, nextLoad) {
  const path = url.replaceAll('\\', '/');
  if (path.endsWith('/shared/session/providers.tsx')) return { format: 'module', shortCircuit: true, source: 'export function useApp(){return globalThis.parentPolicyReadingFixture.app}' };
  if (path.endsWith('/shared/hooks/use-api.ts')) return { format: 'module', shortCircuit: true, source: `export function useApi(){const f=globalThis.parentPolicyReadingFixture;return {request:async()=>{throw new Error("No report request is run by this server render")},t:f.app.locale==='ar'?globalThis.parentPolicyCommonAr:globalThis.parentPolicyCommonEn}};export function useApiQuery(path,parse){const f=globalThis.parentPolicyReadingFixture;if(path)f.policyPaths.push(path);const data=f.retainedPolicy??(path&&f.policy?parse(f.policy):null);f.policyEnvelope=data;return {data,loading:false,error:null,...f.policyState}}` };
  if (path.endsWith('/shared/hooks/use-paginated-query.ts')) return { format: 'module', shortCircuit: true, source: `export function usePaginatedLearningQuery(path,parse){const f=globalThis.parentPolicyReadingFixture;const base={loaded:!!path,loading:false,loadingMore:false,error:null,moreError:null,nextCursor:null,loadMore(){}};if(path==='/v1/people?limit=100')return {...base,data:[{userId:'${child}',displayName:'Alex Reed',role:'student',classLabels:['Cedar']}].map(parse)};if(path?.startsWith('/v1/portfolio/items?'))return {...base,data:[globalThis.parentPolicyPortfolio].map(parse)};if(path?.startsWith('/v1/community/conversations?')){f.directoryPaths.push(path);const data=f.retainedThreads??[globalThis.parentPolicyThread].map(parse);f.threadEnvelopes=data;return {...base,data,...f.directoryState}};return {...base,data:f.retainedThreads&&path===null?f.retainedThreads:[]}}` };
  return nextLoad(url, context);
} });
Object.assign(globalThis, { parentPolicyCommonEn: commonEn, parentPolicyCommonAr: commonAr, parentPolicyThread: thread, parentPolicyPortfolio: portfolio });
const { ParentTrailHomeConnected } = await import('../components/parent-trail-home-connected.tsx');

function render(options: { locale?: 'en' | 'ar'; policy?: unknown; policyState?: Record<string, unknown>; retainedPolicy?: unknown; retainedThreads?: unknown[]; directoryState?: Record<string, unknown>; accessToken?: string; selectedChildId?: string; entitlements?: string[] } = {}) {
  fixture.policy = options.policy === undefined ? policy : options.policy;
  fixture.policyState = options.policyState ?? {}; fixture.retainedPolicy = options.retainedPolicy;
  fixture.retainedThreads = options.retainedThreads; fixture.directoryState = options.directoryState ?? {};
  fixture.directoryPaths = []; fixture.policyPaths = [];
  fixture.app = { locale: options.locale ?? 'en', online: true, status: 'ready', accessGeneration: 1, selectedChildId: options.selectedChildId ?? child, selectChild() {}, accessToken: options.accessToken ?? 'current-token', apiUrl: 'https://fixture.invalid', commandJournal: new CommandJournal(), formDrafts: new FormDrafts(), refreshAccess() {}, reportDiagnostic() {}, membership: { role: 'parent', schoolId: school, userId: parent, entitlements: options.entitlements ?? ['learning', 'assessment', 'curriculum', 'portfolio', 'school.operations', 'community'], school: { name: 'Reference school' } } };
  return renderToStaticMarkup(createElement(ParentTrailHomeConnected, { onNavigate() {} }));
}

test('disabled school policy prevents a Home directory read and leaves approved child work visible in both languages', () => {
  for (const locale of ['en', 'ar'] as const) {
    const html = render({ locale, policy: { ...policy, version: 0, enabled: false, approvedAt: null } });
    assert.deepEqual(fixture.policyPaths, ['/v1/community/conversations/policy']);
    assert.deepEqual(fixture.directoryPaths, []);
    assert.match(html, locale === 'en' ? /Your school has not enabled parent and teacher conversations/ : /لم تفعّل المدرسة محادثات أولياء الأمور والمعلّمين/);
    assert.match(html, locale === 'en' ? /Open school communication/ : /فتح التواصل المدرسي/);
    assert.match(html, /My checked explanation/); assert.doesNotMatch(html, /Discuss the explanation/);
  }
});

test('current enabled policy starts only the exact-child Home directory and renders its authorized teacher context', () => {
  const html = render();
  assert.deepEqual(fixture.directoryPaths, [`/v1/community/conversations?limit=25&learnerId=${child}`]);
  assert.match(html, /Discuss the explanation/); assert.match(html, /Maya/);
  assert.doesNotMatch(html, /Your school has not enabled/);
});

test('changed or denied policy withholds prior Home threads while independent approved work stays visible', () => {
  render(); const retainedThreads = fixture.threadEnvelopes; const retainedPolicy = fixture.policyEnvelope;
  for (const options of [
    { policy: { ...policy, version: 2 }, retainedThreads },
    { policy: { ...policy, enabled: false }, retainedThreads },
    { retainedPolicy, retainedThreads, policyState: { error: new LearningApiError('denied') } },
    { retainedPolicy, retainedThreads, policyState: { loading: true } },
  ]) {
    const html = render(options);
    assert.doesNotMatch(html, /Discuss the explanation|<bdi>Maya<\/bdi>/);
    assert.match(html, /My checked explanation/);
  }
  const denied = render({ retainedPolicy, retainedThreads, policyState: { error: new LearningApiError('denied') } });
  assert.deepEqual(fixture.directoryPaths, []); assert.match(denied, /role="alert"/); assert.match(denied, /Refresh approved child records/);
});

test('late old-session policy cannot authorize the Home directory or reattach old child threads', () => {
  render(); const retainedPolicy = fixture.policyEnvelope; const retainedThreads = fixture.threadEnvelopes;
  const html = render({ accessToken: 'replacement-token', retainedPolicy, retainedThreads });
  assert.deepEqual(fixture.directoryPaths, []); assert.doesNotMatch(html, /Discuss the explanation/);
  assert.match(html, /These records are not available with your current access/); assert.match(html, /My checked explanation/);
});

test('enabled directory refusal stays local and no previous Home conversation can become current', () => {
  render(); const retainedThreads = fixture.threadEnvelopes;
  const html = render({ retainedThreads, directoryState: { ...base, error: new LearningApiError('denied') } });
  assert.match(html, /role="alert"/); assert.doesNotMatch(html, /Discuss the explanation/); assert.match(html, /My checked explanation/);
});

test('Parent Home incomplete conversations use the shared unknown state and retain source continuation without calling absence empty', () => {
  for (const locale of ['en', 'ar'] as const) {
    const html = render({ locale, directoryState: { ...base, data: [], nextCursor: 'remaining-conversations' } });
    const continuation = html.slice(html.indexOf('parent-trail__source-continuation'));
    assert.match(continuation, /data-state="unknown"/);
    assert.match(continuation, /data-page-cursor="remaining-conversations"/);
    assert.match(continuation, locale === 'en' ? /More current records remain/ : /لا تزال هناك سجلات حالية أخرى/);
    assert.doesNotMatch(continuation, /data-state="empty"/);
    assert.doesNotMatch(html, /Discuss the explanation/);
    assert.match(html, /My checked explanation/);
  }
});
