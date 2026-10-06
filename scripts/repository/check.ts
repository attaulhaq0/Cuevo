import { spawnSync } from 'node:child_process';
import { lstat, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkRepository, isGeneratedPath, isSecretPath, type RepositoryInventory } from './rules';

function git(root: string, args: string[], input?: string): string {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', input, maxBuffer: 16 * 1024 * 1024, windowsHide: true });
  // check-ignore returns 1 when no supplied path is ignored.
  if (result.error || (result.status !== 0 && !(args[0] === 'check-ignore' && result.status === 1))) {
    throw new Error(`Git repository inventory failed (${args[0]}): ${result.error?.message ?? result.stderr.trim()}`);
  }
  return result.stdout;
}

function ignored(root: string, values: string[]): Set<string> {
  if (!values.length) return new Set();
  return new Set(git(root, ['check-ignore', '--no-index', '-z', '--stdin'], `${values.join('\0')}\0`).split('\0').filter(Boolean).map(value => value.replace(/\/$/, '')));
}

/** Read only current authored files. Git's tracked names remain separate for ignored-output detection. */
export async function inventoryRepository(root: string): Promise<RepositoryInventory> {
  const trackedPaths = [...new Set(git(root, ['ls-files', '--cached', '-z']).split('\0').filter(Boolean))];
  const candidates = [...new Set(git(root, ['ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean))];
  const ignoredFiles = ignored(root, candidates);
  const files: RepositoryInventory['files'] = [];
  for (const value of candidates) {
    if (ignoredFiles.has(value) || isGeneratedPath(value)) continue;
    const absolute = path.resolve(root, value);
    if (!absolute.startsWith(`${path.resolve(root)}${path.sep}`)) throw new Error('Git inventory returned a path outside the repository.');
    const metadata = await lstat(absolute).catch(error => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    });
    if (!metadata?.isFile()) continue;
    // Filename metadata can be reported safely; never load credential bytes.
    files.push({ path: value, content: isSecretPath(value) ? undefined : await readFile(absolute) });
  }
  const directories: string[] = [];
  async function walk(directory: string) {
    const entries = (await readdir(directory, { withFileTypes: true })).filter(entry => entry.isDirectory());
    const relative = entries.map(entry => path.relative(root, path.join(directory, entry.name)).replaceAll('\\', '/')).filter(value => !isGeneratedPath(value));
    const ignoredDirectories = ignored(root, relative.map(value => `${value}/`));
    for (const value of relative) {
      if (ignoredDirectories.has(value)) continue;
      directories.push(value);
      await walk(path.join(root, value));
    }
  }
  await walk(root);
  return { files, directories, trackedPaths };
}

export async function runRepositoryCheck(root: string): Promise<number> {
  const inventory = await inventoryRepository(root);
  const issues = checkRepository(inventory);
  if (issues.length) {
    for (const issue of issues) console.error(`${issue.file}: [${issue.rule}] ${issue.message}`);
    return 1;
  }
  console.log(`Repository checks passed: ${inventory.files.length} current tracked/nonignored files, ${inventory.directories.length} authored directories, tracked output/credential paths and meaningful source duplicates.`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = await runRepositoryCheck(path.resolve(import.meta.dirname, '../..')); }
  catch (error) { console.error(`Repository check failed: ${(error as Error).message}`); process.exitCode = 1; }
}
