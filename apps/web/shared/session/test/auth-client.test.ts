import assert from 'node:assert/strict';
import test from 'node:test';
import { createAuthClient } from '../supabase.ts';

const config = { supabaseUrl: 'http://127.0.0.1:56321', supabasePublishableKey: 'sb_publishable_synthetic-test-value', apiUrl: 'http://127.0.0.1:4000' };

test('browser StrictMode initialization reuses one in-memory auth client', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
  try {
    const first = createAuthClient(config);
    const second = createAuthClient(config);
    assert.ok(first);
    assert.equal(second, first);
    first.auth.stopAutoRefresh();
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'window', descriptor);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});

test('server rendering never creates a client shared across user requests', () => {
  assert.equal(createAuthClient(config), null);
});
