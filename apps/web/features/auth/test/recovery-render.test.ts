import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Providers } from '../../../shared/session/providers.tsx';
import { AccountRecovery, RecoveryPanel, type RecoveryView } from '../components/recovery.tsx';

function render(element: React.ReactNode, locale: 'en' | 'ar' = 'en') {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'React'); Object.defineProperty(globalThis, 'React', { configurable: true, value: React });
  try { return renderToStaticMarkup(createElement(Providers, { initialLocale: locale, config: { supabaseUrl: '', supabasePublishableKey: '', apiUrl: '' }, children: element })); }
  finally { if (descriptor) Object.defineProperty(globalThis, 'React', descriptor); else Reflect.deleteProperty(globalThis, 'React'); }
}
function panel(view: RecoveryView, locale: 'en' | 'ar' = 'en', online = true) {
  return render(createElement(RecoveryPanel, { view, locale, online, confirmed: false, onConfirmed: () => {}, onContinue: () => {}, onPassword: () => {}, onReconcile: () => {}, onSignOut: () => {}, onReturn: () => {}, onDecline: () => {} }), locale);
}
test('recovery server markup is inert, deterministic and contains no credential or password form', () => {
  const element = createElement(AccountRecovery, { returnToSignIn: () => {} }); const first = render(element);
  assert.equal(first, render(element)); assert.match(first, /Preparing your recovery/); assert.doesNotMatch(first, /token_hash|admission_secret|type="password"/);
});
test('recovery continuation requires explicit confirmation and online access', () => {
  const ready = panel({ stage: 'ready' }); assert.match(ready, /type="checkbox"/); assert.doesNotMatch(ready, /checked=""/); assert.match(ready, /type="submit" disabled=""/);
  const offline = panel({ stage: 'ready' }, 'ar', false); assert.match(offline, /غير متصل/); assert.match(offline, /disabled=""/);
});
test('authorized recovery mounts matching new-password inputs but never grants a role or workspace access', () => {
  const html = panel({ stage: 'authorized' }); assert.match(html, /Password recovery approved/); assert.match(html, /minLength="12"/); assert.match(html, /maxLength="128"/); assert.match(html, /autoComplete="new-password"/);
  assert.doesNotMatch(html, /schoolId|AUTHORIZED|Open workspace|Return to sign in|token_hash/);
});
test('unknown password save offers reconciliation without another password form', () => {
  const html = panel({ stage: 'reconcile', failure: 'password-unknown' }); assert.match(html, /Check password recovery/); assert.match(html, /role="alert"/); assert.doesNotMatch(html, /type="password"|Save password/);
});
test('confirmed password change requires separate global signout before sign-in navigation', () => {
  const saved = panel({ stage: 'password-confirmed' }); assert.match(saved, /Sign out all sessions/); assert.doesNotMatch(saved, /Return to sign in|type="password"/);
  const unknown = panel({ stage: 'password-confirmed', failure: 'signout-unknown' }); assert.match(unknown, /not confirmed/); assert.match(unknown, /Sign out all sessions/); assert.doesNotMatch(unknown, /Recovery finished/);
  const done = panel({ stage: 'complete' }, 'ar'); assert.match(done, /اكتملت الاستعادة/); assert.match(done, /العودة لتسجيل الدخول/); assert.doesNotMatch(done, /COMPLETED|schoolId|SQL/);
});
