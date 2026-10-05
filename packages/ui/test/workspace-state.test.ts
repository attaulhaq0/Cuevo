import { test } from 'vitest';
import assert from 'node:assert/strict';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WorkspaceState } from '../src/workspace-state';
Object.assign(globalThis,{React});
test('current empty state presents the owner explanation without inventing an action or status claim',()=>{
 const html=renderToStaticMarkup(createElement(WorkspaceState,{kind:'empty',icon:'practice',title:'No assigned practice tasks',description:'Assigned tasks will appear here when your teacher shares them.'}));
 assert.match(html,/cuevo-workspace-state/);assert.match(html,/data-state="empty"/);assert.match(html,/No assigned practice tasks/);assert.match(html,/cuevo-icon/);assert.doesNotMatch(html,/<h[1-6]|<button|role="alert"|role="status"|All available/);
});
test('loading, denied and review semantics stay explicit with owner-supplied recovery',()=>{
 for(const kind of ['loading','denied','review']as const){const html=renderToStaticMarkup(createElement(WorkspaceState,{kind,title:'Current source',headingLevel:3,role:kind==='denied'?'alert':'status',actions:createElement('button',{type:'button'},'Refresh current source')},'Current receipt context'));
  assert.match(html,new RegExp(`data-state="${kind}"`));assert.match(html,/<h3/);assert.match(html,/Current receipt context/);assert.match(html,/Refresh current source/);
 }
});
