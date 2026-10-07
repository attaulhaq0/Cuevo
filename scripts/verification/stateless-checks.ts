import { spawn } from 'node:child_process';
import { verificationSteps, fullRuntimeVerificationSteps } from './steps';

/** Source-owned test discovery executes once in fast CI. Runtime jobs retain
 * their own isolated source and state proofs without repeating these cases. */
const runtime = new Set(fullRuntimeVerificationSteps.map(step => step.name));
const excluded = new Set(['unit','web-unit','lint','typecheck']);
for (const step of verificationSteps.filter(step => !runtime.has(step.name) && !excluded.has(step.name))) {
  const code = await new Promise<number | null>(done => {
    const child = spawn(process.execPath, [...step.args], { shell: false, windowsHide: true, stdio: 'inherit', env: process.env });
    child.once('error', () => done(null)); child.once('exit', done);
  });
  if (code !== 0) throw Error(`Stateless verification failed: ${step.name}`);
}
