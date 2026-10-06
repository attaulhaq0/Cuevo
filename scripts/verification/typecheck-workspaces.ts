import{spawnSync}from'node:child_process';import{resolve}from'node:path';
import { runtimeEnvironment } from '../runtime/environment';
// Fresh checkouts have no ignored Next declarations. Generate them before
// root tests import any browser owner or its static image source.
const generated = spawnSync(process.execPath, [resolve('node_modules/next/dist/bin/next'), 'typegen'], { cwd: resolve('apps/web'), env: { ...runtimeEnvironment('web', process.env), NEXT_TELEMETRY_DISABLED: '1' }, stdio: 'inherit' });
if (generated.status !== 0) process.exit(generated.status ?? 1);
for(const args of[['node_modules/typescript/bin/tsc','--noEmit'],[resolve('node_modules/typescript/bin/tsc'),'--noEmit','-p','apps/web/tsconfig.json']]){const result=spawnSync(process.execPath,args,{stdio:'inherit'});if(result.status!==0)process.exit(result.status??1);}
