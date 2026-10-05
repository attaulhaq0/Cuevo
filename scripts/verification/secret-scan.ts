import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { chmod, lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { secretScanArgs, secretScanAsset, secretScanSummary, validateAuthoredPath, reviewedNonCredential, type SecretScanSummary } from './secret-scan-policy';
import { sameSourceManifest } from './rules';

const scannerEnvironment = () => ({ ...Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'TMP', 'TEMP', 'TMPDIR'].flatMap(key => process.env[key] === undefined ? [] : [[key, process.env[key]!]])),
  GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null',
  GIT_NO_REPLACE_OBJECTS: '1' });
const git = (root: string, args: string[]) => {
  const result = spawnSync('git', args, { cwd: root, env: scannerEnvironment(), encoding: 'utf8', timeout: 30000, maxBuffer: 16 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw Error('Secret scan Git source evidence is unavailable.');
  return result.stdout;
};
const removeOwned = async (directory: string, parent: string) => {
  if (dirname(directory) !== parent || !relative(parent, directory).startsWith('cuevo-secret-')) throw Error('Secret scan cleanup refuses an unowned directory.');
  await rm(directory, { recursive: true, force: true });
};

type ReviewedSummary = SecretScanSummary & { reviewedNonCredentialCount: number; unresolvedFindingCount: number };
async function scan(executable: string, scope: 'history' | 'worktree', source: string, directory: string): Promise<ReviewedSummary> {
  const config = join(directory, 'default.toml'); const ignore = join(directory, 'empty.ignore'); const report = join(directory, `${scope}.json`);
  await writeFile(config, '[extend]\nuseDefault = true\n'); await writeFile(ignore, '');
  const result = spawnSync(executable, secretScanArgs(scope, source, report, config, ignore), { cwd: directory, env: scannerEnvironment(), encoding: 'utf8', timeout: 310000, maxBuffer: 16 * 1024 * 1024 });
  try {
    if (result.error || result.signal) throw Error('Secret scanner execution failed.');
    const findings: unknown = JSON.parse(await readFile(report, 'utf8')); const summary = secretScanSummary(scope, result.status, findings);
    let reviewedNonCredentialCount = 0;
    for (const finding of findings as { File?: unknown; StartLine?: unknown; EndLine?: unknown; RuleID?: unknown; Commit?: unknown }[]) {
      if (typeof finding.File !== 'string' || !Number.isSafeInteger(finding.StartLine) || typeof finding.StartLine !== 'number'
        || !Number.isSafeInteger(finding.EndLine) || finding.EndLine !== finding.StartLine || finding.StartLine < 1 || finding.RuleID !== 'generic-api-key') continue;
      let file: string; let text: string; let commit = ''; let ancestorVerified = false;
      if (scope === 'history') {
        if (typeof finding.Commit !== 'string' || !/^[a-f0-9]{40}$/.test(finding.Commit)) continue;
        file = validateAuthoredPath(finding.File); commit = finding.Commit;
        git(source, ['merge-base', '--is-ancestor', commit, 'HEAD']); ancestorVerified = true;
        text = git(source, ['show', `${commit}:${file}`]);
      } else {
        file = validateAuthoredPath(relative(source, resolve(finding.File)).replaceAll('\\', '/'));
        text = await readFile(join(source, file), 'utf8');
      }
      const line = text.split(/\r?\n/)[finding.StartLine - 1]; if (line === undefined) continue;
      if (reviewedNonCredential(scope, { file, rule: finding.RuleID, line: finding.StartLine, endLine: finding.EndLine as number,
        lineSha256: createHash('sha256').update(line).digest('hex'), commit, ancestorVerified })) reviewedNonCredentialCount++;
    }
    return { ...summary, reviewedNonCredentialCount, unresolvedFindingCount: summary.findingCount - reviewedNonCredentialCount };
  } catch { throw Error('Secret scanner returned unavailable or invalid evidence; output withheld.'); }
  finally { await rm(report, { force: true }); }
}

export async function scanRepository(root: string, executable: string) {
  const source = resolve(root); const gitRoot = resolve(git(source, ['rev-parse', '--show-toplevel']).trim());
  if (gitRoot !== source || git(source, ['rev-parse', '--is-shallow-repository']).trim() !== 'false') throw Error('Secret scan requires the exact repository root and complete Git history.');
  const grafts = resolve(source, git(source, ['rev-parse', '--git-path', 'info/grafts']).trim());
  try { await lstat(grafts); throw Error('Legacy Git graft metadata is refused.'); }
  catch (error) { if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ENOENT') throw Error('Secret scan refuses legacy Git graft metadata.'); }
  const parent = join(source, '.local', 'security'); await mkdir(parent, { recursive: true });
  const directory = await mkdtemp(join(parent, 'cuevo-secret-scan-'));
  try {
    const authored = join(directory, 'authored'); await mkdir(authored);
    const snapshot = async (copy: boolean) => {
      const manifest: { path: string; sha256: string }[] = [];
      const paths = new Set(git(source, ['ls-files', '-z', '--cached', '--others', '--exclude-standard']).split('\0').filter(Boolean));
      for (const path of paths) {
        validateAuthoredPath(path); const file = join(source, path);
        let stat; try { stat = await lstat(file); } catch (error) { if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') continue; throw Error('Authored secret-scan source is unavailable.'); }
        const canonical = relative(await realpath(source), await realpath(file));
        if (!stat.isFile() || stat.isSymbolicLink() || canonical.startsWith('..') || resolve(source, canonical) !== resolve(file)) throw Error('Secret scan refuses non-file, linked or external authored source.');
        const bytes = await readFile(file); manifest.push({ path, sha256: createHash('sha256').update(bytes).digest('hex') });
        if (copy) { const destination = join(authored, path); await mkdir(dirname(destination), { recursive: true }); await writeFile(destination, bytes); }
      }
      return manifest;
    };
    const head = git(source, ['rev-parse', 'HEAD']).trim(); const before = await snapshot(true);
    const history = await scan(executable, 'history', source, directory);
    const worktree = await scan(executable, 'worktree', authored, directory);
    if (git(source, ['rev-parse', 'HEAD']).trim() !== head || !sameSourceManifest(before, await snapshot(false))) throw Error('Authored source changed during secret scan; rerun from the final source.');
    return { check: 'repository-secrets', scannerVersion: '8.30.1', history, worktree, status: history.unresolvedFindingCount || worktree.unresolvedFindingCount ? 'FINDINGS' as const : 'CLEAN' as const };
  } finally { await removeOwned(directory, parent); }
}

export async function verifyScanner(executable: string, parent: string) {
  await mkdir(parent, { recursive: true }); const directory = await mkdtemp(join(parent, 'cuevo-secret-fixture-'));
  try {
    const repository = join(directory, 'repository'); await mkdir(repository);
    git(repository, ['init', '--initial-branch=main']);
    git(repository, ['config', 'user.name', 'Synthetic secret-scan verification']); git(repository, ['config', 'user.email', 'scanner@example.invalid']);
    await writeFile(join(repository, '.gitignore'), '.local/\n.env*\n!.env.example\n');
    await writeFile(join(repository, 'source.txt'), 'Clean synthetic source.\n'); git(repository, ['add', '.']); git(repository, ['commit', '-m', 'Clean synthetic source']);
    const cleanCommit = git(repository, ['rev-parse', 'HEAD']).trim();
    const clean = await scanRepository(repository, executable);
    if (clean.status !== 'CLEAN') throw Error('Secret scanner clean fixture failed.');
    // Generated noncredential canaries exist only in the owned temporary repository.
    const historicalCanary = 'ghp_' + randomBytes(18).toString('hex');
    await writeFile(join(repository, 'source.txt'), `token=${historicalCanary}\n`); git(repository, ['add', '.']); git(repository, ['commit', '-m', 'Synthetic historical canary']);
    await writeFile(join(repository, 'source.txt'), 'Clean current synthetic source.\n'); git(repository, ['add', '.']); git(repository, ['commit', '-m', 'Remove synthetic historical canary']);
    const history = await scanRepository(repository, executable);
    if (history.history.findingCount < 1 || history.worktree.findingCount !== 0) throw Error('Secret scanner deleted-history fixture failed.');
    const historicalHead = git(repository, ['rev-parse', 'HEAD']).trim();
    git(repository, ['replace', historicalHead, cleanCommit]);
    const replaced = await scanRepository(repository, executable);
    if (replaced.history.findingCount !== history.history.findingCount) throw Error('Secret scanner replacement-history fixture failed.');
    git(repository, ['replace', '-d', historicalHead]);
    const grafts = join(repository, '.git', 'info', 'grafts'); await writeFile(grafts, historicalHead + '\n');
    let graftDenied = false; try { await scanRepository(repository, executable); } catch (error) { graftDenied = error instanceof Error && error.message.includes('graft metadata'); }
    if (!graftDenied) throw Error('Secret scanner graft-history fixture failed.');
    await rm(grafts);
    await writeFile(join(repository, '.gitattributes'), 'source.txt diff=secret\n'); git(repository, ['add', '.']); git(repository, ['commit', '-m', 'Synthetic binary attribute']);
    git(repository, ['config', 'diff.secret.binary', 'true']);
    const attributes = await scanRepository(repository, executable);
    if (attributes.history.findingCount !== history.history.findingCount) throw Error('Secret scanner binary-attribute fixture failed.');
    git(repository, ['switch', '-c', 'synthetic-merge']); await writeFile(join(repository, 'branch.txt'), 'Synthetic branch.\n'); git(repository, ['add', '.']); git(repository, ['commit', '-m', 'Synthetic branch']);
    git(repository, ['switch', 'main']); await writeFile(join(repository, 'main.txt'), 'Synthetic main.\n'); git(repository, ['add', '.']); git(repository, ['commit', '-m', 'Synthetic main']);
    git(repository, ['merge', '--no-commit', '--no-ff', 'synthetic-merge']);
    await writeFile(join(repository, 'merge.txt'), `token=${'ghp_' + randomBytes(18).toString('hex')}\n`); git(repository, ['add', '.']); git(repository, ['commit', '-m', 'Synthetic merge-only canary']);
    await writeFile(join(repository, 'merge.txt'), 'Clean current merge source.\n'); git(repository, ['add', '.']); git(repository, ['commit', '-m', 'Remove synthetic merge canary']);
    const merge = await scanRepository(repository, executable);
    if (merge.history.findingCount <= history.history.findingCount || merge.worktree.findingCount !== 0) throw Error('Secret scanner merge-only fixture failed.');
    const currentCanary = 'ghp_' + randomBytes(18).toString('hex'); await writeFile(join(repository, 'untracked.txt'), `token=${currentCanary} # gitleaks:allow\n`);
    await writeFile(join(repository, '.env.local'), `ignored=${'ghp_' + randomBytes(18).toString('hex')}\n`);
    const current = await scanRepository(repository, executable);
    if (current.worktree.findingCount !== 1) throw Error('Secret scanner authored-only current fixture failed.');
    return { check: 'secret-scanner-self-test', status: 'VERIFIED', clean: true, deletedHistory: true, replacementObjectsIgnored: true, legacyGraftsRefused: true, binaryAttributesCannotHideHistory: true, mergeOnlyHistory: true, untrackedWorktree: true, inlineWaiverIgnored: true, ignoredEnvironmentExcluded: true };
  } finally { await removeOwned(directory, parent); }
}

async function installScanner(root: string) {
  const asset = secretScanAsset(process.platform, process.arch); const parent = join(root, '.local', 'security'); await mkdir(parent, { recursive: true });
  const directory = await mkdtemp(join(parent, 'cuevo-secret-tool-'));
  try {
    const response = await fetch(`https://github.com/gitleaks/gitleaks/releases/download/v${asset.version}/${asset.filename}`, { signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw Error('Pinned secret scanner download unavailable.');
    const bytes = Buffer.from(await response.arrayBuffer());
    if (createHash('sha256').update(bytes).digest('hex') !== asset.sha256) throw Error('Pinned secret scanner checksum mismatch.');
    const archive = join(directory, asset.filename); await writeFile(archive, bytes);
    if (process.platform === 'win32') {
      execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Expand-Archive -LiteralPath $env:CUEVO_SCANNER_ARCHIVE -DestinationPath $env:CUEVO_SCANNER_DIRECTORY'], { env: { ...scannerEnvironment(), CUEVO_SCANNER_ARCHIVE: archive, CUEVO_SCANNER_DIRECTORY: directory }, stdio: 'pipe', timeout: 30000 });
    } else {
      execFileSync('tar', ['-xzf', archive, '-C', directory, asset.executable], { stdio: 'pipe', timeout: 30000 });
      await chmod(join(directory, asset.executable), 0o700);
    }
    const executable = join(directory, asset.executable);
    const version = spawnSync(executable, ['version'], { env: scannerEnvironment(), encoding: 'utf8', timeout: 10000 });
    if (version.error || version.status !== 0 || version.stdout.trim() !== asset.version) throw Error('Pinned secret scanner identity mismatch.');
    return { executable, directory, parent };
  } catch { await removeOwned(directory, parent); throw Error('Pinned secret scanner installation failed; output withheld.'); }
}

async function main() {
  const root = resolve('.'); let installed: Awaited<ReturnType<typeof installScanner>> | undefined;
  try {
    installed = await installScanner(root);
    console.log(JSON.stringify(await verifyScanner(installed.executable, installed.parent)));
    const result = await scanRepository(root, installed.executable); console.log(JSON.stringify(result));
    if (result.status !== 'CLEAN') process.exitCode = 1;
  } catch { console.error('Repository secret scan failed or is unverified; scanner output and findings withheld.'); process.exitCode = 1; }
  finally { if (installed) await removeOwned(installed.directory, installed.parent); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
