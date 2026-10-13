import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { WorkspaceChromeContext, WorkspaceNavigationItem } from '../model.ts';
import { navigationFocusTarget } from '../model.ts';
Object.assign(globalThis, { React });
const { WorkspaceChrome } = await import('../components/workspace-chrome.tsx');
const { WorkspacePageHeading } = await import('@cuevo/ui');
const navigation: WorkspaceNavigationItem[] = [{ id: 'one', label: 'Learning', icon: 'learning', onSelect() {} }, { id: 'two', label: 'Review work', icon: 'assessment', disabled: true, onSelect() {} }, { id: 'three', label: 'Class community', icon: 'community', onSelect() {} }];
function context(): WorkspaceChromeContext { return { schoolName: null, personName: null, roleLabel: null, navigation, selectedId: 'one', locale: 'en', theme: 'light', navigationLabel: 'Current workspaces', brand: createElement('span', null, 'Cuevo'), languageControl: createElement('span', null, 'Language control') }; }
function render(value: WorkspaceChromeContext) { return renderToStaticMarkup(createElement(WorkspaceChrome, { context: value, children: createElement('h1', null, 'Current activity') })); }

test('one current navigation list has meaningful labels, decorative icons and no displayed IDs', () => { const html = render(context()); assert.equal((html.match(/<nav /g) || []).length, 1); assert.equal((html.match(/>Learning<\/span>/g) || []).length, 1); assert.match(html, /aria-current="page"/); assert.doesNotMatch(html, />one<|>two<|>three</); assert.match(html, /School information is not available/); });
test('disabled and pending choices retain native control state without invoking callbacks', () => { const value = context(); let calls = 0; value.navigation = [{ id: 'pending', label: 'Loading source', icon: 'reflection', pending: true, onSelect() { calls += 1; } }]; const html = render(value); assert.match(html, /disabled="" aria-busy="true"/); assert.equal(calls, 0); });
test('missing selected ID does not fabricate current navigation or human identity', () => { const value = context(); value.selectedId = 'missing'; const html = render(value); assert.doesNotMatch(html, /aria-current="page"|>missing</); assert.match(html, /Person information is not available/); });
test('arrow navigation skips disabled choices and uses real RTL direction', () => { assert.equal(navigationFocusTarget(navigation, 'one', 'ArrowRight', false), 'three'); assert.equal(navigationFocusTarget(navigation, 'one', 'ArrowRight', true), 'three'); assert.equal(navigationFocusTarget(navigation, 'three', 'Home', false), 'one'); assert.equal(navigationFocusTarget(navigation, 'one', 'End', false), 'three'); assert.equal(navigationFocusTarget(navigation, 'one', 'Enter', false), null); });
test('empty navigation yields localized recovery and deterministic first markup', () => { const value = context(); value.navigation = []; value.locale = 'ar'; value.theme = 'dark'; const first = render(value); assert.equal(first, render(value)); assert.match(first, /lang="ar" dir="rtl"/); assert.match(first, /data-theme="dark"/); assert.match(first, /لا تتاح مساحة عمل/); assert.doesNotMatch(first, /aria-current="page"/); });
test('three enabled choices mirror the logical horizontal arrow target', () => { const items = navigation.map(item => ({ ...item, disabled: false })); assert.equal(navigationFocusTarget(items, 'two', 'ArrowRight', false), 'three'); assert.equal(navigationFocusTarget(items, 'two', 'ArrowRight', true), 'one'); assert.equal(navigationFocusTarget(items, 'one', 'ArrowLeft', false), 'three'); });

test('shared header has one visible search launcher and one closed profile panel with supplied owner controls', () => {
  const value = context(); let calls = 0;
  value.searchAction = { label: 'Search workspaces', onClick() { calls++; }, controls: 'current-command', expanded: false, hasPopup: 'dialog', keyShortcuts: 'Control+K Meta+K' };
  value.accountAction = { label: 'Account', onClick() { calls++; } };
  value.settingsAction = { label: 'Access settings', onClick() { calls++; } };
  value.signOutAction = { label: 'Signing out…', pending: true, onClick() { calls++; } };
  value.appearanceControl = createElement('label', null, 'Appearance', createElement('select', { 'aria-label': 'Appearance', defaultValue: 'light' }, createElement('option', { value: 'light' }, 'Light')));
  value.profileNotice = createElement('p', { role: 'alert' }, 'Sign-out could not be confirmed.');
  const html = render(value);
  assert.match(html, /workspace-chrome__search/);
  assert.match(html, /aria-haspopup="dialog"/);
  assert.match(html, />Search workspaces<\/span>/);
  assert.match(html, /popover="auto"/);
  assert.match(html, /popoverTarget=/);
  assert.match(html, /aria-expanded="false"/);
  assert.equal((html.match(/aria-label="Appearance"/g) || []).length, 1);
  assert.match(html, /Access settings/);
  assert.match(html, /disabled="" aria-busy="true"[^>]*>.*Signing out/s);
  assert.match(html, /role="alert"/);
  assert.doesNotMatch(html, /role="menu"|role="menuitem"|type="search"/);
  assert.equal(calls, 0);
});

test('authenticated language owner exists once inside a closed Profile panel even without other profile actions', () => {
  const value = context();
  value.languageControl = createElement('div', { className: 'language-switch', role: 'group', 'aria-label': 'Language' }, createElement('button', { type: 'button', 'aria-pressed': true }, 'English'), createElement('button', { type: 'button', 'aria-pressed': false }, 'العربية'));
  const html = render(value);
  const utilities = html.match(/<div class="workspace-chrome__utilities">(.*?)<\/div>/s)?.[1] ?? '';
  assert.doesNotMatch(utilities, /language-switch|English|العربية/);
  assert.match(html, /class="workspace-chrome__profile"[^>]*>.*class="language-switch"/s);
  assert.equal((html.match(/class="language-switch"/g) ?? []).length, 1);
  assert.match(html, /aria-expanded="false"/);
});

test('focused chrome supplies the actual current workspace label to the semantic heading without altering source context', () => {
  const value = context(); value.mode = 'focused'; value.currentWorkspace = navigation[0];
  const html = renderToStaticMarkup(createElement(WorkspaceChrome, { context: value, children: createElement(WorkspacePageHeading, { title: 'Learning', workspaceTitle: true, caption: 'Current Cedar class', description: 'Approved source context' }) }));
  assert.match(html, /data-workspace-heading-compact="true"/);
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
  assert.match(html, /<h1[^>]*class="workspace-page-heading__semantic"[^>]*>Learning<\/h1>/);
  assert.match(html, /Current Cedar class/); assert.match(html, /Approved source context/);
  value.mode = 'home';
  const home = renderToStaticMarkup(createElement(WorkspaceChrome, { context: value, children: createElement(WorkspacePageHeading, { title: 'Learning' }) }));
  assert.doesNotMatch(home, /data-workspace-heading-compact="true"|workspace-page-heading__semantic/);
});
