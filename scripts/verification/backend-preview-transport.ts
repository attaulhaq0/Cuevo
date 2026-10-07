import { createProtectedPreview, protectedPreviewHeaders, type ProtectedPreviewBinding } from './protected-preview';
import type { BackendReleaseExpected, PreparedBackendReleaseIntent } from './backend-release-contracts';
import { z } from 'zod';

type Context={repoRoot:string;expected:BackendReleaseExpected;prepared:PreparedBackendReleaseIntent;apiDeployment:{id:string;url:string}};
const fail=()=>Error('Current backend preview transport requires review; private contents withheld.');
function binding(input:Context):ProtectedPreviewBinding{
 const api=new URL(input.apiDeployment.url);
 if(api.protocol!=='https:'||api.origin!==input.apiDeployment.url||api.username||api.password||api.port||api.pathname!=='/'||api.search||api.hash||api.origin===input.expected.targets.api.origin)throw fail();
 return{owner:'api',repository:input.expected.repository,releaseSha:input.expected.releaseSha,treeSha:input.expected.treeSha,runId:input.expected.releaseRunId,runAttempt:input.expected.runAttempt,packageSha256:input.prepared.sha256,artifactSha256:input.expected.fingerprints.apiArtifactSha256,teamId:input.expected.targets.api.teamId,projectId:input.expected.targets.api.projectId,deploymentId:input.apiDeployment.id,origin:api.origin};
}
/** Release-only transport through the Vercel gateway. Application scope and
 * the original protected package remain with the existing backend consumers. */
export async function createBackendPreviewTransport(input:Context&{vercelToken:string},admit:()=>Promise<void>){
 const expires=z.object({expiresAt:z.iso.datetime({offset:true})}).parse(JSON.parse(input.prepared.canonicalJson)).expiresAt;
 const receipt=await createProtectedPreview({repoRoot:input.repoRoot,binding:binding(input),vercelToken:input.vercelToken,approvalExpiresAt:expires},{admit});
 if(!['CONFIRMED','NONE'].includes(receipt.status))throw fail();return receipt;
}
export async function backendPreviewHeaders(input:Context&{url:string}):Promise<Record<string,string>>{
 const current=binding(input),url=new URL(input.url);
 if(url.origin!==current.origin)return{};
 return protectedPreviewHeaders({repoRoot:input.repoRoot,binding:current,url:input.url});
}
