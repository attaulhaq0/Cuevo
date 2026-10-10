import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
const hash = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
async function subject() {
  let module: Record<string, unknown> = {};
  try { module = await import('./edge-prepared-artifact'); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ERR_MODULE_NOT_FOUND') throw error; }
  assert.equal(typeof module.projectEdgeNpmLock, 'function', 'closed Edge dependency projection is required');
  return module as typeof import('./edge-prepared-artifact');
}
const locked = (name: string, version: string) => ({ version, resolved: `https://registry.npmjs.org/${name}/-/${name}-${version}.tgz`, integrity: 'sha512-' + Buffer.alloc(64, 1).toString('base64') });
function lock() { return { lockfileVersion: 3, packages: { '': {}, 'node_modules/pg': { ...locked('pg', '8.23.1'), dependencies: { 'pg-types': '^2.2.0' }, optionalDependencies: { 'pg-cloudflare': '^1.0.0' }, peerDependencies: { 'pg-native': '>=3' }, peerDependenciesMeta: { 'pg-native': { optional: true } } }, 'node_modules/pg-types': locked('pg-types', '2.2.0'), 'node_modules/pg-cloudflare': locked('pg-cloudflare', '1.2.7'), 'node_modules/foreign': locked('foreign', '1.0.0') } }; }
test('closed pg projection keeps locked required and present optional packages without foreign workspace dependencies', async () => {
  const api = await subject(), projected = api.projectEdgeNpmLock(lock());
  assert.deepEqual(projected.packageJson.dependencies, { pg: '8.23.1' });
  assert.deepEqual(Object.keys(projected.packageLock.packages), ['', 'node_modules/pg', 'node_modules/pg-cloudflare', 'node_modules/pg-types']);
  assert.equal('scripts' in projected.packageJson, false);
  assert.equal('foreign' in projected.packageJson.dependencies, false);
  assert.deepEqual(projected.dependencies.map(row => row.path), ['node_modules/pg', 'node_modules/pg-cloudflare', 'node_modules/pg-types']);
});
test('unlocked required packages, registry drift, nonexact pg and links cannot prepare a graph', async () => {
  const api = await subject();
  for (const change of [(v: { packages: Record<string, Record<string, unknown>> }) => delete v.packages['node_modules/pg-types'], (v: { packages: Record<string, Record<string, unknown>> }) => v.packages['node_modules/pg'].version = '8.23.2', (v: { packages: Record<string, Record<string, unknown>> }) => v.packages['node_modules/pg'].resolved = 'https://foreign.invalid/pg.tgz', (v: { packages: Record<string, Record<string, unknown>> }) => v.packages['node_modules/pg'].link = true, (v: { packages: Record<string, Record<string, unknown>> }) => v.packages['node_modules/pg'].integrity = 'sha512-invalid']) {
    const value = lock(); change(value); assert.throws(() => api.projectEdgeNpmLock(value));
  }
});
test('prepared payload binds pinned runtime ESZIP2.3 separately from exact EZBR quality6 bytes', async () => {
  const api = await subject(), raw = Buffer.concat([Buffer.from('ESZIP2.3'), Buffer.from('controlled-module-and-vfs')]);
  const expected = Buffer.concat([Buffer.from('EZBR'), brotliCompressSync(raw, { params: { [constants.BROTLI_PARAM_QUALITY]: 6 } })]);
  const result = api.encodePreparedEdgePayload(raw);
  assert.deepEqual(result.bytes, expected); assert.equal(result.rawEszipSha256, hash(raw)); assert.equal(result.ezbrSha256, hash(expected));
  assert.deepEqual(api.readPreparedEdgeBody(raw, { rawEszipSha256: hash(raw), rawByteSize: raw.length, ezbrSha256: hash(expected), maximumBytes: 4096 }), raw);
  assert.deepEqual(api.readPreparedEdgeBody(expected, { rawEszipSha256: hash(raw), rawByteSize: raw.length, ezbrSha256: hash(expected), maximumBytes: 4096 }), raw);
});
test('prepared output admits only the pinned ESZIP2.3 header even when other header digests match', async () => {
  const api = await subject();
  for (const header of ['ESZIP_V2', 'ESZIP2.1', 'ESZIP2.2', 'ESZIP2.4', 'ESZIP3.0', 'ESZIp2.3', 'ESZIP2.', '']) {
    const raw = Buffer.from(header + 'controlled-vfs'), ezbr = Buffer.concat([Buffer.from('EZBR'), brotliCompressSync(raw)]), expected = { rawEszipSha256: hash(raw), rawByteSize: raw.length, ezbrSha256: hash(ezbr), maximumBytes: 4096 };
    assert.throws(() => api.encodePreparedEdgePayload(raw), /requires review/);
    assert.throws(() => api.readPreparedEdgeBody(raw, expected), /requires review/);
    assert.throws(() => api.readPreparedEdgeBody(ezbr, expected), /requires review/);
  }
  for (const raw of [Buffer.alloc(0), Buffer.from('ESZIP2.'), Buffer.from('ESZIP2.3')]) assert.throws(() => api.encodePreparedEdgePayload(raw), /requires review/);
});
test('JSON, unknown magic, drift, appended bytes and decompression bombs cannot certify deployed body', async () => {
  const api = await subject(), raw = Buffer.from('ESZIP2.3controlled-vfs'), encoded = api.encodePreparedEdgePayload(raw), expected = { rawEszipSha256: hash(raw), rawByteSize: raw.length, ezbrSha256: hash(encoded.bytes), maximumBytes: 4096 };
  for (const value of [Buffer.from('{}'), Buffer.from('unknown'), Buffer.concat([raw, Buffer.from('extra')]), Buffer.concat([encoded.bytes, Buffer.from('extra')]), api.encodePreparedEdgePayload(Buffer.from('ESZIP2.3wrong')).bytes, Buffer.concat([Buffer.from('EZBR'), brotliCompressSync(Buffer.alloc(8192))])]) assert.throws(() => api.readPreparedEdgeBody(value, expected));
  for (const value of [Buffer.concat([encoded.bytes, Buffer.from('extra')]), encoded.bytes.subarray(0, encoded.bytes.length - 1), Buffer.concat([Buffer.from('EZBR'), brotliCompressSync(Buffer.alloc(8192))])]) assert.throws(() => api.readPreparedEdgeBody(value, { ...expected, ezbrSha256: hash(value) }));
  assert.throws(() => api.encodePreparedEdgePayload(Buffer.from('{}')));
  assert.throws(() => api.readPreparedEdgeBody(raw, { ...expected, maximumBytes: 8 }));
});
function archive(entries: { name: string; body: string; type?: string }[]) {
  const blocks: Buffer[] = [];
  for (const entry of entries) { const bytes = Buffer.from(entry.body), header = Buffer.alloc(512); header.write('package/' + entry.name); header.write('0000644\0', 100); header.write(bytes.length.toString(8).padStart(11, '0') + '\0', 124); header.fill(32, 148, 156); header.write(entry.type ?? '0', 156); header.write('ustar\0', 257); let checksum = 0; for (const byte of header) checksum += byte; header.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148); blocks.push(header, bytes, Buffer.alloc((512 - bytes.length % 512) % 512)); }
  return gzipSync(Buffer.concat([...blocks, Buffer.alloc(1024)]));
}
test('registry archive integrity binds every installed source byte before an immutable bundle snapshot', async () => {
  const api = await subject(), bytes = archive([{ name: 'package.json', body: '{"name":"pg","version":"8.23.1"}' }, { name: 'lib/index.js', body: 'module.exports = {};' }]), integrity = 'sha512-' + createHash('sha512').update(bytes).digest('base64');
  const files = api.readEdgeNpmArchive(bytes, { integrity, name: 'pg', version: '8.23.1' });
  assert.deepEqual(files.map(row => row.path), ['lib/index.js', 'package.json']); assert.equal(files[0].sha256, hash('module.exports = {};'));
  assert.throws(() => api.readEdgeNpmArchive(Buffer.concat([bytes, Buffer.from('changed')]), { integrity, name: 'pg', version: '8.23.1' }));
  for (const entries of [[{ name: '../escape', body: 'bad' }], [{ name: 'link', body: '', type: '2' }], [{ name: 'x', body: 'one' }, { name: 'x', body: 'two' }]]) { const bad = archive(entries); assert.throws(() => api.readEdgeNpmArchive(bad, { integrity: 'sha512-' + createHash('sha512').update(bad).digest('base64'), name: 'pg', version: '8.23.1' })); }
  for (const type of ['x', 'g', 'L', 'K', '1', '3', '4', '6']) { const bad = archive([{ name: 'unsupported', body: '', type }]); assert.throws(() => api.readEdgeNpmArchive(bad, { integrity: 'sha512-' + createHash('sha512').update(bad).digest('base64'), name: 'pg', version: '8.23.1' })); }
});
test('strict prepared manifest binds source graph/config/image and payload instead of accepting caller labels', async () => {
 const api=await subject(),{createPreparedEdgeFixture}=await import('../verification/prepared-edge-artifact.fixture'),fixture=createPreparedEdgeFixture(),{manifestSha256,...body}=fixture.manifest;assert.equal(api.prepareEdgeManifest(body).manifestSha256,manifestSha256);
 for(const changed of [{...body,platform:'linux/arm64'},{...body,physicalGraphSha256:hash('different')},{...body,secret:'canary'},{...body,cleanup:'UNKNOWN'},{...body,runtimeVersion:'latest'}])assert.throws(()=>api.prepareEdgeManifest(changed));let reads=0;assert.throws(()=>api.prepareEdgeManifest({...body,get sourceSha(){reads++;return body.sourceSha;}}));assert.equal(reads,0);
});
test('current prepared artifact binds one payload and native unbundle package inventory', async () => {
 const api = await subject(); const {createPreparedEdgeFixture} = await import('../verification/prepared-edge-artifact.fixture'); const value = createPreparedEdgeFixture();
 assert.equal(typeof (api as unknown as {readPreparedEdgeArtifactManifest?:unknown}).readPreparedEdgeArtifactManifest, 'function');
 const read = (api as unknown as {readPreparedEdgeArtifactManifest:(value:unknown)=>unknown}).readPreparedEdgeArtifactManifest;
 assert.deepEqual(read(value.manifest), value.manifest);
 for(const mutation of [(v:{files:{path:string;sha256:string;byteSize:number}[];nativeUnbundleFileCount:number;inputFiles:{sha256:string}[];baseImage:string})=>v.files.push({path:'index.ts',sha256:hash('extra'),byteSize:5}),(v:{files:{path:string;sha256:string;byteSize:number}[];nativeUnbundleFileCount:number;inputFiles:{sha256:string}[];baseImage:string})=>v.nativeUnbundleFileCount=2,(v:{files:{path:string;sha256:string;byteSize:number}[];nativeUnbundleFileCount:number;inputFiles:{sha256:string}[];baseImage:string})=>v.inputFiles[0].sha256=hash('changed'),(v:{files:{path:string;sha256:string;byteSize:number}[];nativeUnbundleFileCount:number;inputFiles:{sha256:string}[];baseImage:string})=>v.baseImage='supabase/edge-runtime:latest']){const altered=structuredClone(value.manifest);mutation(altered);assert.throws(()=>read(altered));}
});

