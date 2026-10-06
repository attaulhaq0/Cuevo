import assert from 'node:assert/strict';
import test from 'node:test';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
Object.assign(globalThis, { React });
const { ThemeControl } = await import('../components/workspace-theme.tsx');

test('appearance exposes two exclusive choices, a decorative icon and an explicit device preference', () => {
  for (const value of ['light', 'dark', 'system'] as const) {
    const html = renderToStaticMarkup(React.createElement(ThemeControl, { value, locale: 'en', onChange() {} }));
    assert.match(html, /role="group" aria-label="Appearance"/);
    assert.equal((html.match(/<button /g) ?? []).length, 2);
    assert.equal((html.match(/aria-pressed="true"/g) ?? []).length, value === 'system' ? 0 : 1);
    assert.match(html, /<svg[^>]*aria-hidden="true"/);
    assert.match(html, /Use device settings/);
    assert.doesNotMatch(html, /<select/);
  }
});

test('theme buttons and device preference use the existing single change callback', () => {
  const changes: string[] = [];
  const control = ThemeControl({ value: 'system', locale: 'ar', onChange: value => changes.push(value) });
  const children = React.Children.toArray(control.props.children) as React.ReactElement[];
  const group = children.find(child => child.props && (child.props as { role?: string }).role === 'group')!;
  const buttons = React.Children.toArray((group.props as { children: React.ReactNode }).children) as React.ReactElement<{ onClick(): void }>[];
  buttons[0].props.onClick(); buttons[1].props.onClick();
  const deviceLabel = children.find(child => child.type === 'label')!;
  const input = (React.Children.toArray((deviceLabel.props as { children: React.ReactNode }).children) as React.ReactElement[]).find(child => child.type === 'input')!;
  const onChange = (input.props as { onChange(event: { currentTarget: { checked: boolean } }): void }).onChange;
  onChange({ currentTarget: { checked: true } }); onChange({ currentTarget: { checked: false } });
  assert.deepEqual(changes, ['light', 'dark', 'system', 'light']);
  const html = renderToStaticMarkup(control);
  assert.match(html, /aria-label="المظهر"/); assert.match(html, /حسب إعدادات الجهاز/);
});
