import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { checkDocumentation, type DocumentationFile } from './rules';
const root = path.resolve(import.meta.dirname, '../..');
const excluded = new Set(['node_modules', '.git', '.next', 'dist', '.local', 'coverage', 'playwright-report', 'test-results', 'storybook-static', '.temp', '.branches', '.config-reference']);
async function inventory(directory: string): Promise<DocumentationFile[]> {
  const result: DocumentationFile[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (excluded.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await inventory(absolute));
    else if (/\.(?:md|json|ts|tsx|css|yml|sql)$/.test(entry.name)) result.push({ path: path.relative(root, absolute).replaceAll('\\', '/'), content: await readFile(absolute, 'utf8') });
  }
  return result;
}
const issues = checkDocumentation(await inventory(root));
if (issues.length) { for (const issue of issues) console.error(`${issue.file}: [${issue.rule}] ${issue.message}`); process.exitCode = 1; }
else console.log('Documentation checks passed: 89 unique product sources, paths/hashes, manifest history, root entrypoints and current local links.');
