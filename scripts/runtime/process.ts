import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
const owned = new WeakSet<ChildProcess>();
const stopping = new WeakMap<ChildProcess, Promise<void>>();
export function spawnOwnedProcess(command: string, args: string[], options: SpawnOptions): ChildProcess {
  const child = spawn(command, args, { ...options, detached: process.platform !== 'win32', windowsHide: true }); owned.add(child); return child;
}
function waitForExit(child: ChildProcess, timeoutMs: number) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise<boolean>(resolve => {
    const done = () => { clearTimeout(timer); child.removeListener('exit', done); resolve(true); };
    const timer = setTimeout(() => { child.removeListener('exit', done); resolve(false); }, timeoutMs);
    child.once('exit', done);
  });
}
async function stopTree(child: ChildProcess) {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    if (child.exitCode !== null || child.signalCode !== null) return;
    // SIGTERM on Windows terminates the root immediately; capture its still-owned descendants first.
    await new Promise<void>((resolve, reject) => {
      const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
      const timeout = setTimeout(() => { killer.kill(); reject(Error('Owned process-tree shutdown timed out.')); }, 5000);
      killer.once('error', () => { clearTimeout(timeout); reject(Error('Owned process-tree shutdown unavailable.')); });
      killer.once('exit', code => { clearTimeout(timeout); if (code === 0 || child.exitCode !== null || child.signalCode !== null) resolve(); else reject(Error('Owned process-tree shutdown failed.')); });
    });
    if (!await waitForExit(child, 1000)) throw Error('Owned process did not close after tree shutdown.');
  } else {
    const groupExists = () => { try { process.kill(-child.pid!, 0); return true; } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false; throw error; } };
    if (!groupExists()) return;
    try { process.kill(-child.pid, 'SIGTERM'); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; }
    const deadline = Date.now() + 2000;
    while (groupExists() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
    if (groupExists()) { try { process.kill(-child.pid, 'SIGKILL'); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; } }
    if (!await waitForExit(child, 1000)) throw Error('Owned process group did not close.');
  }
}
export async function stopOwnedProcesses(children: ChildProcess[]): Promise<void> {
  for (const child of children) if (!owned.has(child)) throw Error('Process is not owned by this runtime launcher.');
  await Promise.all(children.map(child => { let result = stopping.get(child); if (!result) { result = stopTree(child); stopping.set(child, result); } return result; }));
}
