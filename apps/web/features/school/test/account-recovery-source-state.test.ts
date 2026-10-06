import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { registerHooks } from 'node:module';
import { CommandJournal, LearningApiError } from '../../../shared/api/client.ts';
import { commonAr, commonEn } from '../../../shared/i18n/common.ts';

const complete = { data: [], loaded: true, loading: false, loadingMore: false, error: null, moreError: null, nextCursor: null, loadMore() { throw Error('Rendering must not request a page'); } };
const fixture = { locale: 'en', commandJournal: new CommandJournal(), membership: { schoolId: 'current-school' }, source: complete as Record<string, unknown> };
Object.assign(globalThis, { React, recoverySourceFixture: fixture, recoveryCommonEn: commonEn, recoveryCommonAr: commonAr });
registerHooks({ load(url, context, next) {
  const path = url.replaceAll('\\', '/');
  if (path.endsWith('/shared/session/providers.tsx')) return { format: 'module', shortCircuit: true, source: 'export function useApp(){return globalThis.recoverySourceFixture}' };
  if (path.endsWith('/shared/hooks/use-paginated-query.ts')) return { format: 'module', shortCircuit: true, source: 'export function usePaginatedLearningQuery(){return globalThis.recoverySourceFixture.source}' };
  if (path.endsWith('/shared/hooks/use-api.ts')) return { format: 'module', shortCircuit: true, source: 'export function useApi(){const f=globalThis.recoverySourceFixture;return{t:f.locale==="ar"?globalThis.recoveryCommonAr:globalThis.recoveryCommonEn}}' };
  return next(url, context);
} });
const { SchoolAccountRecovery } = await import('../components/account-recovery.tsx');
function render(source: Record<string, unknown>) {
  fixture.source = source;
  return renderToStaticMarkup(createElement(SchoolAccountRecovery, { onRequested() { throw Error('Rendering must not approve recovery'); } }));
}

test('a complete current directory with no active recovery member explains absence without preparing account access', () => {
  for (const locale of ['en', 'ar']) {
    fixture.locale = locale;
    for (const data of [[], [{ id: 'suspended-member', displayName: 'Suspended member', status: 'suspended', role: 'teacher' }]]) {
      const html = render({ ...complete, data });
      assert.match(html, /data-state="empty"/);
      assert.match(html, locale === 'en' ? /No active school members are available for recovery/ : /لا يتاح أعضاء مدرسة نشطون لاستعادة الحساب/);
      assert.doesNotMatch(html, /<form|school-recovery-member|Suspended member/);
      assert.equal(fixture.commandJournal.pending().length, 0);
    }
  }
});

test('unloaded partial loading and failed member sources cannot become a confirmed empty directory', () => {
  for (const locale of ['en', 'ar']) {
    fixture.locale = locale;
    for (const delta of [{ loaded: false }, { nextCursor: 'remaining' }, { loadingMore: true }, { loading: true }, { moreError: new LearningApiError('unavailable') }, { error: new LearningApiError('denied') }]) {
      const html = render({ ...complete, ...delta });
      assert.doesNotMatch(html, /data-state="empty"|<form/);
      if ('nextCursor' in delta) assert.match(html, /data-page-cursor="remaining"/);
      if ('error' in delta) assert.match(html, /role="alert"/);
    }
  }
});
