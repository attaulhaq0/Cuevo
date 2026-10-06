import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('fresh typecheck generates real Next image declarations before root and web TypeScript', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cuevo-typecheck-'));
  try {
    await mkdir(join(root, 'apps/web/app'), { recursive: true });
    await symlink(resolve('node_modules'), join(root, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
    await writeFile(join(root, 'package.json'), '{"private":true,"type":"module"}');
    await writeFile(join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', jsx: 'react-jsx', esModuleInterop: true, skipLibCheck: true, noEmit: true }, include: ['apps/web/**/*.ts', 'apps/web/**/*.tsx'] }));
    await writeFile(join(root, 'apps/web/package.json'), '{"name":"fixture","private":true}');
    await writeFile(join(root, 'apps/web/tsconfig.json'), '{"extends":"../../tsconfig.json","include":["next-env.d.ts","**/*.ts","**/*.tsx"]}');
    await writeFile(join(root, 'apps/web/app/layout.tsx'), 'export default function Layout({children}:{children:React.ReactNode}){return <html><body>{children}</body></html>}');
    await writeFile(join(root, 'apps/web/app/page.tsx'), 'import art from "./fixture.webp"; export default function Page(){return <p>{art.width}</p>}');
    await writeFile(join(root, 'apps/web/app/fixture.webp'), 'fixture import only; type generation does not decode it');
    await assert.rejects(readFile(join(root, 'apps/web/next-env.d.ts')), { code: 'ENOENT' });
    const result = spawnSync(process.execPath, ['--import', 'tsx', resolve('scripts/verification/typecheck-workspaces.ts')], { cwd: root, encoding: 'utf8', env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' }, timeout: 60000 });
    assert.equal(result.status, 0, (result.stdout ?? '') + (result.stderr ?? ''));
    assert.match(await readFile(join(root, 'apps/web/next-env.d.ts'), 'utf8'), /next\/image-types\/global/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
