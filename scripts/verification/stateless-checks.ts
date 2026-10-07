import { spawn } from 'node:child_process';
import { statelessVerificationSteps } from './steps';

/** Source-owned test discovery executes once in fast CI. Runtime jobs retain
 * their own isolated source and state proofs without repeating these cases. */
for (const step of statelessVerificationSteps) {
  const code = await new Promise<number | null>(done => {
    const child = spawn(process.execPath, [...step.args], { shell: false, windowsHide: true, stdio: 'inherit', env: process.env });
    child.once('error', () => done(null)); child.once('exit', done);
  });
  if (code !== 0) throw Error(`Stateless verification failed: ${step.name}`);
}
