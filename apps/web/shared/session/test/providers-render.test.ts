import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Providers, useApp } from '../providers.tsx';

Object.assign(globalThis, { React });
const config = { supabaseUrl: 'https://auth.example.invalid', supabasePublishableKey: 'sb_publishable_render_fixture', apiUrl: 'https://api.example.invalid' };

function InitialContext() {
  const app = useApp();
  assert.equal(typeof app.holdMembershipVerification, 'function');
  assert.equal(typeof app.clearNotice, 'function');
  assert.equal(typeof app.restoreSession, 'function');
  assert.equal(app.notice, null);
  assert.equal(app.noticeLocation, null);
  assert.equal(app.membership, null);
  assert.equal(app.accessToken, null);
  assert.equal(app.selectedChildId, '');
  assert.deepEqual(app.commandJournal.pending(), []);
  return createElement('p', null, `${app.locale}:${app.status}:${app.accessGeneration}`);
}

test('account continuation and route-notice surfaces coexist in inert deterministic server rendering', () => {
  for (const locale of ['en', 'ar'] as const) {
    const element = createElement(Providers, { config, initialLocale: locale, children: createElement(InitialContext) });
    const first = renderToStaticMarkup(element);
    assert.equal(first, `<p>${locale}:initializing:0</p>`);
    assert.equal(renderToStaticMarkup(element), first);
  }
});
