import {createHash} from 'node:crypto';
import {lstat,mkdir,readdir,realpath,rm,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {captureEdgeCompilerSnapshot,compileEdgeCompilerSnapshot,assertEdgeCompilerSnapshotCurrent} from './edge-compiler-snapshot';
import {prepareEdgeBundle} from './edge-bundle-preparation';
import {projectEdgeNpmLock,readPreparedEdgeArtifactManifest,readPreparedEdgeBody} from './edge-prepared-artifact';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),outputRoot=join(root,'.local/edge-artifacts'),output=join(outputRoot,'cuevo-worker'),hash=(value:Uint8Array|string)=>createHash('sha256').update(value).digest('hex');export function validateEdgeBundleOwnership(sources: string[], imports: string[]) {
  if (imports.length !== 1 || imports[0] !== 'pg') throw Error('Edge runtime must use only the reviewed external pg package.');
  if (!sources.length || sources.some(path => {
    if (path === 'packages/contracts/src/analytics.ts' || path === 'packages/config/src/synthetic-runtime.ts') return false;
    return !path.startsWith('apps/worker/src/') || path.split('/').some(segment => !segment || segment === '.' || segment === '..');
  })) throw Error('Edge bundle crossed worker implementation or exact portable boundary ownership.');
}
export function validateDenoLock(value: unknown, expected: { path: string; version: string; integrity: string }[]) {
  const lock = value as { version?: string; specifiers?: Record<string, string>; npm?: Record<string, { integrity?: string }> };
  if (!lock || lock.version !== '4' || JSON.stringify(lock.specifiers) !== JSON.stringify({ 'npm:pg@8.23.1': '8.23.1' }) || !lock.npm) throw Error('Captured Deno 2.1.4 lock and exact pg entrypoint required.');
  const actual = Object.entries(lock.npm).map(([key, entry]) => {
    const versionKey = key.split('_')[0]; const separator = versionKey.lastIndexOf('@');
    return { name: versionKey.slice(0, separator), version: versionKey.slice(separator + 1), integrity: entry.integrity };
  });
  const wanted = expected.map(entry => ({ name: entry.path.split('/node_modules/').at(-1)!.replace(/^node_modules\//, ''), version: entry.version, integrity: entry.integrity }));
  const canonical = (rows: { name: string; version: string; integrity?: string }[]) => JSON.stringify(rows.sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`)));
  if (canonical(actual) !== canonical(wanted)) throw Error('Deno dependency resolution diverges from the approved npm versions or integrity.');
}
async function initializeOutput(){for(const path of [root,dirname(outputRoot),outputRoot]){let stat;try{stat=await lstat(path);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT'||path===root)throw error;await mkdir(path);stat=await lstat(path);}if(!stat.isDirectory()||stat.isSymbolicLink()||await realpath(path)!==path)throw Error('Prepared Edge output requires review.');}}
/** The one active artifact is the immutable source-owned offline package. */
export async function buildEdgeArtifact(){
 const selected=captureEdgeCompilerSnapshot(root),compiled=await compileEdgeCompilerSnapshot(selected);validateEdgeBundleOwnership(compiled.sources.map(row=>row.path),['pg']);const npmLock=JSON.parse(compiled.sourceLock.toString()),dependencies=projectEdgeNpmLock(npmLock).dependencies;validateDenoLock(JSON.parse(compiled.denoLock.toString()),dependencies);if(dependencies.length!==14)throw Error('Reviewed complete pg closure required.');await initializeOutput();
 const prepared=await prepareEdgeBundle({sourceSha:compiled.sourceSha,treeSha:compiled.treeSha,sourceLockSha256:hash(compiled.sourceLock),denoLockSha256:hash(compiled.denoLock),sources:compiled.sources,index:Buffer.from(compiled.code),npmLock});await assertEdgeCompilerSnapshotCurrent(selected);const manifest=readPreparedEdgeArtifactManifest(prepared.manifest);if(!Buffer.from(prepared.ezbr).subarray(0,4).equals(Buffer.from('EZBR')))throw Error('Prepared Edge payload encoding required.');readPreparedEdgeBody(prepared.ezbr,{rawEszipSha256:manifest.rawEszipSha256,ezbrSha256:manifest.ezbrSha256,rawByteSize:manifest.rawByteSize,maximumBytes:32*1024*1024});if(manifest.sourceSha!==compiled.sourceSha||manifest.treeSha!==compiled.treeSha||manifest.sourceLockSha256!==hash(compiled.sourceLock)||manifest.denoLockSha256!==hash(compiled.denoLock))throw Error('Prepared Edge source changed.');
 await initializeOutput();try{const stat=await lstat(output);if(!stat.isDirectory()||stat.isSymbolicLink()||await realpath(output)!==output)throw Error('Prepared Edge output requires review.');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}await rm(output,{recursive:true,force:true});await mkdir(output);await writeFile(join(output,'worker.ezbr'),prepared.ezbr);await writeFile(join(output,'artifact.json'),JSON.stringify(manifest,null,2)+'\n');if((await readdir(output)).sort().join('|')!=='artifact.json|worker.ezbr')throw Error('Unexpected Edge artifact output.');return manifest;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){await buildEdgeArtifact();console.log('Generated the exact offline worker Edge artifact without runtime secrets.');}
