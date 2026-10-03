import { readFile } from 'node:fs/promises';
import { validateWorkflows } from './cicd-contracts';
const issues = validateWorkflows(await readFile('.github/workflows/ci.yml', 'utf8'), await readFile('.github/workflows/release.yml', 'utf8'));
if (issues.length) throw Error(issues.join('\n'));
console.log('CI/CD workflow trust and artifact contracts passed.');
