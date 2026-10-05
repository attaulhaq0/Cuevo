import assert from 'node:assert/strict';
import { test } from 'vitest';
import { createElement } from 'react';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { IconButton } from '../src/icon-button';

Object.assign(globalThis,{React});
test('icon actions require localized accessible names and retain native disabled busy and form attributes',()=>{for(const label of['Refresh learner state','تحديث حالة الطالب']){const html=renderToStaticMarkup(createElement(IconButton,{label,icon:'refresh',disabled:true,'aria-busy':true,type:'button',form:'current-source',className:'owner-action'}));assert.match(html,/<button/);assert.ok(html.includes(`aria-label="${label}"`));assert.ok(html.includes(`title="${label}"`));assert.match(html,/disabled=""/);assert.match(html,/aria-busy="true"/);assert.match(html,/form="current-source"/);assert.match(html,/cuevo-icon-button/);assert.match(html,/owner-action/);assert.match(html,/aria-hidden="true"/);assert.match(html,/cuevo-icon-button__tooltip/);}assert.throws(()=>renderToStaticMarkup(createElement(IconButton,{label:' ',icon:'refresh'})));});
