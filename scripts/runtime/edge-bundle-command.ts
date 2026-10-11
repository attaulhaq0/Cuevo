import { spawnOwnedProcess, stopOwnedProcesses } from './process';
import { z } from 'zod';
const fail = () => Error('Prepared Edge artifact requires review; contents withheld.');
export const edgeBundleCommandFailureSchema = z.object({
  commandKind: z.enum(['PULL','IMAGE_INSPECT','BUILD','CREATE','CONTAINER_INSPECT','START','CONTAINER_LIST','IMAGE_LIST','REMOVE_CONTAINER','REMOVE_IMAGE','OTHER']),
  outcome: z.enum(['EXIT_NONZERO','SIGNAL','TIMEOUT','OUTPUT_LIMIT','SPAWN_ERROR','STDIN_ERROR','PLATFORM_REFUSED']),
  exitCode: z.number().int().min(0).max(255).nullable(), signal: z.enum(['SIGTERM','SIGKILL','SIGINT','SIGABRT','SIGSEGV','SIGBUS','SIGILL','SIGFPE','SIGHUP','SIGPIPE','SIGQUIT','SIGUSR1','SIGUSR2','SIGTRAP','OTHER']).nullable(),
  stderrCategory: z.enum(['REGISTRY_UNAVAILABLE','REGISTRY_AUTHORIZATION','REGISTRY_RATE_LIMIT','MANIFEST_UNAVAILABLE','DAEMON_UNAVAILABLE','NETWORK_FAILURE','UNCLASSIFIED']),
  stopOutcome: z.enum(['NOT_REQUESTED','OWNER_STOP_RETURNED','UNKNOWN'])
}).strict();
export class EdgeBundleCommandError extends Error {
  readonly evidence: Readonly<z.infer<typeof edgeBundleCommandFailureSchema>>;
  constructor(value: unknown) { super('Prepared Edge artifact requires review; contents withheld.'); try { this.evidence = Object.freeze(edgeBundleCommandFailureSchema.parse(value)); } catch { throw fail(); } }
}
function commandKind(args: string[]): z.infer<typeof edgeBundleCommandFailureSchema>['commandKind'] {
  if(args[0]==='pull')return 'PULL';if(args[0]==='build')return 'BUILD';if(args[0]==='create')return 'CREATE';if(args[0]==='inspect')return 'CONTAINER_INSPECT';if(args[0]==='start')return 'START';if(args[0]==='rm')return 'REMOVE_CONTAINER';if(args[0]==='rmi')return 'REMOVE_IMAGE';if(args[0]==='image'&&args[1]==='inspect')return 'IMAGE_INSPECT';if(args[0]==='image'&&args[1]==='ls')return 'IMAGE_LIST';if(args[0]==='container'&&args[1]==='ls')return 'CONTAINER_LIST';return 'OTHER';
}
function stderrCategory(bytes: Buffer, kind:z.infer<typeof edgeBundleCommandFailureSchema>['commandKind'], complete:boolean): z.infer<typeof edgeBundleCommandFailureSchema>['stderrCategory'] {
  if(!complete)return 'UNCLASSIFIED';const text=bytes.toString('utf8'),matches:z.infer<typeof edgeBundleCommandFailureSchema>['stderrCategory'][]=[];
  if(kind==='PULL'){
    if(/(?:too many requests|toomanyrequests|status(?: code)?:? 429)/i.test(text))matches.push('REGISTRY_RATE_LIMIT');
    if(/(?:unauthorized|authentication required|access denied|pull access denied|status(?: code)?:? 40[13])/i.test(text))matches.push('REGISTRY_AUTHORIZATION');
    if(/(?:manifest unknown|manifest.*not found|no matching manifest)/i.test(text))matches.push('MANIFEST_UNAVAILABLE');
    if(/(?:unexpected HTTP status: 50[0234]|status(?: code)?:? 50[0234]|service unavailable|bad gateway|gateway timeout)/i.test(text))matches.push('REGISTRY_UNAVAILABLE');
  }
  if(/(?:cannot connect to the docker daemon|is the docker daemon running|permission denied.*docker[.]sock)/i.test(text))matches.push('DAEMON_UNAVAILABLE');
  if(/(?:TLS handshake timeout|i[/]o timeout|connection refused|network is unreachable|no such host|temporary failure in name resolution)/i.test(text))matches.push('NETWORK_FAILURE');
  return matches.length===1?matches[0]:'UNCLASSIFIED';
}
/** Fixed owner command; no inherited credentials, mutable shell, or retry. */
export async function edgeBundleCommand(args: string[], stdin?: Uint8Array): Promise<Buffer> {
  const kind=commandKind(args), evidence=(outcome:z.infer<typeof edgeBundleCommandFailureSchema>['outcome'],stopOutcome:z.infer<typeof edgeBundleCommandFailureSchema>['stopOutcome']='NOT_REQUESTED',exitCode:number|null=null,signal:z.infer<typeof edgeBundleCommandFailureSchema>['signal']=null,category:z.infer<typeof edgeBundleCommandFailureSchema>['stderrCategory']='UNCLASSIFIED')=>({commandKind:kind,outcome,exitCode,signal,stderrCategory:category,stopOutcome});
  if (process.platform !== 'linux' || process.arch !== 'x64') throw new EdgeBundleCommandError(evidence('PLATFORM_REFUSED'));
  let child: ReturnType<typeof spawnOwnedProcess>;
  try { child = spawnOwnedProcess('/usr/bin/docker', args, { env: { PATH: '/usr/bin:/bin', LANG: 'C', HOME: '/tmp', DOCKER_CONFIG: '/tmp/cuevo-edge-docker' }, stdio: ['pipe', 'pipe', 'pipe'], shell: false, windowsHide: true }); } catch { throw new EdgeBundleCommandError(evidence('SPAWN_ERROR')); }
  return await new Promise((resolve, reject) => {
    const chunks: Buffer[] = [], errors: Buffer[]=[]; let bytes = 0, errorBytes=0, stderrComplete=true, settled = false;
    const stop = (outcome:z.infer<typeof edgeBundleCommandFailureSchema>['outcome']) => { if (settled) return; settled = true; clearTimeout(timer); const category=stderrCategory(Buffer.concat(errors),kind,stderrComplete); errors.length=0; void stopOwnedProcesses([child]).then(() => reject(new EdgeBundleCommandError(evidence(outcome,'OWNER_STOP_RETURNED',null,null,category))), () => reject(new EdgeBundleCommandError(evidence(outcome,'UNKNOWN',null,null,category)))); };
    const timer = setTimeout(()=>stop('TIMEOUT'), 120000);
    child.stdout?.on('data', (chunk: Buffer) => { if(settled)return; bytes += chunk.length; if (bytes > 64 * 1024 * 1024) stop('OUTPUT_LIMIT'); else chunks.push(Buffer.from(chunk)); });
    child.stderr?.on('data', (chunk: Buffer) => { if(settled)return; bytes += chunk.length; if(chunk.length>65536-errorBytes)stderrComplete=false;const retained=chunk.subarray(0,Math.max(0,65536-errorBytes));if(retained.length){errors.push(Buffer.from(retained));errorBytes+=retained.length;}if (bytes > 64 * 1024 * 1024) stop('OUTPUT_LIMIT'); });
    child.once('error', ()=>stop('SPAWN_ERROR')); child.stdin?.once('error', ()=>stop('STDIN_ERROR'));
    child.once('close', (code,signal) => { if (settled) return; settled = true; clearTimeout(timer); const category=stderrCategory(Buffer.concat(errors),kind,stderrComplete);errors.length=0;if (code === 0 && signal===null) resolve(Buffer.concat(chunks)); else {const selected=typeof signal==='string'?edgeBundleCommandFailureSchema.shape.signal.safeParse(signal):null;reject(new EdgeBundleCommandError(evidence(selected!==null?'SIGNAL':'EXIT_NONZERO','NOT_REQUESTED',Number.isInteger(code)&&code!==null&&code>=0&&code<=255?code:null,selected===null?null:selected.success?selected.data:'OTHER',category)));} });
    try { child.stdin?.end(stdin); } catch { stop('STDIN_ERROR'); }
  });
}
