import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRequire } from 'node:module';
import { QuickLoginChooser, TestingQuickLogin } from '../components/quick-login.tsx';
Object.assign(globalThis, { React });
type Element = { getAttribute(name: string): string | undefined; querySelector(selector: string): Element | null; querySelectorAll(selector: string): Element[]; textContent: string; hasAttribute(name: string): boolean };
const { parse } = createRequire(import.meta.url)('next/dist/compiled/node-html-parser') as { parse(html: string): Element };
test('quick-login control is absent from deterministic server and first render in both locales', () => {
  for (const locale of ['en', 'ar'] as const) {
    let calls = 0;
    const value = createElement(TestingQuickLogin, { locale, pending: false, error: null, onLogin() { calls++; } });
    assert.equal(renderToStaticMarkup(value), ''); assert.equal(renderToStaticMarkup(value), ''); assert.equal(calls, 0);
  }
});

test('available chooser is a named nonmodal region with localized role controls and no credential content', () => {
    for (const [locale, label] of [['en', 'Try Cuevo'], ['ar', 'جرّب كويفو']] as const) {
      const html = renderToStaticMarkup(createElement(QuickLoginChooser, { id: 'chooser', locale, pending: true, error: null, onLogin() {} }));
      const document = parse(html), region = document.querySelector('.auth-testing-login__panel');
      assert.ok(region); assert.equal(region.getAttribute('role'), 'region'); assert.equal(region.getAttribute('aria-label'), label); assert.equal(region.querySelector('h2')?.textContent, label);
      const controls = document.querySelectorAll('button'); assert.equal(controls.length, 6); assert.equal(controls.every(control => control.hasAttribute('disabled')), true);
      assert.doesNotMatch(html, /role="dialog"|password|access_token|refresh_token|synthetic-001/);
    }
});
