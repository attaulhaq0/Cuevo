import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CurriculumRecordHeading } from '../components/curriculum-workspace.tsx';

Object.assign(globalThis, { React });
test('curriculum record headings keep human source labels beside the canonical decorative icon', () => {
  for (const [icon, title] of [['curriculum', 'Current curriculum source'], ['learning', 'Compare reasons'], ['shield', 'Independent jurisdiction context']] as const) {
    const html = renderToStaticMarkup(createElement(CurriculumRecordHeading, { icon, children: title }));
    assert.match(html, /class="curriculum-record__title"/);
    assert.ok(html.includes(title));
    assert.match(html, /aria-hidden="true"/);
    assert.doesNotMatch(html, /<button|<form|Approved|customer.ready/);
  }
});
