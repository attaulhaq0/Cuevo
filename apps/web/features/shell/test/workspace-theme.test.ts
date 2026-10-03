import assert from 'node:assert/strict';
import test from 'node:test';
import { workspaceTheme, themePreferenceCookie } from '../theme-model.ts';

test('server theme preference refuses unknown values and keeps system preference explicit', () => {
  assert.equal(workspaceTheme('dark'), 'dark');
  assert.equal(workspaceTheme('light'), 'light');
  assert.equal(workspaceTheme('system'), 'system');
  assert.equal(workspaceTheme('dark; Path=/'), 'light');
  assert.equal(workspaceTheme(undefined), 'light');
});

test('theme persistence contains only an allowed presentation choice and follows transport security', () => {
  assert.equal(themePreferenceCookie('dark', true), 'cuevo_workspace_theme=dark; Path=/; Max-Age=31536000; SameSite=Lax; Secure');
  assert.equal(themePreferenceCookie('system', false), 'cuevo_workspace_theme=system; Path=/; Max-Age=31536000; SameSite=Lax');
});
