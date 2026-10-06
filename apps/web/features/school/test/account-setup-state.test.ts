import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { registerHooks } from 'node:module';
Object.assign(globalThis, { React });
const fixture = { locale: 'en', loading: true, reason: 'DELIVERY_UNAVAILABLE' };
Object.assign(globalThis, { accountSetupStateFixture: fixture });
registerHooks({ load(url, context, next) { const path = url.replaceAll('\\', '/');
  if (path.endsWith('/shared/session/providers.tsx')) return { format: 'module', shortCircuit: true, source: 'export function useApp(){return globalThis.accountSetupStateFixture}' };
  if (path.endsWith('/shared/hooks/use-api.ts')) return { format: 'module', shortCircuit: true, source: 'export function useApi(){return{t:{}}}export function useApiQuery(){const f=globalThis.accountSetupStateFixture;return{loading:f.loading,error:null,data:{state:"SETUP_REQUIRED",reason:f.reason}}}' };
  return next(url, context);
} });
const { SchoolAccounts } = await import('../components/accounts.tsx');
test('account setup loading and unavailable states retain local recovery without mounting invitation authority', () => {
  for (const locale of ['en', 'ar']) { fixture.locale = locale; fixture.loading = true;
    const pending = renderToStaticMarkup(createElement(SchoolAccounts)); assert.match(pending, /data-state="loading"/); assert.doesNotMatch(pending, /<form|school-account-invitation/);
    fixture.loading = false; const unavailable = renderToStaticMarkup(createElement(SchoolAccounts)); assert.match(unavailable, /data-state="unavailable"/); assert.match(unavailable, locale === 'en' ? /Check setup again/ : /إعادة التحقق من الإعداد/); assert.doesNotMatch(unavailable, /<form|school-account-invitation/);
  }
});
