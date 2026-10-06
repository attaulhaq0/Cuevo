import { createHash } from 'node:crypto';
import path from 'node:path';

export interface RepositoryFile { path: string; content?: string | Uint8Array }
export interface RepositoryInventory { files: RepositoryFile[]; directories: string[]; trackedPaths: string[] }
export interface RepositoryIssue { file: string; rule: string; message: string }

const roots = new Set(['apps', 'packages', 'docs', 'scripts', 'supabase', 'tests', 'docker', '.github']);
const generatedDirectories = new Set(['node_modules', '.git', '.next', 'dist', 'coverage', 'playwright-report', 'test-results', 'storybook-static', '.local', '__pycache__']);
const sourceContainers = new Map([
  ['apps', new Set(['api', 'web', 'worker'])],
  ['packages', new Set(['config', 'contracts', 'domain', 'ui'])],
  ['apps/api/src', new Set(['modules', 'platform'])],
  ['apps/web', new Set(['app', 'features', 'shared', 'public', '.storybook'])],
  ['apps/worker/src', new Set(['jobs', 'platform'])],
]);

function relativePath(value: string): string | undefined {
  const normalized = value.replaceAll('\\', '/').replace(/\/$/, '');
  if (!normalized || normalized.startsWith('/') || /^[a-z]:/i.test(normalized) || normalized.split('/').some(part => !part || part === '.' || part === '..')) return undefined;
  return normalized;
}

/** Filename-only check: credentials are never needed as input to this guard. */
export function isSecretPath(value: string): boolean {
  const name = path.posix.basename(value);
  if (/^\.env(?:\..*)?$/.test(name)) return !/(?:^|\.)example$/.test(name);
  const credentialData = !path.posix.extname(name) || /\.(?:json|ya?ml|toml|txt|ini|conf|csv)$/i.test(name);
  return name === '.npmrc' || (credentialData && (value.split('/').some(part => /^(?:credentials?|secrets?)$/i.test(part))
    || /^(?:credentials?|secrets?|synthetic-accounts)(?:[.-].*)?$/i.test(name)))
    || /\.(?:pem|key|p12|pfx|jks|keystore)$/i.test(name)
    || /^id_(?:rsa|ed25519|ecdsa|dsa)(?:\.pub)?$/.test(name);
}

/** Applied to tracked names before ignoring output during authored inventory. */
export function isGeneratedPath(value: string): boolean {
  const parts = value.replaceAll('\\', '/').split('/');
  return parts.some(part => generatedDirectories.has(part))
    || /^supabase\/(?:\.temp|\.branches|\.config-reference)(?:\/|$)/.test(value)
    || /(?:\.log|\.tsbuildinfo|\.pyc|\.map)$/.test(value)
    || /(?:^|\/)(?:next-env\.d\.ts|Thumbs\.db|\.DS_Store)$/.test(value);
}

function runtimeSource(value: string): boolean {
  if (/(?:^|\/)(?:test|tests|__tests__|\.storybook)(?:\/|$)/.test(value) || /\.(?:test|spec|stories)\.[^.]+$/.test(value)) return false;
  if (/\.d\.ts$/.test(value)) return false;
  return /^(?:apps\/(?:api|worker)\/src\/|apps\/web\/(?:features|shared|app)\/|packages\/[^/]+\/src\/)/.test(value)
    && /\.(?:ts|tsx|js|jsx|mjs|cjs|css)$/.test(value);
}

function comparisonGroup(value: string): string | undefined {
  if (runtimeSource(value)) return 'runtime';
  if (/^supabase\/migrations\/[^/]+\.sql$/.test(value)) return 'migration';
  if (/^docs\/product\/(?!history\/).+\/\d{2}-[^/]+\.md$/.test(value)) return 'product';
  return undefined;
}

function forwardingSurface(content: string): boolean {
  const body = content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').trim();
  if (!body || /^export\s*\{\s*\}\s*;?$/.test(body)) return true;
  // Only pure re-exports are exempt; an implementation inside model/ui/index is still checked.
  let cursor = 0;
  const whitespace = () => { while (cursor < body.length && /\s/.test(body[cursor])) cursor++; };
  const token = (value: string, spaced = false) => {
    if (!body.startsWith(value, cursor)) return false;
    cursor += value.length;
    if (spaced && !/\s/.test(body[cursor] ?? '')) return false;
    whitespace(); return true;
  };
  while (cursor < body.length) {
    if (!token('export', true)) return false;
    if (body.startsWith('type', cursor) && !token('type', true)) return false;
    if (body[cursor] === '*') cursor++;
    else if (body[cursor] === '{') {
      const close = body.indexOf('}', cursor + 1);
      if (close < 0) return false;
      cursor = close + 1;
    } else return false;
    if (!/\s/.test(body[cursor] ?? '')) return false;
    whitespace();
    if (!token('from', true)) return false;
    const quote = body[cursor++];
    if (quote !== "'" && quote !== '"') return false;
    const start = cursor;
    while (cursor < body.length && body[cursor] !== quote) {
      if (body[cursor] === '\n' || body[cursor] === '\r' || body[cursor] === "'" || body[cursor] === '"') return false;
      cursor++;
    }
    if (cursor === start || cursor === body.length) return false;
    cursor++; whitespace();
    if (body[cursor] === ';') { cursor++; whitespace(); }
  }
  return true;
}

