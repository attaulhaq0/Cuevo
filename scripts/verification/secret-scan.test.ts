import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { scanRepository } from './secret-scan';

test('repository scan refuses incomplete history and tracked private environment before invoking a scanner', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cuevo-secret-test-'));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: directory, stdio: 'pipe' });
  try {
    git('init', '--initial-branch=main'); git('config', 'user.name', 'Synthetic scanner test'); git('config', 'user.email', 'scanner@example.invalid');
    await writeFile(join(directory, 'source.txt'), 'Synthetic source.\n'); git('add', '.'); git('commit', '-m', 'Synthetic source');
    const head = git('rev-parse', 'HEAD').toString().trim();
    await writeFile(join(directory, '.git', 'shallow'), head + '\n');
    await assert.rejects(scanRepository(directory, 'scanner-must-not-run'), /complete Git history/);
    await rm(join(directory, '.git', 'shallow'));
    await writeFile(join(directory, '.git', 'info', 'grafts'), head + '\n');
    await assert.rejects(scanRepository(directory, 'scanner-must-not-run'), /graft metadata/);
    await rm(join(directory, '.git', 'info', 'grafts'));
    await writeFile(join(directory, '.env.local'), 'SYNTHETIC_NOT_A_CREDENTIAL=true\n'); git('add', '.env.local');
    await assert.rejects(scanRepository(directory, 'scanner-must-not-run'), /authored repository/);
    assert.equal(await readFile(join(directory, '.env.local'), 'utf8'), 'SYNTHETIC_NOT_A_CREDENTIAL=true\n');
    await mkdir(join(directory, 'nested'));
    await assert.rejects(scanRepository(join(directory, 'nested'), 'scanner-must-not-run'), /exact repository root/);
  } finally {
    assert.equal(dirname(directory), resolve(tmpdir())); assert.ok(basename(directory).startsWith('cuevo-secret-test-'));
    await rm(directory, { recursive: true, force: true });
  }
});
