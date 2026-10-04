import { test } from 'vitest';
import assert from 'node:assert/strict';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WorkspaceTabs } from '../src/workspace-tabs.tsx';

Object.assign(globalThis, { React });
test('workspace tabs retain one selected action, illustrated labels and disabled semantics', () => {
  let changed = false;
  const html = renderToStaticMarkup(createElement(WorkspaceTabs, { label: 'Current work', selected: 'objectives', items: [{ id: 'objectives', label: 'Objectives', icon: 'learning' }, { id: 'rubrics', label: 'Rubrics', icon: 'assessment', disabled: true }], onChange: () => { changed = true; } }));
  assert.match(html, /role="group" aria-label="Current work"/);
  assert.equal((html.match(/aria-pressed="true"/g) ?? []).length, 1);
  assert.match(html, /disabled=""/);
  assert.match(html, /Objectives/); assert.match(html, /Rubrics/);
  assert.equal((html.match(/class="cuevo-icon/g) ?? []).length, 2);
  assert.equal(changed, false);
});
