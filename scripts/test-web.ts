import { readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
const root = resolve(import.meta.dirname, '..');
function discover(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
    const file = join(folder, entry.name);
    return entry.isDirectory() ? discover(file) : entry.name.endsWith('.test.ts') ? [file] : [];
  });
}
const files = ['features', 'shared'].flatMap(folder => discover(join(root, 'apps/web', folder))).sort();
if (!files.length) throw new Error('No web tests discovered; refusing an empty passing run.');
console.log(`Discovered ${files.length} web test files across feature and shared ownership.`);
const directory = join(root, 'apps/web');
const result = spawnSync(process.execPath, ['--import', 'tsx', '--import', pathToFileURL(join(root,'scripts/verification/web-test-assets.ts')).href, '--test', ...files.map(file => relative(directory, file))], { cwd: directory, stdio: 'inherit' });
if (result.error || result.signal) {
  console.error('Web test process could not complete; no passing test result is available.');
}
process.exit(result.status ?? 1);
