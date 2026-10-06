import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { checkDocumentation, type DocumentationFile } from './rules';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
function fixture(): DocumentationFile[] {
  const entries = Array.from({ length: 89 }, (_, number) => { const id = String(number).padStart(2, '0'); const originalPath = `${id}-SOURCE.md`; return { id, originalPath, path: `docs/product/overview/${originalPath}`, group: 'overview', originalSha256: hash(id), sha256: hash(id) }; });
  return [
    ...['README.md', 'AGENTS.md', 'START-HERE-CODEX-PROMPT.md', 'docs/product/README.md', 'docs/product/AGENTS.md', 'docs/product/context-map.md', 'docs/product/index.md', 'docs/product/history/README.md', 'docs/product/history/source-readme.md', 'docs/product/history/source-start-here.md'].map(path => ({ path, content: '' })),
    { path: 'docs/product/registry.json', content: JSON.stringify({ sourceCount: 89, sourcePackVersion: 'FINAL-2026-10-01', entries }) },
    { path: 'docs/product/history/original-manifest.json', content: JSON.stringify({ file_count: 92, version: 'FINAL-2026-10-01', files: [...entries.map(entry => entry.originalPath), 'README.md', 'AGENTS.md', 'START-HERE-CODEX-PROMPT.md'] }) },
    ...entries.map(entry => ({ path: entry.path, content: entry.id })),
  ];
}
test('complete corpus and current context links are valid', () => { const files = fixture(); files.find(file => file.path === 'README.md')!.content = '[Context](docs/product/context-map.md)'; assert.deepEqual(checkDocumentation(files), []); });
test('root Markdown clutter, missing sources and mismatched checksums fail', () => {
  const files = fixture(); files.push({ path: '99-NEW.md', content: '' }); files.find(file => file.path.endsWith('/00-SOURCE.md'))!.content = 'changed';
  const issues = checkDocumentation(files.filter(file => !file.path.endsWith('/01-SOURCE.md'))); for (const rule of ['root-placement', 'registry-missing', 'registry-hash']) assert.ok(issues.some(issue => issue.rule === rule));
});
test('duplicate identity and escaping source paths cannot be registered', () => {
  const files = fixture(); const registry = files.find(file => file.path.endsWith('/registry.json'))!; const data = JSON.parse(registry.content); data.entries[1].id = '00'; data.entries[1].path = '../outside.md'; registry.content = JSON.stringify(data);
  const issues = checkDocumentation(files); assert.ok(issues.some(issue => issue.rule === 'registry-duplicate')); assert.ok(issues.some(issue => issue.rule === 'registry-path'));
});
test('broken active context links fail while historical report paths are retained', () => {
  const files = fixture(); files.find(file => file.path === 'README.md')!.content = '[Missing](docs/product/missing.md)'; files.push({ path: 'docs/reports/history.md', content: '[Old](../../00-SOURCE.md)' });
  const issues = checkDocumentation(files); assert.equal(issues.filter(issue => issue.rule === 'link').length, 1);
});
test('the original manifest cannot replace a source or entrypoint with a duplicate', () => {
  const files = fixture(); const manifest = files.find(file => file.path.endsWith('/original-manifest.json'))!; const data = JSON.parse(manifest.content); data.files[1] = data.files[0]; manifest.content = JSON.stringify(data);
  assert.ok(checkDocumentation(files).some(issue => issue.rule === 'manifest-history'));
});
test('historical snapshots have one home and cannot compete with current product entrypoints', () => {
  const files = fixture();
  files.push({ path: 'docs/product/source-readme.md', content: 'old copy' });
  const issues = checkDocumentation(files.filter(file => file.path !== 'docs/product/history/source-start-here.md'));
  assert.ok(issues.some(issue => issue.rule === 'history-placement'));
  assert.ok(issues.some(issue => issue.rule === 'navigation' && issue.file === 'docs/product/history/source-start-here.md'));
});
