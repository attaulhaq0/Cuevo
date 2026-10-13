import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { createResetDiagnosticParser, runPrefixResetCommand } from './reset-local-diagnostic';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

test('bounded initializer stderr records only fixed native observations and never claims the cause',()=>{
 const p=createResetDiagnosticParser();p.push(Buffer.from('Initialising schema...\nERROR: private-password https://secret.invalid (SQLSTATE 42501)\nerror running container: exit 1\n'));
 const f=p.finish(1);assert.equal(f.phase,'INITIALIZING_SCHEMA');assert.deepEqual(f.observedCodes,[{code:'42501',label:'PERMISSION_DENIED',format:'SQLSTATE_SUFFIX',phase:'INITIALIZING_SCHEMA'}]);assert.equal(f.capture.terminalExitMatched,true);assert.equal(JSON.stringify(f).includes('private-password'),false);assert.equal(JSON.stringify(f).includes('secret.invalid'),false);assert.equal(f.cause,'UNKNOWN');
});
test('line chunks UTF8 limits and unknown output stay bounded without native secrets',()=>{
 const p=createResetDiagnosticParser();for(const part of ['Initialising sch','ema...\n** (Postgrex.Error) ERROR 28P01 (invalid_password) sec','ret\n'])p.push(Buffer.from(part));
 p.push(Buffer.alloc(8193,65));p.push(Buffer.from('\n'));p.push(Buffer.from([0xff,10]));p.push(Buffer.from('SQLSTATE: 3D000\nSQLSTATE: 42P01\nSQLSTATE: 42883\nSQLSTATE: 53200\nnot completed secret'));
 const f=p.finish(1);assert.equal(f.observedCodes.length,4);assert.equal(f.capture.lineTruncated,true);assert.equal(f.capture.invalidUtf8,true);assert.equal(f.capture.incompleteLine,true);assert.equal(f.capture.diagnosticTruncated,true);assert.equal(JSON.stringify(f).includes('secret'),false);assert.equal(f.cause,'UNKNOWN');
});
test('noninitializer code shaped text unknown codes and contradictory exit never become a cause',()=>{
 const p=createResetDiagnosticParser();p.push(Buffer.from('SQLSTATE: 42501\nInitialising schema...\nHTTP Authorization: 42501\nSQLSTATE: ZZZZZ\nerror running container: exit 2\n'));const f=p.finish(1);assert.deepEqual(f.observedCodes,[{code:'UNRECOGNIZED',label:'UNRECOGNIZED_SQLSTATE_PRESENT',format:'SQLSTATE_LINE',phase:'INITIALIZING_SCHEMA'}]);assert.equal(f.capture.terminalExitMatched,false);assert.equal(f.cause,'UNKNOWN');assert.equal(JSON.stringify(f).includes('ZZZZZ'),false);
});
function childFixture(code:number|null,signal:string|null='SIGTERM',writeFails=false){const child=Object.assign(new EventEmitter(),{stdout:new PassThrough(),stderr:new PassThrough(),exitCode:null,signalCode:null});const calls:unknown[]=[];let closed=false;
 const ports={spawn:(command:string,args:string[],options:unknown)=>{calls.push({command,args,options});queueMicrotask(()=>{child.stdout.write('private-stdout');child.stderr.write('Initialising schema...\nERROR: native canary (SQLSTATE 42501)\n');child.stdout.end();child.stderr.end();child.emit('exit',code,signal);queueMicrotask(()=>{closed=true;child.emit('close',code,signal)});});return child as unknown as import('node:child_process').ChildProcess;},write:async(value:unknown)=>{assert.equal(closed,true,'capture after streams/native close');calls.push(value);if(writeFails)throw Error('private write error');}};
 return{ports,calls,child};}
