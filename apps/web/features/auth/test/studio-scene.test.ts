import assert from 'node:assert/strict';
import test from 'node:test';
import { studioSceneProperties } from '../studio-scene.ts';
test('the companion and role tray preserve the approved artboard positions at native scale', () => {
  const properties = studioSceneProperties();
  const source = (name: string, axis: number) => parseFloat(properties[name]) * axis / 100;
  assert.ok(Math.abs(source('--studio-pair-x', 1536) - 207) < .01);
  assert.ok(Math.abs(source('--studio-pair-y', 1024) - 343) < .01);
  assert.ok(Math.abs(source('--studio-pair-width', 1536) - 543) < .01);
  assert.ok(Math.abs(source('--studio-roles-x', 1536) - 178) < .01);
  assert.ok(Math.abs(source('--studio-roles-y', 1024) - 777) < .01);
  assert.ok(Math.abs(source('--studio-roles-width', 1536) - 722) < .01);
});
test('learning stages retain their four separate desk anchors instead of an asymmetric gutter grid', () => {
  const properties = studioSceneProperties();
  const centers = ['learn', 'practice', 'feedback', 'progress'].map(key => parseFloat(properties[`--studio-${key}-x`]) * 1536 / 100);
  assert.deepEqual(centers.map(value => Math.round(value)), [138, 311, 720, 879]);
  assert.ok(parseFloat(properties['--studio-stage-y']) * 1024 / 100 >= 580);
});
