import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { isAbsolute, resolve } from 'node:path';

const failure = () => Error('Exact streamed Git source evidence requires review; contents withheld.');
const maximumBytes = 512 * 1024 * 1024;
function sourceEnvironment() {
  return Object.fromEntries(['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'LANG', 'LC_ALL'].filter(key => process.env[key] !== undefined)
    .map(key => [key, process.env[key]!]).concat([['GIT_NO_REPLACE_OBJECTS', '1'], ['GIT_CONFIG_NOSYSTEM', '1'], ['GIT_CONFIG_GLOBAL', process.platform === 'win32' ? 'NUL' : '/dev/null']]));
}

/** Hash every binary diff byte without retaining the source patch in memory.
 * The existing caller still owns source/root/history/approval admission. */
export async function readGitBinaryDiffDigest(input: { repoRoot: string; baseSha: string; sourceSha: string }): Promise<{ sha256: string; bytes: number }> {
  if (!isAbsolute(input.repoRoot) || resolve(input.repoRoot) !== input.repoRoot || !/^[a-f0-9]{40}$/.test(input.baseSha) || !/^[a-f0-9]{40}$/.test(input.sourceSha)) throw failure();
  return new Promise((done, reject) => {
    const child = spawn('git', ['-C', input.repoRoot, 'diff', '--no-ext-diff', '--no-textconv', '--binary', input.baseSha, input.sourceSha, '--'],
      { env: sourceEnvironment(), shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    const digest = createHash('sha256'); let bytes = 0, failed = false;
    let termination: ReturnType<typeof setTimeout> | undefined;
    const stop = () => { if (failed) return; failed = true; child.kill(); termination = setTimeout(() => { child.kill('SIGKILL'); reject(failure()); }, 2000); };
    const timer = setTimeout(stop, 120000);
    child.stdout.on('data', (part: Buffer) => { bytes += part.length; if (bytes > maximumBytes) stop(); else if (!failed) digest.update(part); });
    child.stdout.on('error', stop);
    child.on('error', () => { clearTimeout(timer); if (termination) clearTimeout(termination); reject(failure()); });
    child.on('close', code => { clearTimeout(timer); if (termination) clearTimeout(termination); if (failed || code !== 0) reject(failure()); else done({ sha256: digest.digest('hex'), bytes }); });
  });
}
