import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Providers } from '../../../shared/session/providers.tsx';
import { AccountAdmission, AdmissionPanel, type AdmissionView } from '../components/admission.tsx';

function render(element: React.ReactNode, locale: 'en' | 'ar' = 'en') {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'React'); Object.defineProperty(globalThis, 'React', { configurable: true, value: React });
  try { return renderToStaticMarkup(createElement(Providers, { initialLocale: locale, config: { supabaseUrl: '', supabasePublishableKey: '', apiUrl: '' }, children: element })); }
  finally { if (descriptor) Object.defineProperty(globalThis, 'React', descriptor); else Reflect.deleteProperty(globalThis, 'React'); }
}
const panel = (view: AdmissionView, locale: 'en' | 'ar' = 'en') => render(createElement(AdmissionPanel, { view, locale, online: true, confirmed: false, onConfirmed: () => {}, onContinue: () => {}, onPassword: () => {}, onOpen: () => {}, onDecline: () => {} }), locale);
test('server and first client markup are inert and share the same server locale', () => {
  const server = render(createElement(AccountAdmission, { openWorkspace: () => {} }), 'ar'); const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { hash: '#token_hash=private-token&admission_secret=private-secret' } } });
  try { assert.equal(render(createElement(AccountAdmission, { openWorkspace: () => {} }), 'ar'), server); } finally { if (descriptor) Object.defineProperty(globalThis, 'window', descriptor); else Reflect.deleteProperty(globalThis, 'window'); }
  assert.match(server, /دعوة المدرسة/); assert.match(server, /جارٍ تجهيز/); assert.doesNotMatch(server, /private-token|private-secret|token_hash|admission_secret/); assert.doesNotMatch(server, /<form/);
});
test('ready invitation explains deliberate acceptance and offers an unchecked confirmation and decline', () => {
  const html = panel({ stage: 'ready' }); assert.match(html, /Only continue if you expected/); assert.match(html, /type="checkbox"/); assert.doesNotMatch(html, /checked=""/); assert.match(html, /Continue/); assert.match(html, /Decline invitation/); assert.match(html, /disabled=""/); assert.doesNotMatch(html, /schoolId|UUID|SQL/);
});
test('unknown claim retains an explicit reconciliation action while verification uncertainty requires school review', () => {
  const html = panel({ stage: 'error', failure: 'outcome-unknown' }); assert.match(html, /not confirmed/); assert.match(html, /Check this admission again/); assert.match(html, /role="alert"/);
  const otp = panel({ stage: 'error', failure: 'verification-unknown' }); assert.match(otp, /new invitation/); assert.doesNotMatch(otp, /Check this admission again/);
});
test('confirmed admission shows human role and a separate password form without invented school or IDs', () => {
  const html = panel({ stage: 'accepted', role: 'student' }); assert.match(html, /School access accepted/); assert.match(html, /Student/); assert.match(html, /Set your password/); assert.match(html, /minLength="12"/); assert.match(html, /autoComplete="new-password"/); assert.doesNotMatch(html, /Open workspace|29000000|schoolId|CLAIMED|admission-password-hint admission-error/);
});
test('password confirmation alone enables workspace continuation and Arabic labels remain human', () => {
  const english = panel({ stage: 'complete', role: 'teacher' }); assert.match(english, /Password saved/); assert.match(english, /Open workspace/);
  const arabic = panel({ stage: 'accepted', role: 'parent' }, 'ar'); assert.match(arabic, /تم قبول الوصول إلى المدرسة/); assert.match(arabic, /ولي أمر/); assert.match(arabic, /تأكيد كلمة المرور/); assert.doesNotMatch(arabic, /parent|schoolId|SQL/);
});
