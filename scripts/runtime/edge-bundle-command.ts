import { spawnOwnedProcess, stopOwnedProcesses } from './process';
const fail = () => Error('Prepared Edge artifact requires review; contents withheld.');
/** Fixed owner command; no inherited credentials, mutable shell, or retry. */
export async function edgeBundleCommand(args: string[], stdin?: Uint8Array): Promise<Buffer> {
  if (process.platform !== 'linux' || process.arch !== 'x64') throw fail();
  const child = spawnOwnedProcess('/usr/bin/docker', args, { env: { PATH: '/usr/bin:/bin', LANG: 'C', HOME: '/tmp', DOCKER_CONFIG: '/tmp/cuevo-edge-docker' }, stdio: ['pipe', 'pipe', 'pipe'], shell: false, windowsHide: true });
  return await new Promise((resolve, reject) => {
    const chunks: Buffer[] = []; let bytes = 0, settled = false;
    const stop = () => { if (settled) return; settled = true; clearTimeout(timer); void stopOwnedProcesses([child]).then(() => reject(fail()), () => reject(fail())); };
    const timer = setTimeout(stop, 120000);
    child.stdout?.on('data', (chunk: Buffer) => { bytes += chunk.length; if (bytes > 64 * 1024 * 1024) stop(); else chunks.push(Buffer.from(chunk)); });
    child.stderr?.on('data', (chunk: Buffer) => { bytes += chunk.length; if (bytes > 64 * 1024 * 1024) stop(); });
    child.once('error', stop); child.stdin?.once('error', stop);
    child.once('close', code => { if (settled) return; settled = true; clearTimeout(timer); if (code === 0) resolve(Buffer.concat(chunks)); else reject(fail()); });
    child.stdin?.end(stdin);
  });
}
