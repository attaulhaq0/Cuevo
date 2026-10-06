import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Providers } from '../../../shared/session/providers.tsx';
import { DevelopmentWorkspace } from '../components/development-workspace.tsx';
Object.assign(globalThis, { React });
test('Development owns one localized h1 before current access and never mounts a guessed personal record', () => {
  for (const locale of ['en', 'ar'] as const) {
    const html = renderToStaticMarkup(createElement(Providers, { initialLocale: locale, config: { supabaseUrl: '', supabasePublishableKey: '', apiUrl: '' }, children: createElement(DevelopmentWorkspace) }));
    assert.equal((html.match(/<h1/g) ?? []).length, 1); assert.match(html, locale === 'en' ? /<h1[^>]*>Development<\/h1>/ : /<h1[^>]*>النموّ<\/h1>/);
    assert.doesNotMatch(html, /development-ledger|development-recognition/);
  }
});
