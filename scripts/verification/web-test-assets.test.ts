import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

test('Node render fixtures resolve real owned WebP dimensions for Next Image', () => {
  const asset = resolve('apps/web/shared/assets/cuevo-mark.webp');
  const child = spawnSync(process.execPath, ['--import', 'tsx', '--import', pathToFileURL(resolve('scripts/verification/web-test-assets.ts')).href, '--input-type=module', '-e', `const {default: image}=await import(${JSON.stringify(pathToFileURL(asset).href)});console.log(JSON.stringify(image));`], { encoding: 'utf8' });
  assert.equal(child.status, 0, child.stderr);
  const image = JSON.parse(child.stdout);
  assert.equal(image.src, `/__unit_asset__/${createHash('sha256').update(readFileSync(asset)).digest('hex')}.webp`);
  assert.ok(Number.isInteger(image.width) && image.width > 0);
  assert.ok(Number.isInteger(image.height) && image.height > 0);
});
