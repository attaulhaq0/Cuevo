import test from 'node:test';
import assert from 'node:assert/strict';
import { startFailureDiagnostic } from './start-local-diagnostic';

const stderr = Buffer.from('Initialising schema...\nERROR: private-canary https://private.invalid (SQLSTATE 42501)\nerror running container: exit 7\n');
test('already captured start failure preserves finite native facts and unknown cause without private output',()=>{
 const value=startFailureDiagnostic(Object.assign(new Error('private-message-canary'),{status:7,signal:null,code:'UNKNOWN_PRIVATE_CODE',stderr,stdout:'private-stdout-canary',output:['private-output-canary']}),'CLI_START_FAILURE');
 assert.equal(value.stage,'CLI_START_FAILURE');assert.deepEqual(value.outcome,{exitCode:7,signal:null,code:'OTHER'});assert.equal(value.phase,'INITIALIZING_SCHEMA');assert.equal(value.cause,'UNKNOWN');assert.equal(value.capture.terminalExitMatched,true);assert.equal(value.stderr.availability,'AVAILABLE');assert.deepEqual(value.observedCodes,[{code:'42501',label:'PERMISSION_DENIED',format:'SQLSTATE_SUFFIX',phase:'INITIALIZING_SCHEMA'}]);assert.equal(JSON.stringify(value).includes('private'),false);
});
test('native stderr string and safe Buffer views share the existing bounded parser',()=>{
 const string=startFailureDiagnostic({status:7,stderr:stderr.toString()},'CLI_START_FAILURE');const buffer=startFailureDiagnostic({status:7,stderr},'CLI_START_FAILURE');assert.deepEqual(string,buffer);
 let getters=0;const hostile=Buffer.from(stderr);for(const name of ['buffer','byteOffset','byteLength','length','indexOf','subarray'])Object.defineProperty(hostile,name,{get(){getters++;throw Error('private getter');}});assert.deepEqual(startFailureDiagnostic({status:7,stderr:hostile},'CLI_START_FAILURE'),buffer);assert.equal(getters,0);
});
test('missing invalid noncanonical and incomplete stderr remains unavailable or incomplete without invented cause',()=>{
 for(const error of [null,undefined,'private',{},new Error('private'),{stderr:null}]){const d=startFailureDiagnostic(error,'CLI_START_FAILURE');assert.equal(d.stderr.availability,'UNAVAILABLE');assert.equal(d.cause,'UNKNOWN');assert.deepEqual(d.observedCodes,[]);}
 for(const input of [new Uint8Array([1]),{private:'secret'},42,true]){const d=startFailureDiagnostic({stderr:input},'CLI_START_FAILURE');assert.equal(d.stderr.availability,'INVALID');assert.equal(d.capture.diagnosticTruncated,true);}
 const empty=startFailureDiagnostic({stderr:''},'CLI_START_FAILURE');assert.equal(empty.stderr.availability,'AVAILABLE');assert.equal(empty.capture.stderrObserved,false);
 const bad=startFailureDiagnostic({stderr:Buffer.from([0xff,10])},'CLI_START_FAILURE');assert.equal(bad.capture.invalidUtf8,true);assert.deepEqual(bad.observedCodes,[]);
 const unfinished=startFailureDiagnostic({stderr:'Initialising schema...\nSQLSTATE: 42501'},'CLI_START_FAILURE');assert.equal(unfinished.capture.incompleteLine,true);assert.deepEqual(unfinished.observedCodes,[]);
});
test('captured byte and native line limits preserve finite observations without new process limits',()=>{
 for(const value of ['x'.repeat(10*1024*1024+1),Buffer.alloc(10*1024*1024+1,120)]){const d=startFailureDiagnostic({stderr:value},'CLI_START_FAILURE');assert.equal(d.stderr.availability,'INVALID');assert.equal(d.capture.diagnosticTruncated,true);assert.equal(d.capture.stderrObserved,false);}
 const d=startFailureDiagnostic({stderr:'Initialising schema...\n'+ 'private'.repeat(2000)+' (SQLSTATE 42501)\nSQLSTATE: 28P01\nSQLSTATE: 3D000\nSQLSTATE: 42P01\nSQLSTATE: 42883\nSQLSTATE: 53300\n'},'CLI_START_FAILURE');assert.equal(d.capture.lineTruncated,true);assert.equal(d.capture.diagnosticTruncated,true);assert.equal(d.observedCodes.length,4);assert.equal(JSON.stringify(d).includes('private'),false);
});
test('own accessor and proxy failure details are never invoked or exposed',()=>{
 let touched=0;const error={};for(const key of ['status','signal','code','stderr','stdout','output','message','stack'])Object.defineProperty(error,key,{get(){touched++;throw Error('private getter');}});const accessor=startFailureDiagnostic(error,'CLI_START_FAILURE');assert.equal(touched,0);assert.equal(accessor.outcome.exitCode,null);assert.equal(accessor.stderr.availability,'UNAVAILABLE');
 const proxy=new Proxy({}, {getOwnPropertyDescriptor(){touched++;throw Error('private trap')},get(){touched++;throw Error('private trap')},getPrototypeOf(){touched++;throw Error('private trap')}});assert.deepEqual(startFailureDiagnostic(proxy,'CLI_START_FAILURE'),accessor);assert.equal(touched,0);
 const nested=new Proxy(stderr,{get(){touched++;throw Error('private nested trap')},getPrototypeOf(){touched++;throw Error('private nested trap')}});assert.equal(startFailureDiagnostic({stderr:nested},'CLI_START_FAILURE').stderr.availability,'INVALID');assert.equal(touched,0);
 const revoked=Proxy.revocable({},{});revoked.revoke();assert.deepEqual(startFailureDiagnostic(revoked.proxy,'CLI_START_FAILURE'),accessor);assert.equal(touched,0);
});
test('finite native exit signal and spawn or output-limit categories never infer SQL cause',()=>{
 for(const [signal,expected] of [['SIGINT','SIGINT'],['SIGTERM','SIGTERM'],['SIGKILL','SIGKILL'],['private-signal','OTHER']] as const)assert.equal(startFailureDiagnostic({signal},'CLI_START_FAILURE').outcome.signal,expected);
 for(const code of ['ENOENT','EACCES','EPERM','ENOBUFS','ERR_CHILD_PROCESS_STDIO_MAXBUFFER'] as const)assert.equal(startFailureDiagnostic({code},'CLI_START_FAILURE').outcome.code,code);
 for(const status of [-1,256,NaN,Infinity,'7',null,undefined])assert.equal(startFailureDiagnostic({status},'CLI_START_FAILURE').outcome.exitCode,null);
 const signal=startFailureDiagnostic({status:null,signal:'SIGTERM',stderr:'unknown private output\n'},'CLI_START_FAILURE');assert.equal(signal.cause,'UNKNOWN');assert.deepEqual(signal.observedCodes,[]);
});
test('pre-dispatch and post-start log-write failures cannot borrow process stderr or exit',()=>{
 for(const stage of ['BEFORE_START_GUARD','POST_START_LOG_WRITE_FAILURE','POST_START_CONFIRMATION_FAILURE'] as const){const d=startFailureDiagnostic({status:7,signal:'SIGKILL',code:'ENOENT',stderr},stage);assert.equal(d.stage,stage);assert.deepEqual(d.outcome,{exitCode:null,signal:null,code:null});assert.equal(d.stderr.availability,'NOT_APPLICABLE');assert.equal(d.capture.stderrObserved,false);assert.deepEqual(d.observedCodes,[]);assert.equal(d.phase,'UNKNOWN');assert.equal(d.cause,'UNKNOWN');}
});
