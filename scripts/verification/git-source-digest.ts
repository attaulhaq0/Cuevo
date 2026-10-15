import { spawn,execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { isAbsolute, resolve } from 'node:path';
import {readFileSync,lstatSync,realpathSync} from 'node:fs';
import {z} from 'zod';

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

const fail=()=>Error('Original canonical source partitions require review; contents withheld.');
const sha=z.string().regex(/^[a-f0-9]{40}$/);
/** Captured checkout metadata only. The closure is not serialized evidence or
 * effect authority and never reacquires the immutable source blob inventory. */
export function captureCanonicalSourceContext(rootValue:string,sourceShaValue:string,treeShaValue:string|undefined,purpose:'CURRENT_SOURCE'|'ORIGINAL_RUNTIME_METADATA'='CURRENT_SOURCE'){
 const root=resolve(rootValue),sourceSha=sha.parse(sourceShaValue),env=Object.fromEntries(['PATH','Path','SystemRoot','SYSTEMROOT','WINDIR','TEMP','TMP','LANG','LC_ALL'].filter(key=>process.env[key]!==undefined).map(key=>[key,process.env[key]!]).concat([['GIT_NO_REPLACE_OBJECTS','1'],['GIT_CONFIG_NOSYSTEM','1'],['GIT_CONFIG_GLOBAL',process.platform==='win32'?'NUL':'/dev/null']]));
 if(!['CURRENT_SOURCE','ORIGINAL_RUNTIME_METADATA'].includes(purpose))throw fail();
 const git=(args:string[],input?:string)=>execFileSync('git',['-C',root,...args],{env,input,shell:false,windowsHide:true,stdio:['pipe','pipe','ignore'],timeout:15000,maxBuffer:32*1024*1024});
 if(realpathSync(root)!==root||lstatSync(root).isSymbolicLink()||realpathSync(git(['rev-parse','--show-toplevel']).toString().trim())!==root||git(['rev-parse','--is-shallow-repository']).toString().trim()!=='false'||git(['for-each-ref','--format=%(refname)','refs/replace']).length)throw fail();
 const graft=git(['rev-parse','--git-path','info/grafts']).toString().trim();try{if(readFileSync(resolve(root,graft)).length)throw fail();}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw fail();}
 const currentSha=git(['rev-parse','HEAD']).toString().trim(),currentTree=git(['rev-parse','HEAD^{tree}']).toString().trim(),treeSha=sha.parse(git(['rev-parse',sourceSha+'^{tree}']).toString().trim());if(purpose==='CURRENT_SOURCE'&&currentSha!==sourceSha||treeShaValue!==undefined&&treeSha!==sha.parse(treeShaValue)||git(['status','--porcelain','--untracked-files=all']).length)throw fail();if(purpose==='ORIGINAL_RUNTIME_METADATA')git(['merge-base','--is-ancestor',sourceSha,currentSha]);
 const finalMetadata=()=>{if(realpathSync(root)!==root||lstatSync(root).isSymbolicLink()||git(['for-each-ref','--format=%(refname)','refs/replace']).length||git(['rev-parse','HEAD']).toString().trim()!==currentSha||git(['rev-parse','HEAD^{tree}']).toString().trim()!==currentTree||git(['rev-parse',sourceSha+'^{tree}']).toString().trim()!==treeSha||git(['status','--porcelain','--untracked-files=all']).length)throw fail();try{if(readFileSync(resolve(root,graft)).length)throw fail();}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw fail();}};
 return{root,treeSha,git,finalMetadata};
}