function nativeArchive(entries:{name:string;body:Buffer}[]) {const blocks:Buffer[]=[];for(const entry of entries){const header=Buffer.alloc(512);header.write(entry.name);header.write('0000444\0',100);header.write(entry.body.length.toString(8).padStart(11,'0')+'\0',124);header.fill(32,148,156);header.write('0',156);header.write('ustar\0',257);let sum=0;for(const value of header)sum+=value;header.write(sum.toString(8).padStart(6,'0')+'\0 ',148);blocks.push(header,entry.body,Buffer.alloc((512-entry.body.length%512)%512));}return Buffer.concat([...blocks,Buffer.alloc(1024)]);}
test('native bundle archive requires every exact package byte and refuses extra or missing content',async()=>{const api=await subject(),read=(api as unknown as {readNativeEdgeBundleArchive:(bytes:Uint8Array,expected:{path:string;sha256:string;byteSize:number}[])=>{raw:Buffer;nativeUnbundleSha256:string;nativeUnbundleFileCount:number}}).readNativeEdgeBundleArchive;assert.equal(typeof read,'function');const raw=Buffer.from('ESZIP2.3actual controlled envelope'),pkg=Buffer.from('{"name":"pg","version":"8.23.1"}'),expected=[{path:'node_modules/pg/package.json',sha256:hash(pkg),byteSize:pkg.length}],valid=[{name:'worker.eszip',body:raw},{name:'unbundle/edge/node_modules/pg/package.json',body:pkg}];assert.equal(read(nativeArchive(valid),expected).nativeUnbundleFileCount,1);for(const entries of [valid.slice(0,1),[valid[0],{...valid[1],body:Buffer.from('changed')}],[...valid,{name:'unbundle/edge/node_modules/foreign/index.js',body:Buffer.from('extra')}],[...valid,valid[1]],[valid[0],{name:'../escape',body:pkg}]])assert.throws(()=>read(nativeArchive(entries),expected));});
