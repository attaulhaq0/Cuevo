import { createHash } from 'node:crypto';
import { brotliCompressSync, brotliDecompressSync, constants, gunzipSync } from 'node:zlib';
import { types } from 'node:util';
import { z } from 'zod';

const fail = () => Error('Prepared Edge artifact requires review; contents withheld.');
const hash = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const version = z.string().regex(/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/);
const names = z.string().regex(/^(?:@[a-z0-9-]+\/)?[a-z0-9][a-z0-9._-]*$/);
const dependencies = z.record(names, z.string().min(1).max(200));
const entrySchema = z.object({ version, resolved: z.string().url(), integrity: z.string().regex(/^sha512-[A-Za-z0-9+/]{86}==$/), dependencies: dependencies.optional(), optionalDependencies: dependencies.optional(), peerDependencies: dependencies.optional(), peerDependenciesMeta: z.record(names, z.object({ optional: z.boolean().optional() }).strict()).optional(), link: z.literal(false).optional() }).passthrough();
export function snapshotEdgePreparation(value: unknown, depth = 0): unknown {
  if (depth > 15) throw fail();
  if (value === null || ['string', 'boolean'].includes(typeof value) || typeof value === 'number' && Number.isFinite(value)) return value;
  if (!value || typeof value !== 'object' || types.isProxy(value) || !Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw fail();
  const result: Record<string, unknown> | unknown[] = Array.isArray(value) ? [] : Object.create(null);
  for (const key of Reflect.ownKeys(value)) { if (Array.isArray(value) && key === 'length') continue; const field = Object.getOwnPropertyDescriptor(value, key); if (typeof key !== 'string' || !field || !('value' in field) || !field.enumerable) throw fail(); Object.defineProperty(result, key, { value: snapshotEdgePreparation(field.value, depth + 1), enumerable: true }); }
  return result;
}
/** Project only the existing reviewed pg closure; absent optional peers stay absent. */
export function projectEdgeNpmLock(value: unknown) {
  try {
    const lock = z.object({ lockfileVersion: z.literal(3), packages: z.record(z.string(), z.unknown()) }).passthrough().parse(snapshotEdgePreparation(value));
    const selected: Record<string, z.infer<typeof entrySchema>> = {}, rows: { path: string; version: string; integrity: string; resolved: string }[] = [];
    const include = (name: string, owner = '', optional = false) => {
      names.parse(name); let path = '', parent = owner;
      while (parent) { const candidate = `${parent}/node_modules/${name}`; if (lock.packages[candidate]) { path = candidate; break; } parent = parent.includes('/') ? parent.slice(0, parent.lastIndexOf('/')) : ''; }
      path ||= `node_modules/${name}`;
      if (!lock.packages[path]) { if (optional) return; throw fail(); }
      if (selected[path]) return;
      const entry = entrySchema.parse(lock.packages[path]), url = new URL(entry.resolved);
      if (url.origin !== 'https://registry.npmjs.org' || url.username || url.password || url.search || url.hash || !url.pathname.startsWith('/' + name + '/-/') || name === 'pg' && entry.version !== '8.23.1') throw fail();
      const copy = { ...entry }; delete copy.dev; delete copy.devOptional; selected[path] = copy;
      rows.push({ path, version: entry.version, integrity: entry.integrity, resolved: entry.resolved });
      for (const child of Object.keys(entry.dependencies ?? {})) include(child, path);
      for (const child of Object.keys(entry.optionalDependencies ?? {})) include(child, path, true);
      for (const child of Object.keys(entry.peerDependencies ?? {})) if (entry.peerDependenciesMeta?.[child]?.optional !== true) include(child, path);
    };
    include('pg');
    const packageJson = { name: 'cuevo-edge-prepared', version: '0.1.0', private: true, type: 'module', dependencies: { pg: '8.23.1' } };
    const packageLock = { name: packageJson.name, version: packageJson.version, lockfileVersion: 3, requires: true, packages: { '': { name: packageJson.name, version: packageJson.version, dependencies: packageJson.dependencies }, ...Object.fromEntries(Object.entries(selected).sort(([a], [b]) => a.localeCompare(b))) } };
    return { packageJson, packageLock, dependencies: rows.sort((a, b) => a.path.localeCompare(b.path)) };
  } catch { throw fail(); }
}
// edge-runtime 1.77.1 pins eszip 45d5a22e; into_bytes emits its latest ESZIP2.3 header.
const eszipMagic = Buffer.from('ESZIP2.3'), maximumArtifactBytes = 32 * 1024 * 1024;
function rawEszip(value: Uint8Array) { const bytes = Buffer.from(value); if (bytes.length <= 8 || bytes.length > maximumArtifactBytes || !bytes.subarray(0, 8).equals(eszipMagic)) throw fail(); return bytes; }
/** Exact pinned CLI compression contract; this is preparation, never upload authority. */
export function encodePreparedEdgePayload(value: Uint8Array) {
  const raw = rawEszip(value), bytes = Buffer.concat([Buffer.from('EZBR'), brotliCompressSync(raw, { params: { [constants.BROTLI_PARAM_QUALITY]: 6 } })]);
  if (bytes.length > maximumArtifactBytes) throw fail();
  return { bytes, rawEszipSha256: hash(raw), ezbrSha256: hash(bytes), rawByteSize: raw.length, compressedByteSize: bytes.length };
}
/** Input is the HTTP transport's decoded bytes. Encoded Content-Length is not a decoded bound. */
export function readPreparedEdgeBody(value: Uint8Array, expectedValue: unknown) {
  try {
    const expected = z.object({ rawEszipSha256: digest, ezbrSha256: digest, rawByteSize: z.number().int().min(9).max(maximumArtifactBytes), maximumBytes: z.number().int().positive().max(maximumArtifactBytes) }).strict().parse(snapshotEdgePreparation(expectedValue));
    const bytes = Buffer.from(value); if (bytes.length > expected.maximumBytes) throw fail();
    let raw: Buffer = bytes;
    if (bytes.subarray(0, 4).equals(Buffer.from('EZBR'))) { if (hash(bytes) !== expected.ezbrSha256) throw fail(); const decoded = brotliDecompressSync(bytes.subarray(4), { maxOutputLength: Math.min(expected.maximumBytes, expected.rawByteSize), info: true }) as unknown as { buffer: Buffer; engine: { bytesWritten: number } }; if (decoded.engine.bytesWritten !== bytes.length - 4) throw fail(); raw = decoded.buffer; }
    rawEszip(raw); if (raw.length !== expected.rawByteSize || hash(raw) !== expected.rawEszipSha256) throw fail();
    return Buffer.from(raw);
  } catch { throw fail(); }
}
/** Bounded regular-file npm archives only; unsupported extensions never grant extraction authority. */
export function readEdgeNpmArchive(value: Uint8Array, expectedValue: unknown) {
  try {
    const expected = z.object({ integrity: z.string().regex(/^sha512-[A-Za-z0-9+/]{86}==$/), name: names, version }).strict().parse(snapshotEdgePreparation(expectedValue));
    const bytes = Buffer.from(value); if (bytes.length > 8 * 1024 * 1024 || 'sha512-' + createHash('sha512').update(bytes).digest('base64') !== expected.integrity) throw fail();
    const decoded = gunzipSync(bytes, { maxOutputLength: 16 * 1024 * 1024, info: true }) as unknown as { buffer: Buffer; engine: { bytesWritten: number } }; if (decoded.engine.bytesWritten !== bytes.length) throw fail();
    const tar = decoded.buffer, files: { path: string; bytes: Buffer; sha256: string }[] = [], seen = new Set<string>(); let ended = false, offset = 0;
    const text = (header: Buffer, begin: number, length: number) => { const field = header.subarray(begin, begin + length), end = field.indexOf(0), selected = end < 0 ? field : field.subarray(0, end); if ([...selected].some(byte => byte < 32 || byte > 126) || end >= 0 && field.subarray(end).some(byte => byte !== 0)) throw fail(); return selected.toString('ascii'); };
    const octal = (header: Buffer, begin: number, length: number) => { const field = header.subarray(begin, begin + length).toString('ascii').replace(/[\0 ]+$/g, '').trim(); if (!/^[0-7]+$/.test(field)) throw fail(); const result = Number.parseInt(field, 8); if (!Number.isSafeInteger(result)) throw fail(); return result; };
    while (offset + 512 <= tar.length) {
      const header = tar.subarray(offset, offset + 512); offset += 512;
      if (header.every(byte => byte === 0)) { if (offset + 512 > tar.length || tar.subarray(offset).some(byte => byte !== 0)) throw fail(); ended = true; break; }
      const checksum = octal(header, 148, 8); let sum = 0; for (let index = 0; index < 512; index++) sum += index >= 148 && index < 156 ? 32 : header[index]; if (checksum !== sum) throw fail();
      if (!header.subarray(257, 263).equals(Buffer.from('ustar\0')) && !header.subarray(257, 263).equals(Buffer.from('ustar '))) throw fail();
      const prefix = text(header, 345, 155), full = (prefix ? prefix + '/' : '') + text(header, 0, 100), type = header[156], size = octal(header, 124, 12);
      if (![0, 48, 53].includes(type) || text(header, 157, 100) || size > 2 * 1024 * 1024 || offset + size > tar.length) throw fail();
      const path = full.replace(/\/$/, ''); if (!path.startsWith('package/') || path.split('/').some(part => !part || part === '.' || part === '..' || !/^[A-Za-z0-9@_.+ -]+$/.test(part)) || seen.has(path)) throw fail(); seen.add(path);
      if (type === 53) { if (size) throw fail(); } else { const body = Buffer.from(tar.subarray(offset, offset + size)); files.push({ path: path.slice(8), bytes: body, sha256: hash(body) }); }
      if (files.length > 2000) throw fail(); const padding = (512 - size % 512) % 512; if (tar.subarray(offset + size, offset + size + padding).some(byte => byte !== 0)) throw fail(); offset += size + padding;
    }
    if (!ended || !files.length) throw fail(); const packageFile = files.find(row => row.path === 'package.json'); if (!packageFile) throw fail(); const pkg = JSON.parse(packageFile.bytes.toString('utf8')); if (pkg.name !== expected.name || pkg.version !== expected.version) throw fail();
    return files.sort((a, b) => a.path.localeCompare(b.path));
  } catch { throw fail(); }
}
export const edgeBundlerImage = 'public.ecr.aws/supabase/edge-runtime@sha256:645d0e45446181f3e9d87efeef637b494615f32365befff00e2d2b0fe8535fef';
const path = z.string().min(1).max(300).refine(value => !value.startsWith('/') && !value.includes('\\')&&!Array.from(value).some(character=>character.charCodeAt(0)<32||character.charCodeAt(0)===127) && value.split('/').every(part => part && part !== '.' && part !== '..'));
const sourceRow = z.object({ path, sha256: digest }).strict(), inputRow = sourceRow.extend({ byteSize: z.number().int().nonnegative().max(2 * 1024 * 1024) }).strict();
const manifestSchema = z.object({ version: z.literal(1), purpose: z.literal('CUEVO_PREPARED_EDGE_ESZIP'), schemaVersion:z.literal(2),service: z.literal('cuevo-worker'),runtime:z.literal('deno'),entrypoint:z.literal('edge/index.ts'),imports:z.array(z.literal('pg')).length(1), sourceSha: z.string().regex(/^[a-f0-9]{40}$/), treeSha: z.string().regex(/^[a-f0-9]{40}$/), runtimeVersion: z.literal('1.77.1'), platform: z.literal('linux/amd64'), baseImage: z.literal(edgeBundlerImage), preparedImageId: z.string().regex(/^sha256:[a-f0-9]{64}$/), sourceLockSha256: digest, denoLockSha256: digest, configSha256: digest, sourceGraphSha256: digest, physicalGraphSha256: digest, sources: z.array(sourceRow).min(1).max(1000),dependencies:z.array(z.object({path:path.refine(value=>value.startsWith('node_modules/')),version,integrity:z.string().regex(/^sha512-[A-Za-z0-9+/]{86}==$/)}).strict()).min(1).max(100),inputFiles:z.array(inputRow).min(5).max(20000), files: z.array(z.object({path:z.literal('worker.ezbr'),sha256:digest,byteSize:z.number().int().min(5).max(maximumArtifactBytes)}).strict()).length(1), rawEszipSha256: digest, ezbrSha256: digest, rawByteSize: z.number().int().min(9).max(maximumArtifactBytes), compressedByteSize: z.number().int().min(5).max(maximumArtifactBytes),nativeUnbundleSha256:digest,nativeUnbundleFileCount:z.number().int().positive().max(20000), cleanup: z.literal('CONFIRMED_REMOVED'), effectAuthority: z.literal(false), hostedAcceptance: z.literal(false) }).strict();
export type PreparedEdgeManifest = z.infer<typeof manifestSchema> & { manifestSha256: string };
/** Exact prepared package/source/payload facts; this receipt grants no effect authority. */
export function prepareEdgeManifest(value: unknown): PreparedEdgeManifest {
  try {
    const safe=snapshotEdgePreparation(value) as Record<string,unknown>,body=manifestSchema.parse(safe);
    for (const rows of [body.sources, body.inputFiles,body.dependencies]) if (new Set(rows.map(row => row.path)).size !== rows.length || rows.some((row, index) => index > 0 && rows[index - 1].path.localeCompare(row.path) >= 0)) throw fail();
    const packageFiles=body.inputFiles.filter(row=>row.path.startsWith('node_modules/'));
    if (hash(JSON.stringify(body.sources)) !== body.sourceGraphSha256 || hash(JSON.stringify(body.inputFiles)) !== body.physicalGraphSha256||body.files[0].sha256!==body.ezbrSha256||body.files[0].byteSize!==body.compressedByteSize||body.nativeUnbundleFileCount!==packageFiles.length||hash(JSON.stringify(packageFiles))!==body.nativeUnbundleSha256||['index.ts','deno.json','package.json','package-lock.json'].some(path=>!body.inputFiles.some(row=>row.path===path))||body.dependencies.some(dep=>!packageFiles.some(row=>row.path===dep.path+'/package.json'))||packageFiles.some(row=>!body.dependencies.some(dep=>row.path.startsWith(dep.path+'/')))||body.inputFiles.some(row=>!row.path.startsWith('node_modules/')&&!['index.ts','deno.json','package.json','package-lock.json'].includes(row.path))) throw fail();
    return { ...body, manifestSha256: hash(JSON.stringify(body)) };
  } catch { throw fail(); }
}
export function readPreparedEdgeArtifactManifest(value:unknown):PreparedEdgeManifest{
 try{const safe=snapshotEdgePreparation(value) as Record<string,unknown>;if(typeof safe.manifestSha256!=='string')throw fail();const {manifestSha256,...body}=safe,expected=prepareEdgeManifest(body);if(manifestSha256!==expected.manifestSha256)throw fail();return expected;}catch{throw fail();}
}
/** Read only the pinned runtime's regular-file tar output, and compare its
 * complete npm VFS inventory with the admitted archive-derived package bytes. */
export function readNativeEdgeBundleArchive(value:Uint8Array,expectedValue:unknown){
 try{
  const expected=z.array(inputRow).min(1).max(20000).parse(snapshotEdgePreparation(expectedValue)),tar=Buffer.from(value);if(tar.length>64*1024*1024||tar.length%512)throw fail();
  const files=new Map<string,Buffer>();let offset=0,ended=false;
  const field=(h:Buffer,start:number,size:number)=>{const bytes=h.subarray(start,start+size),end=bytes.indexOf(0),text=(end<0?bytes:bytes.subarray(0,end)).toString('ascii');if(/[^\x20-\x7e]/.test(text))throw fail();return text;};
  const number=(h:Buffer,start:number,size:number)=>{const text=h.subarray(start,start+size).toString('ascii').replace(/[\0 ]+$/g,'').trim();if(!/^[0-7]+$/.test(text))throw fail();return Number.parseInt(text,8);};
  while(offset+512<=tar.length){const h=tar.subarray(offset,offset+512);offset+=512;if(h.every(byte=>byte===0)){if(tar.length-offset<512||tar.subarray(offset).some(byte=>byte!==0))throw fail();ended=true;break;}
   const check=number(h,148,8);let sum=0;for(let i=0;i<512;i++)sum+=i>=148&&i<156?32:h[i];if(sum!==check||!h.subarray(257,263).equals(Buffer.from('ustar\0'))&&!h.subarray(257,263).equals(Buffer.from('ustar ')))throw fail();
   const prefix=field(h,345,155),original=(prefix?prefix+'/':'')+field(h,0,100),type=h[156],size=number(h,124,12),name=original.replace(/^\.\//,'').replace(/\/$/,'');if(![0,48,53].includes(type)||field(h,157,100)||size>maximumArtifactBytes||offset+size>tar.length||files.size>20000||name&&(!path.safeParse(name).success||!['worker.eszip','unbundle'].includes(name)&&!name.startsWith('unbundle/')))throw fail();
   if(type===53){if(size)throw fail();}else{if(!name||files.has(name))throw fail();files.set(name,Buffer.from(tar.subarray(offset,offset+size)));}const padding=(512-size%512)%512;if(tar.subarray(offset+size,offset+size+padding).some(byte=>byte!==0))throw fail();offset+=size+padding;
  }
  if(!ended||!files.has('worker.eszip'))throw fail();const raw=rawEszip(files.get('worker.eszip')!),actual=[...files].filter(([name])=>name.startsWith('unbundle/')&&name.includes('/node_modules/')).map(([name,bytes])=>({path:name.slice(name.indexOf('/node_modules/')+1),sha256:hash(bytes),byteSize:bytes.length})).sort((a,b)=>a.path.localeCompare(b.path));
  if(new Set(actual.map(row=>row.path)).size!==actual.length||JSON.stringify(actual)!==JSON.stringify(expected))throw fail();
  for(const name of files.keys())if(name!=='worker.eszip'&&!name.startsWith('unbundle/'))throw fail();
  return{raw,nativeUnbundleSha256:hash(JSON.stringify(actual)),nativeUnbundleFileCount:actual.length};
 }catch{throw fail();}
}
