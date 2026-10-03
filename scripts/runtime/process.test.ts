import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { spawnOwnedProcess, stopOwnedProcesses } from './process';

const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
async function exited(pid: number) {
  for (let attempt = 0; attempt < 40; attempt++) { if (!alive(pid)) return true; await new Promise(resolve => setTimeout(resolve, 50)); }
  return !alive(pid);
}
test('shutdown removes its owned child and grandchild while preserving an unrelated process', async () => {
  const script = "const {spawn}=require('node:child_process');const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',windowsHide:true,detached:process.platform==='win32'});child.unref();process.stdout.write(String(child.pid)+'\\n');setInterval(()=>{},1000);";
  const owned = spawnOwnedProcess(process.execPath, ['-e', script], { stdio: ['ignore', 'pipe', 'ignore'] });
  const unrelated = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore', windowsHide: true });
  let grandchild = 0;
  try {
    grandchild = await new Promise<number>((resolve, reject) => {
      owned.stdout!.once('data', chunk => resolve(Number(String(chunk).trim())));
      owned.once('error', reject); setTimeout(() => reject(Error('Owned fixture process did not publish its child PID.')), 3000).unref();
    });
    assert.ok(owned.pid && grandchild > 0 && unrelated.pid);
    await stopOwnedProcesses([owned]);
    assert.equal(await exited(owned.pid!), true, 'owned parent process must close');
    assert.equal(await exited(grandchild), true, 'owned grandchild process must close');
    assert.equal(alive(unrelated.pid!), true, 'an unrelated process must remain active');
    await assert.rejects(stopOwnedProcesses([unrelated]), /not owned/);
  } finally {
    await stopOwnedProcesses([owned]).catch(() => undefined);
    if (grandchild && alive(grandchild)) process.kill(grandchild, 'SIGKILL');
    unrelated.kill('SIGKILL');
  }
});

test('POSIX shutdown forces a descendant that ignores TERM after its root exits', { skip: process.platform === 'win32' }, async () => {
  const script = "const {spawn}=require('node:child_process');const child=spawn(process.execPath,['-e',\"process.on('SIGTERM',()=>{});process.stdout.write('ready');setInterval(()=>{},1000)\"],{stdio:['ignore','pipe','ignore']});child.stdout.once('data',()=>process.stdout.write(String(child.pid)+'\\n'));setInterval(()=>{},1000);";
  const child = spawnOwnedProcess(process.execPath, ['-e', script], { stdio: ['ignore', 'pipe', 'ignore'] });
  let descendant = 0;
  try {
    descendant = await new Promise<number>((resolve, reject) => { child.stdout!.once('data', value => resolve(Number(String(value).trim()))); child.once('error', reject); setTimeout(() => reject(Error('POSIX fixture readiness failed.')), 3000).unref(); });
    await stopOwnedProcesses([child]); assert.equal(await exited(child.pid!), true); assert.equal(await exited(descendant), true);
  } finally { await stopOwnedProcesses([child]).catch(() => undefined); if (descendant && alive(descendant)) process.kill(descendant, 'SIGKILL'); }
});
