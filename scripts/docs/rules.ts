import { createHash } from 'node:crypto';
import path from 'node:path';
export type DocumentationFile = { path: string; content: string };
export type DocumentationIssue = { file: string; rule: string; message: string };
const groups = new Set(['overview', 'domains', 'curriculum', 'quality', 'design', 'platform', 'verification', 'delivery', 'research']);
const rootEntries = new Set(['README.md', 'AGENTS.md', 'START-HERE-CODEX-PROMPT.md']);
const history = 'docs/product/history';
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export function checkDocumentation(input: DocumentationFile[]): DocumentationIssue[] {
  const files = new Map(input.map(file => [file.path.replaceAll('\\', '/'), file.content]));
  const issues: DocumentationIssue[] = [];
  const fail = (file: string, rule: string, message: string) => issues.push({ file, rule, message });
  for (const file of files.keys()) if (!file.includes('/') && file.endsWith('.md') && !rootEntries.has(file)) fail(file, 'root-placement', 'Product Markdown belongs in docs/product; root keeps README, AGENTS and START-HERE.');
  for (const required of ['README.md', 'AGENTS.md', 'START-HERE-CODEX-PROMPT.md', 'docs/product/README.md', 'docs/product/AGENTS.md', 'docs/product/context-map.md', 'docs/product/index.md', 'docs/product/registry.json', `${history}/README.md`, `${history}/original-manifest.json`, `${history}/source-readme.md`, `${history}/source-start-here.md`]) if (!files.has(required)) fail(required, 'navigation', 'Required product entrypoint, history or registry is missing.');
  for (const file of files.keys()) if (file.startsWith('docs/product/') && ['original-manifest.json', 'source-readme.md', 'source-start-here.md'].includes(path.posix.basename(file)) && path.posix.dirname(file) !== history) fail(file, 'history-placement', 'Original manifest and brief snapshots have one home in docs/product/history.');
  let registry: { sourceCount: number; sourcePackVersion: string; entries: { id: string; originalPath: string; path: string; group: string; originalSha256: string; sha256: string }[] } | undefined;
  try {
    registry = JSON.parse(files.get('docs/product/registry.json') ?? '') as typeof registry;
    if (!registry || !Array.isArray(registry.entries)) throw new Error();
  } catch { fail('docs/product/registry.json', 'registry', 'Registry must be valid JSON with source entries.'); }
  if (registry) {
    if (registry.sourceCount !== 89 || registry.entries.length !== 89 || registry.sourcePackVersion !== 'FINAL-2026-10-01') fail('docs/product/registry.json', 'registry-coverage', 'Original source corpus must contain all 89 numbered identities and recorded pack version.');
    const ids = new Set<string>(); const paths = new Set<string>(); const originals = new Set<string>();
    for (const entry of registry.entries) {
      if (!entry || typeof entry.id !== 'string' || typeof entry.path !== 'string' || typeof entry.originalPath !== 'string' || typeof entry.group !== 'string') { fail('docs/product/registry.json', 'registry', 'Each source needs explicit ID, path, original name and group.'); continue; }
      if (ids.has(entry.id) || paths.has(entry.path) || originals.has(entry.originalPath)) fail(entry.path, 'registry-duplicate', 'Source ID, original filename and current path must be unique.');
      ids.add(entry.id); paths.add(entry.path); originals.add(entry.originalPath);
      const normalized = path.posix.normalize(entry.path);
      if (!groups.has(entry.group) || normalized !== entry.path || !entry.path.startsWith(`docs/product/${entry.group}/`) || path.posix.basename(entry.path) !== entry.originalPath || !entry.originalPath.startsWith(entry.id + '-') || !/^\d{2}-.+\.md$/.test(entry.originalPath)) fail(entry.path, 'registry-path', 'Source path must stay in its approved product group and preserve its numbered identity.');
      const content = files.get(entry.path);
      if (content === undefined) fail(entry.path, 'registry-missing', 'Registered source file is missing.');
      else if (typeof entry.sha256 !== 'string' || digest(content) !== entry.sha256) fail(entry.path, 'registry-hash', 'Source bytes changed; review the source change and refresh its registry hash.');
      if (typeof entry.originalSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(entry.originalSha256)) fail(entry.path, 'registry-history', 'Original source checksum must be retained.');
      if (files.has(entry.originalPath)) fail(entry.originalPath, 'registry-duplicate', 'Do not keep competing source copies at the former root path.');
    }
    for (let id = 0; id < 89; id++) if (!ids.has(String(id).padStart(2, '0'))) fail('docs/product/registry.json', 'registry-coverage', `Source ID ${id} is missing.`);
    for (const file of files.keys()) if (file.startsWith('docs/product/') && /^\d{2}-.+\.md$/.test(path.posix.basename(file)) && !paths.has(file)) fail(file, 'registry-untracked', 'Every numbered product source must be registered.');
    try {
      const original = JSON.parse(files.get(`${history}/original-manifest.json`) ?? '') as { file_count: number; version: string; files: string[] };
      const numbered = Array.isArray(original.files) ? original.files.filter(file => /^\d{2}-/.test(file)) : [];
      if (original.file_count !== 92 || original.version !== registry.sourcePackVersion || !Array.isArray(original.files) || original.files.length !== 92 || new Set(original.files).size !== 92 || numbered.length !== 89 || numbered.some(file => !originals.has(file)) || [...rootEntries].some(file => !original.files.includes(file))) fail(`${history}/original-manifest.json`, 'manifest-history', 'Original manifest/version/source identities and bootstrap entries must remain intact.');
    } catch { fail(`${history}/original-manifest.json`, 'manifest-history', 'Original manifest must remain readable JSON.'); }
  }
  for (const [file, text] of files) {
    if (!file.endsWith('.md') || file.startsWith('docs/reports/') || file.startsWith('docs/superpowers/')) continue;
    // Resolve current local Markdown links; historical snapshots preserve their original paths.
    for (const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const raw = match[1].replace(/^<|>$/g, '');
      if (/^(?:https?:|mailto:|codex:|#)/.test(raw)) continue;
      const destination = raw.split('#')[0].split('?')[0];
      if (!destination) continue;
      let target: string;
      try { target = path.posix.normalize(path.posix.join(path.posix.dirname(file), decodeURIComponent(destination))); } catch { fail(file, 'link', `Malformed documentation link ${raw}.`); continue; }
      if (target.startsWith('../') || path.posix.isAbsolute(target)) { fail(file, 'link', `Local documentation link escapes repository: ${raw}.`); continue; }
      if (!files.has(target) && ![...files.keys()].some(value => value.startsWith(target.replace(/\/$/, '') + '/'))) fail(file, 'link', `Local documentation link is unresolved: ${raw}.`);
    }
  }
  return issues;
}
