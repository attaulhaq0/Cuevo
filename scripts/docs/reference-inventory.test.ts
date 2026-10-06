import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { inventoryDocumentation } from './check';

test('documentation inventory resolves stored visual references without decoding binary pixels as text', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'cuevo-reference-inventory-'));
  const resolved = path.resolve(temporary);
  if (!resolved.startsWith(path.resolve(os.tmpdir()) + path.sep)) throw new Error('Temporary reference test path escaped its root.');
  try {
    const directory = path.join(temporary, 'docs/design/references');
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, 'scene.png'), Buffer.from([137, 80, 78, 71, 255]));
    await writeFile(path.join(directory, 'index.html'), '<img src="scene.png" alt="Reference">');
    await writeFile(path.join(directory, 'README.md'), '[Reference](scene.png)');
    await mkdir(path.join(temporary, 'node_modules'), { recursive: true });
    await writeFile(path.join(temporary, 'node_modules/ignored.html'), 'Generated dependency');
    const inventory = await inventoryDocumentation(temporary, temporary);
    assert.deepEqual(inventory.map(file => file.path).sort(), ['docs/design/references/README.md', 'docs/design/references/index.html', 'docs/design/references/scene.png']);
    assert.equal(inventory.find(file => file.path.endsWith('.png'))?.content, '');
    assert.match(inventory.find(file => file.path.endsWith('.html'))?.content ?? '', /scene\.png/);
  } finally {
    await rm(resolved, { recursive: true, force: true });
  }
});
