import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as model from '../model.ts';
import type { WorkspaceNavigationItem } from '../model.ts';

Object.assign(globalThis, { React });
const navigation: WorkspaceNavigationItem[] = [
  { id: 'source-learning-id', label: 'My Learning', icon: 'learning', onSelect() {} },
  { id: 'private-record-id', label: 'Class community', icon: 'community', onSelect() {} },
  { id: 'academic', label: 'My progress', icon: 'progress', onSelect() {} },
  { id: 'arabic-learning', label: 'تعلّمي', icon: 'learning', onSelect() {} },
];

test('command matching searches current human labels only and preserves catalogue order and callbacks', () => {
  const result = model.matchWorkspaceNavigation(navigation, '  MY  ');
  assert.deepEqual(result.map(item => item.label), ['My Learning', 'My progress']);
  assert.equal(result[0], navigation[0]);
  assert.deepEqual(model.matchWorkspaceNavigation(navigation, 'private-record-id'), []);
  assert.deepEqual(model.matchWorkspaceNavigation(navigation, 'academic'), []);
  assert.deepEqual(model.matchWorkspaceNavigation(navigation, 'missing'), []);
  assert.deepEqual(model.matchWorkspaceNavigation(navigation, '   '), navigation);
  assert.deepEqual(model.matchWorkspaceNavigation([], ''), []);
});

test('matching supports Arabic and equivalent Unicode label input without inventing aliases or destinations', () => {
  assert.deepEqual(model.matchWorkspaceNavigation(navigation, ' تعلّ '), [navigation[3]]);
  const unicode: WorkspaceNavigationItem[] = [{ ...navigation[0], label: 'Café reading' }];
  assert.deepEqual(model.matchWorkspaceNavigation(unicode, 'cafe\u0301'), unicode);
  assert.deepEqual(model.matchWorkspaceNavigation(navigation.slice(0, 1), 'progress'), []);
  const duplicates = [{ ...navigation[0], label: 'Learning' }, { ...navigation[1], label: 'Learning' }];
  assert.deepEqual(model.matchWorkspaceNavigation(duplicates, 'learning').map(item => item.id), ['source-learning-id', 'private-record-id']);
});

test('Arabic label search accepts ordinary input without vocalization while preserving original visible names', () => {
  const arabic = [
    { ...navigation[0], label: 'التعلّم' },
    { ...navigation[1], label: 'التقدّم' },
  ];
  assert.deepEqual(model.matchWorkspaceNavigation(arabic, 'التعلم'), [arabic[0]]);
  assert.deepEqual(model.matchWorkspaceNavigation(arabic, 'التقدم'), [arabic[1]]);
  assert.equal(model.matchWorkspaceNavigation(arabic, 'التعلم')[0].label, 'التعلّم');
});

async function render(locale: 'en' | 'ar', items = navigation, query = '') {
  const { WorkspaceCommandResults } = await import('../components/workspace-command-navigation.tsx');
  return renderToStaticMarkup(createElement(WorkspaceCommandResults, { navigation: items, selectedId: 'source-learning-id', locale, query, onSelect() { throw new Error('Rendering must not select a destination'); } }));
}

test('command results show exact current labels, current-page context and native pending/disabled state', async () => {
  const items = [navigation[0], { ...navigation[1], pending: true }, { ...navigation[2], disabled: true }];
  const html = await render('en', items);
  assert.match(html, /aria-current="page"/);
  assert.match(html, /Current workspace/);
  assert.match(html, /disabled="" aria-busy="true"/);
  assert.match(html, /Unavailable/);
  assert.doesNotMatch(html, />source-learning-id<|>private-record-id<|>academic</);
  assert.equal((html.match(/<button /g) || []).length, 3);
  const filtered = await render('en', items, 'progress');
  assert.match(filtered, /My progress/);
  assert.doesNotMatch(filtered, /My Learning|Class community/);
});

test('empty searches, absent destinations and missing labels have localized accessible recovery', async () => {
  const noMatch = await render('en', navigation, 'unknown workspace');
  assert.match(noMatch, /role="status"/);
  assert.match(noMatch, /Try a different name or clear the search/);
  const emptyAr = await render('ar', []);
  assert.match(emptyAr, /role="status"/);
  assert.match(emptyAr, /لا تتاح مساحة عمل/);
  const unknown = await render('en', [{ ...navigation[0], label: '  ' }]);
  assert.match(unknown, /Workspace name is not available/);
  assert.match(unknown, /disabled=""/);
  assert.doesNotMatch(unknown, />source-learning-id</);
});

test('native command dialog starts closed with deterministic semantic markup and does not select on render', async () => {
  const { WorkspaceCommandNavigation } = await import('../components/workspace-command-navigation.tsx');
  const props = { navigation, selectedId: 'source-learning-id', locale: 'ar' as const };
  const first = renderToStaticMarkup(createElement(WorkspaceCommandNavigation, props));
  assert.equal(first, renderToStaticMarkup(createElement(WorkspaceCommandNavigation, props)));
  assert.match(first, /<dialog /);
  assert.match(first, /aria-labelledby=/);
  assert.match(first, /lang="ar" dir="rtl"/);
  assert.match(first, /<label[^>]*for=/);
  assert.match(first, /type="search"/);
  assert.doesNotMatch(first, /<dialog[^>]* open=|role="listbox"|role="combobox"/);
});