test('one non-detached command drains both streams and writes only minimized failure after native close',async()=>{
 const f=childFixture(1,null);await assert.rejects(runPrefixResetCommand('node',['cli','db','reset'],f.ports),e=>e instanceof Error&&e.message==='Cuevo local prefix reset failed; minimized diagnostics may be available.'&&(e as Error&{exitCode:number}).exitCode===1&&!JSON.stringify(e).includes('canary'));
 assert.equal(f.calls.length,2);const call=f.calls[0] as {args:string[];options:{detached:boolean;stdio:string[]}};assert.deepEqual(call.args,['cli','db','reset','--debug']);assert.equal(call.options.detached,false);assert.deepEqual(call.options.stdio,['ignore','pipe','pipe']);assert.equal(JSON.stringify(f.calls[1]).includes('canary'),false);assert.equal(f.child.listenerCount('close'),0);assert.equal(f.child.stderr.listenerCount('data'),0);
});
test('diagnostic publication failure never replaces exit or signal; successful command publishes nothing',async()=>{
 for(const [code,signal]of [[1,null],[null,'SIGTERM']] as const){const f=childFixture(code,signal,true);await assert.rejects(runPrefixResetCommand('node',['cli'],f.ports),e=>e instanceof Error&&(e as Error&{exitCode:number|null;signal:string|null}).exitCode===code&&(e as Error&{signal:string|null}).signal===signal);}
 const success=childFixture(0,null);await runPrefixResetCommand('node',['cli'],success.ports);assert.equal(success.calls.length,1);
});
test('spawn failure stays fixed failure and no native error text reaches output',async()=>{
 await assert.rejects(runPrefixResetCommand('node',['cli'],{spawn(){throw Error('private password')},write:async()=>{throw Error('must not publish without child')}}),e=>e instanceof Error&&!e.message.includes('private')&&(e as Error&{exitCode:null}).exitCode===null);
});
test('asynchronous native spawn error is consumed until close and private error getter is never inspected',async()=>{
 const child=Object.assign(new EventEmitter(),{stdout:new PassThrough(),stderr:new PassThrough()});let published=0;
 const error=new Error();Object.defineProperty(error,'message',{get(){throw Error('private getter touched')}});
 await assert.rejects(runPrefixResetCommand('node',[],{spawn(){queueMicrotask(()=>{child.emit('error',error);child.stdout.emit('error',error);child.stderr.emit('error',error);child.stdout.end();child.stderr.end();child.emit('close',null,null)});return child as never;},write:async result=>{published++;assert.equal(result.exitCode,null);assert.equal(result.capture.diagnosticTruncated,true);assert.equal(result.capture.invalidUtf8,false);}}));
 assert.equal(published,1);assert.equal(child.listenerCount('error'),0);assert.equal(child.stdout.listenerCount('data'),0);assert.equal(child.stderr.listenerCount('data'),0);
});
test('fragmented valid UTF8 and long continuous output retain only fixed vocabulary',()=>{
 const p=createResetDiagnosticParser(),line=Buffer.from('Initialising schema...\nERROR: اسم سري (SQLSTATE 42501)\n');for(const byte of line)p.push(Buffer.from([byte]));
 for(let n=0;n<40;n++)p.push(Buffer.alloc(8192,120));p.push(Buffer.from('\nerror running container: exit 1\n'));const value=p.finish(1);assert.equal(value.capture.invalidUtf8,false);assert.equal(value.capture.lineTruncated,true);assert.equal(value.capture.terminalExitMatched,true);assert.equal(value.observedCodes[0].code,'42501');assert.equal(JSON.stringify(value).includes('سري'),false);
});
test('actual harmless child drains 320KiB without kill or a new timer and preserves failed exit',async()=>{
 let diagnostic:unknown;const script="process.stdout.write('private-stdout');process.stderr.write('Initialising schema...\\n');for(let n=0;n<40;n++)process.stderr.write('x'.repeat(8192));process.stderr.write('\\nERROR: private-native (SQLSTATE 42P01)\\nerror running container: exit 7\\n');process.exitCode=7";
 await assert.rejects(runPrefixResetCommand(process.execPath,['-e',script],{spawn:(command,args,options)=>{assert.equal(args.at(-1),'--debug');return spawn(command,args.slice(0,-1),options);},write:async value=>{diagnostic=value}}),error=>error instanceof Error&&(error as Error&{exitCode:number}).exitCode===7);
 const value=diagnostic as {capture:{lineTruncated:boolean;terminalExitMatched:boolean};observedCodes:{code:string}[]};assert.equal(value.capture.lineTruncated,true);assert.equal(value.capture.terminalExitMatched,true);assert.equal(value.observedCodes[0].code,'42P01');assert.equal(JSON.stringify(diagnostic).includes('private'),false);
 const source=readFileSync(new URL('./reset-local-diagnostic.ts',import.meta.url),'utf8');assert.equal(source.includes('setTimeout('),false);assert.equal(source.includes('.kill('),false);assert.equal(source.includes('detached:true'),false);
});
