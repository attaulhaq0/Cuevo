import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DevelopmentPolicyReading } from '../components/policy-reading.tsx';
import { parsePolicy } from '../model.ts';

Object.assign(globalThis, { React });
const policy = parsePolicy({ id: 'private-policy-key', version: 4, points: { practice: 0, revision: 7, reflection: 13 }, milestones: [{ key: 'private-milestone-key', title: 'Review three explanations', minimumPoints: 20 }], approvedBy: 'private-approver-key', approvedAt: '2026-10-03T23:10:00Z' });
const render = (locale: 'en' | 'ar' = 'en', value = policy) => renderToStaticMarkup(createElement(DevelopmentPolicyReading, { policy: value, locale }));

test('approved policy readback preserves each configured value including zero without exposing private keys', () => {
  const html = render();
  assert.match(html, /<dt>Practice points<\/dt><dd>0<\/dd>/);
  assert.match(html, /<dt>Revision points<\/dt><dd>7<\/dd>/);
  assert.match(html, /<dt>Reflection points<\/dt><dd>13<\/dd>/);
  assert.match(html, /Review three explanations/);
  assert.match(html, /Milestone points threshold: <strong>20<\/strong>/);
  assert.match(html, /dateTime="2026-10-03T23:10:00Z"/);
  assert.doesNotMatch(html, /private-|Level|costume|earned|<button|<form/);
});

test('an approved policy without milestones states its actual configuration without inventing a threshold', () => {
  const html = render('en', { ...policy, milestones: [] });
  assert.match(html, /This policy has no milestone thresholds/);
  assert.doesNotMatch(html, /Review three explanations|Milestone points threshold|100/);
});

test('Arabic readback preserves the same source values with deterministic localized dates and labels', () => {
  const html = render('ar');
  assert.equal(html, render('ar'));
  const number = new Intl.NumberFormat('ar');
  assert.ok(html.includes(`نقاط التدريب</dt><dd>${number.format(0)}`));
  assert.ok(html.includes(`نقاط المراجعة</dt><dd>${number.format(7)}`));
  assert.ok(html.includes(`نقاط التأمّل</dt><dd>${number.format(13)}`));
  assert.match(html, /الإنجازات المعتمدة/);
  assert.match(html, /Review three explanations/);
  assert.doesNotMatch(html, /private-|Practice points/);
});