function frameworkBoilerplate(value: string, content: string): boolean {
  if (!value.startsWith('apps/web/app/') || !/\/(?:page|layout|loading|error|not-found|global-error|template|default)\.[cm]?[jt]sx?$/.test(value)) return false;
  // Exempt the structurally empty scaffold only, not route handlers or substantial page logic.
  return /^(?:['"]use client['"]\s*;?\s*)?export\s+default\s+function\s+\w+\s*\([^)]*\)\s*\{\s*return\s+(?:null|<>\s*<\/>)\s*;?\s*\}\s*$/.test(content);
}

export function checkRepository(inventory: RepositoryInventory): RepositoryIssue[] {
  const issues: RepositoryIssue[] = [];
  const seenIssues = new Set<string>();
  const fail = (file: string, rule: string, message: string) => {
    const key = `${rule}:${file}`;
    if (!seenIssues.has(key)) { issues.push({ file, rule, message }); seenIssues.add(key); }
  };
  const validate = (value: string) => {
    const normalized = relativePath(value);
    if (!normalized) fail(value, 'inventory-path', 'Inventory entry must be a repository-relative path without traversal.');
    return normalized;
  };
  const tracked = new Set(inventory.trackedPaths.map(validate).filter((value): value is string => value !== undefined));
  for (const value of tracked) {
    if (isGeneratedPath(value)) fail(value, 'tracked-generated', 'Generated/local output must not be tracked; remove it from the index and keep the appropriate output ignored.');
    if (isSecretPath(value)) fail(value, 'tracked-secret', 'Credential filename must not be tracked; the guard checks its path only and does not read its contents.');
  }
  const files = new Map<string, RepositoryFile>();
  for (const file of inventory.files) {
    const value = validate(file.path);
    if (value && !isGeneratedPath(value)) files.set(value, { ...file, path: value });
  }
  const directories = new Set(inventory.directories.map(validate).filter((value): value is string => value !== undefined && !isGeneratedPath(value)));
  for (const value of files.keys()) {
    let parent = path.posix.dirname(value);
    while (parent !== '.') { directories.add(parent); parent = path.posix.dirname(parent); }
    if (isSecretPath(value) && !tracked.has(value)) fail(value, 'unignored-secret', 'Credential filename must be ignored; its contents are not read.');
  }
  for (const directory of [...directories].sort()) {
    const top = directory.split('/')[0];
    if (!roots.has(top)) fail(top, 'unowned-root', 'Top-level directory requires documented repository ownership and an updated convention.');
    for (const [parent, allowed] of sourceContainers) {
      if (path.posix.dirname(directory) === parent && !allowed.has(path.posix.basename(directory))) fail(directory, 'source-layout', 'Source directories must use the documented application/feature/platform owners.');
    }
    if (/^(?:apps\/[^/]+\/(?:src\/)?|packages\/[^/]+\/src\/)/.test(directory) && /(?:^|\/)(?:[^/]+(?:-copy|-backup|-old)|(?:copy|backup)-[^/]+)$/.test(directory)) {
      fail(directory, 'source-layout', 'Copied or obsolete source containers must not form a parallel implementation tree.');
    }
    const prefix = `${directory}/`;
    const childDirectory = [...directories].some(value => value.startsWith(prefix));
    const authoredFile = [...files.keys()].some(value => value.startsWith(prefix));
    if (!childDirectory && !authoredFile) fail(directory, 'empty-directory', 'Empty authored leaf directory has no current owner content; remove the unused directory rather than add a placeholder.');
  }
  const groups = new Map<string, string[]>();
  for (const [value, file] of files) {
    const group = comparisonGroup(value);
    if (!group || file.content === undefined || isSecretPath(value)) continue;
    const content = typeof file.content === 'string' ? file.content : Buffer.from(file.content).toString('utf8');
    const normalized = content.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
    if (group === 'runtime' && (forwardingSurface(normalized) || frameworkBoilerplate(value, normalized))) continue;
    const key = `${group}:${createHash('sha256').update(normalized).digest('hex')}`;
    const paths = groups.get(key) ?? [];
    paths.push(value); groups.set(key, paths);
  }
  for (const paths of groups.values()) if (paths.length > 1) {
    const sorted = paths.sort();
    fail(sorted[0], 'duplicate-source', `Duplicate authored source after BOM/line-ending/surrounding-whitespace normalization: ${sorted.join(', ')}. Preserve authoritative history and resolve the ownership conflict explicitly.`);
  }
  return issues;
}
