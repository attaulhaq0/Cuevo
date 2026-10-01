import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { checkArchitecture, type ArchitectureFile } from './rules';
const root = path.resolve(import.meta.dirname, '../..');
const ignored = new Set(['node_modules', '.git', '.next', 'dist', '.local', 'coverage', 'playwright-report', 'test-results', 'storybook-static', '.temp', '.branches']);
async function inventory(directory: string): Promise<ArchitectureFile[]> {
  const result: ArchitectureFile[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await inventory(absolute));
    else if (/\.(?:ts|tsx|js|mjs|md|css|json)$/.test(entry.name) && !entry.name.endsWith('.tsbuildinfo')) result.push({ path: path.relative(root, absolute).replaceAll('\\', '/'), content: await readFile(absolute, 'utf8') });
  }
  return result;
}
const files = await inventory(root); const issues = checkArchitecture(files);
if (issues.length) { for (const issue of issues) console.error(`${issue.file}: [${issue.rule}] ${issue.message}`); process.exitCode = 1; }
else console.log(`Architecture checks passed: ${files.filter(file => /\.(?:ts|tsx|js|mjs)$/.test(file.path)).length} source/config files, dependency boundaries, cycles and navigation.`);
