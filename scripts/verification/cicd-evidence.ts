import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { safeEvidence } from './cicd-contracts';
import { verificationEvidence } from './verification-profiles';
const root = resolve('.local/verification'); const output = resolve('.local/cicd-safe');
await mkdir(output, { recursive: true });
const directories = await readdir(root, { withFileTypes: true }).catch(() => []);
const latest = directories.filter(entry => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}T/.test(entry.name)).map(entry => entry.name).sort().at(-1);
const identity = { sha: process.env.GITHUB_SHA ?? '', runId: process.env.GITHUB_RUN_ID ?? '' };
const evidence = latest ? JSON.parse(await readFile(resolve(root, latest, 'evidence.json'), 'utf8')) : { status: 'NOT_VERIFIED', rows: [] };
const sources = latest ? JSON.parse(await readFile(resolve(root, latest, 'source.json'), 'utf8')) : [];
const full = evidence.profile === undefined;
const summary = full ? safeEvidence(evidence, sources, identity) : { commitSha: identity.sha, runId: identity.runId,
  ...verificationEvidence(evidence.profile, evidence.rows), sourceFileCount: sources.length };
await writeFile(resolve(output, 'summary.json'), JSON.stringify(summary, null, 2));
console.log('Exported only safe CI identity, source count and step status/timing.');
