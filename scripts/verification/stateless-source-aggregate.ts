import {createHash}from'node:crypto';
import {lstat,mkdir,readFile,readdir,realpath,writeFile,rename}from'node:fs/promises';
import {join,resolve}from'node:path';
import {randomUUID}from'node:crypto';
import {readCiPartitionCoverage}from'./ci-partition-coverage';
import {combineStatelessPartitions,readStatelessPartitionIdentity,runStatelessAggregateChecks,validateStatelessPartition,requireStatelessPhysical,type StatelessPartitionReceipt}from'./stateless-checks';
import {canonicalReleaseExecutionJson,parseReleaseExecutionJson}from'./release-review';

const root=resolve('.'),directory=join(root,'.local/verification/source-contracts'),controller=new AbortController(),fail=()=>Error('Complete source partition aggregation requires review; contents withheld.');
process.once('SIGTERM',()=>controller.abort());process.once('SIGINT',()=>controller.abort());
await mkdir(directory,{recursive:true,mode:0o700});
await requireStatelessPhysical(root,directory,'directory');
const persist=async(value:unknown)=>{await requireStatelessPhysical(root,directory,'directory');const bytes=canonicalReleaseExecutionJson(value);if(Buffer.byteLength(bytes)>1024*1024)throw fail();const path=join(directory,'result.'+randomUUID()+'.tmp');await writeFile(path,bytes,{flag:'wx',mode:0o600});await rename(path,join(directory,'result.json'));};
await persist({version:1,purpose:'CUEVO_PARTITIONED_SOURCE_CONTRACTS',status:'NOT_VERIFIED'});
try{
 const identity=await readStatelessPartitionIdentity(root,'source-contracts'),coverage=readCiPartitionCoverage(root),input=join(root,'.local/source-partition-inputs'),ids=['source-native','source-contracts','source-delivery'];if(JSON.stringify((await readdir(input)).sort())!==JSON.stringify([...ids].sort()))throw fail();
 const receipts:StatelessPartitionReceipt[]=[];
 for(const id of ids){const folder=join(input,id),path=join(folder,'result.json');await requireStatelessPhysical(root,path,'file');const before=await lstat(path);if(before.isSymbolicLink()||!before.isFile()||before.nlink!==1||before.size>1024*1024||await realpath(path)!==path||JSON.stringify(await readdir(folder))!==JSON.stringify(['result.json']))throw fail();const bytes=await readFile(path),after=await lstat(path);if(before.dev!==after.dev||before.ino!==after.ino||before.size!==after.size||before.mtimeMs!==after.mtimeMs||before.ctimeMs!==after.ctimeMs)throw fail();const receipt=parseReleaseExecutionJson(bytes.toString('utf8'))as StatelessPartitionReceipt;if(canonicalReleaseExecutionJson(receipt)!==bytes.toString('utf8'))throw fail();
  const validated=validateStatelessPartition(receipt,identity,coverage);for(const row of validated.files){const source=join(root,row.path),stat=await lstat(source);if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||await realpath(source)!==source)throw fail();const bytes=await readFile(source),after=await lstat(source);if(stat.dev!==after.dev||stat.ino!==after.ino||stat.size!==after.size||stat.mtimeMs!==after.mtimeMs||stat.ctimeMs!==after.ctimeMs||createHash('sha256').update(bytes).digest('hex')!==row.sha256)throw fail();}receipts.push(validated);
 }
 const checks=await runStatelessAggregateChecks(root,controller.signal),summary=combineStatelessPartitions(receipts,identity,coverage,checks);if(canonicalReleaseExecutionJson(await readStatelessPartitionIdentity(root,'source-contracts'))!==canonicalReleaseExecutionJson(identity)||controller.signal.aborted)throw fail();await persist(summary);console.log('All exact source partitions and non-test checks passed; hosted acceptance remains separate.');
}catch{await persist({version:1,purpose:'CUEVO_PARTITIONED_SOURCE_CONTRACTS',status:'FAILED',reason:controller.signal.aborted?'CANCELLED':'INPUT_OR_PRODUCER_REQUIRES_REVIEW'});process.exitCode=1;}
