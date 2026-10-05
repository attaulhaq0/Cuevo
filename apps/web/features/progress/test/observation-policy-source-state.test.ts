import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CommandJournal, LearningApiError } from '../../../shared/api/client.ts';
import { FormDrafts } from '../../../shared/session/form-drafts.ts';
import { commonAr, commonEn } from '../../../shared/i18n/common.ts';

const school = '60000000-0000-4000-8000-000000000001', actor = '60000000-0000-4000-8000-000000000002';
const fixture = { app: {} as Record<string, unknown>, loading: false, error: null as LearningApiError | null, current: 'missing' as 'missing' | 'stale' | 'valid' };
Object.assign(globalThis, { React, observationSourceFixture: fixture, observationSourceCommonEn: commonEn, observationSourceCommonAr: commonAr });
registerHooks({ load(url, context, next) {
  const path = url.replaceAll('\\', '/');
  if (path.endsWith('/shared/session/providers.tsx')) return { format: 'module', shortCircuit: true, source: 'export function useApp(){return globalThis.observationSourceFixture.app}' };
  if (path.endsWith('/shared/hooks/use-api.ts')) return { format: 'module', shortCircuit: true, source: `export function useApiQuery(path,parse){const f=globalThis.observationSourceFixture;if(!path)return{data:null,loading:false,error:null};const data=f.current==='missing'?null:parse({schoolId:'${school}',status:'UNCONFIGURED',policy:null});return{data:f.current==='stale'?{...data,scope:'previous source'}:data,loading:f.loading,error:f.error}}export function useApi(){const f=globalThis.observationSourceFixture;return{journal:f.app.commandJournal,t:f.app.locale==='ar'?globalThis.observationSourceCommonAr:globalThis.observationSourceCommonEn}}` };
  return next(url, context);
} });
const { LearningObservationPolicyPanel } = await import('../components/observation-policy.tsx');
function reset(locale: 'en' | 'ar', role = 'admin') { fixture.loading = false; fixture.error = null; fixture.current = 'missing'; fixture.app = { locale, online: true, status: 'ready', apiUrl: 'https://fixture.invalid', accessToken: 'fictional', accessGeneration: 1, membership: { schoolId: school, userId: actor, role, entitlements: ['school.context', 'learner.state'] }, commandJournal: new CommandJournal(), formDrafts: new FormDrafts(), reportDiagnostic() {}, refreshAccess() {} }; }
const render = () => renderToStaticMarkup(createElement(LearningObservationPolicyPanel));
test('allowed observation policy with a missing or stale current envelope shows unknown and existing-source refresh instead of disappearing', () => {
  for (const locale of ['en', 'ar'] as const) for (const current of ['missing', 'stale'] as const) { reset(locale); fixture.current = current; const html = render(); assert.match(html, /data-state="unknown"/); assert.match(html, /role="status"/); assert.match(html, locale === 'en' ? /Refresh observation policy/ : /تحديث سياسة الملاحظات/); assert.doesNotMatch(html, /<form|name="developmentWindowDays"|data-state="empty"/); }
});
test('observation-policy source loading and denial stay distinct without duplicate unknown', () => {
  for (const state of ['loading', 'denied'] as const) { reset('en'); fixture.loading = state === 'loading'; fixture.error = state === 'denied' ? new LearningApiError('denied') : null; const html = render(); assert.match(html, new RegExp('data-state="' + (state === 'loading' ? 'loading' : 'denied') + '"')); assert.doesNotMatch(html, /data-state="unknown"|<form/); }
});
test('offline and unadmitted observation panels remain absent beneath their parent workspace state', () => {
  reset('en'); fixture.app.online = false; assert.equal(render(), ''); reset('ar', 'student'); assert.equal(render(), '');
});
test('valid unconfigured current policy keeps human approval controls and a missing source cannot change the original approval key', () => {
  reset('en'); fixture.current = 'valid'; assert.match(render(), /name="developmentWindowDays"/); const journal = fixture.app.commandJournal as CommandJournal; journal.prepare('/v1/learner-observation-policy', '/v1/learner-observation-policy', { expectedVersion: 0, developmentWindowDays: 30, reason: 'Original school reason', confirmApproval: true }); const original = journal.pending(); fixture.current = 'missing'; const html = render(); assert.doesNotMatch(html, /<form/); assert.deepEqual(journal.pending(), original);
});
