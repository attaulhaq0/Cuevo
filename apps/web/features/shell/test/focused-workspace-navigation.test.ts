import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { WorkspaceChromeContext } from '../model.ts';
import { WorkspaceChrome } from '../components/workspace-chrome.tsx';

Object.assign(globalThis, { React });
const navigation = [
  { id: 'overview', label: 'Overview', icon: 'home' as const, onSelect() {} },
  { id: 'learning', label: 'Learning', icon: 'learning' as const, onSelect() {} },
  { id: 'academic', label: 'Academic', icon: 'assessment' as const, disabled: true, onSelect() {} },
];
const base: WorkspaceChromeContext = { navigation, selectedId: 'learning', navigationLabel: 'Workspaces', schoolName: 'School', personName: 'Learner', roleLabel: 'Student', locale: 'en', theme: 'light', brand: createElement('span', null, 'Cuevo') };
const render = (context: WorkspaceChromeContext) => renderToStaticMarkup(createElement(WorkspaceChrome, { context, children: createElement('input', { name: 'unsent-work', defaultValue: 'Current exact source' }) }));

test('focused work uses one contextual navigation and the current permitted switcher catalogue', () => {
  const html = render({ ...base, mode: 'focused', currentWorkspace: navigation[1] });
  assert.match(html, /data-navigation-mode="focused"/);
  assert.match(html, />Back to dashboard<\/span>/);
  assert.match(html, /workspace-chrome__switcher/);
  assert.match(html, /popover="auto"/);
  assert.doesNotMatch(html, /class="workspace-chrome__rail"/);
  assert.equal((html.match(/<nav /g) ?? []).length, 1);
  assert.equal((html.match(/data-workspace-destination=/g) ?? []).length, 3);
  assert.match(html, /data-workspace-destination="academic"[^>]*disabled=""/);
  assert.match(html, /name="unsent-work" value="Current exact source"/);
});

test('Home keeps the complete permitted global rail rather than the focused workspace chooser', () => {
  const html = render({ ...base, mode: 'home', selectedId: 'overview' });
  assert.match(html, /data-navigation-mode="home"/);
  assert.match(html, /class="workspace-chrome__rail"/);
  assert.doesNotMatch(html, /workspace-chrome__switcher|Back to dashboard/);
  assert.equal((html.match(/data-workspace-destination=/g) ?? []).length, 3);
});

test('unknown focused selection remains human-readable and deterministic in Arabic', () => {
  const context: WorkspaceChromeContext = { ...base, mode: 'focused', selectedId: 'missing', locale: 'ar' };
  const html = render(context);
  assert.equal(html, render(context));
  assert.match(html, /lang="ar" dir="rtl"/);
  assert.match(html, /العودة إلى لوحة التحكم/);
  assert.match(html, /اسم مساحة العمل غير متاح/);
  assert.doesNotMatch(html, />missing</);
});
