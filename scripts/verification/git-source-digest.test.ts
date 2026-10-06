import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mock } from 'node:test';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';

const hash = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');
const git = (root: string, ...args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
async function owner() {
  let value: Record<string, unknown> = {};
  try { value = await import(pathToFileURL(resolve(import.meta.dirname, 'git-source-digest.ts')).href); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ERR_MODULE_NOT_FOUND') throw error; }
  assert.equal(typeof value.readGitBinaryDiffDigest, 'function');
  return value as typeof import('./git-source-digest');
}
async function fixture(run: (root: string, base: string, source: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'cuevo-source-digest-'));
  try {
    await writeFile(join(root, '.gitattributes'), '* -text\n'); git(root, 'init', '--quiet');
    await writeFile(join(root, 'README.md'), 'Original\n'); git(root, 'add', '.'); git(root, '-c', 'user.name=Source fixture', '-c', 'user.email=source@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'base');
    const base = git(root, 'rev-parse', 'HEAD');
    await mkdir(join(root, 'assets')); await writeFile(join(root, 'assets/reference.bin'), randomBytes(65536));
    await writeFile(join(root, 'README.md'), 'Current\n'); git(root, 'add', '.'); git(root, '-c', 'user.name=Source fixture', '-c', 'user.email=source@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'source');
    await run(root, base, git(root, 'rev-parse', 'HEAD'));
  } finally { assert.equal(resolve(root, '..'), resolve(tmpdir())); await rm(root, { recursive: true, force: true }); }
}

test('streamed source digest retains the complete exact binary Git diff and empty diff', async () => {
  const api = await owner(); await fixture(async (root, base, source) => {
    const bytes = execFileSync('git', ['-C', root, 'diff', '--no-ext-diff', '--no-textconv', '--binary', base, source, '--']);
    assert(Buffer.byteLength(bytes) > 65536);
    assert.deepEqual(await api.readGitBinaryDiffDigest({ repoRoot: root, baseSha: base, sourceSha: source }), { sha256: hash(bytes), bytes: bytes.length });
    assert.deepEqual(await api.readGitBinaryDiffDigest({ repoRoot: root, baseSha: source, sourceSha: source }), { sha256: hash(Buffer.alloc(0)), bytes: 0 });
  });
});
test('unresolved or injected revisions fail without printing arguments or executing another command', async () => {
  const api = await owner(); await fixture(async (root, base, source) => {
    for (const revision of ['--output=outside', 'a'.repeat(40), source + ';echo private']) await assert.rejects(api.readGitBinaryDiffDigest({ repoRoot: root, baseSha: base, sourceSha: revision }), /requires review; contents withheld/);
  });
});

test('a stalled child is terminated and rejected without waiting indefinitely for close', async () => {
  const api = await owner();
  const child = new EventEmitter() as EventEmitter & { stdout: PassThrough; kill: (signal?: string) => boolean };
  child.stdout = new PassThrough(); const kills: (string | undefined)[] = [];
  child.kill = signal => { kills.push(signal); return true; };
  const spawn = mock.method(childProcess, 'spawn', () => child); syncBuiltinESMExports();
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const pending = api.readGitBinaryDiffDigest({ repoRoot: resolve('.'), baseSha: 'a'.repeat(40), sourceSha: 'b'.repeat(40) });
    const refusal = assert.rejects(pending, /requires review; contents withheld/);
    mock.timers.tick(120000); assert.deepEqual(kills, [undefined]);
    mock.timers.tick(2000); await refusal; assert.deepEqual(kills, [undefined, 'SIGKILL']);
  } finally { mock.timers.reset(); spawn.mock.restore(); syncBuiltinESMExports(); child.stdout.destroy(); }
});

test('overflow cancels the original stream and cannot return a partial digest', async () => {
  const api = await owner();
  const child = new EventEmitter() as EventEmitter & { stdout: PassThrough; kill: (signal?: string) => boolean };
  child.stdout = new PassThrough(); const kills: (string | undefined)[] = [];
  child.kill = signal => { kills.push(signal); return true; };
  const spawn = mock.method(childProcess, 'spawn', () => child); syncBuiltinESMExports();
  try {
    const refusal = assert.rejects(api.readGitBinaryDiffDigest({ repoRoot: resolve('.'), baseSha: 'a'.repeat(40), sourceSha: 'b'.repeat(40) }), /requires review; contents withheld/);
    const part = Buffer.alloc(1024 * 1024); for (let index = 0; index <= 512; index++) child.stdout.emit('data', part);
    child.emit('close', 0); await refusal; assert.equal(kills.length, 1);
  } finally { spawn.mock.restore(); syncBuiltinESMExports(); child.stdout.destroy(); }
});
