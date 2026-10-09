import{spawnSync}from'node:child_process';import{resolve}from'node:path';
import { runtimeEnvironment } from '../runtime/environment';
const scope=process.argv.length===2?'full':process.argv.length===3&&['--scope=backend','--scope=web'].includes(process.argv[2])?process.argv[2].slice(8):null;
if(scope===null)throw Error('Configured build requires the full default or one backend/web scope.');
process.loadEnvFile(resolve('.env.local'));
const execute=(args:string[],cwd=process.cwd(),env=process.env)=>{const result=spawnSync(process.execPath,args,{cwd,env,stdio:'inherit'});if(result.status!==0)throw Error('Configured workspace build failed.');};
if(scope!=='web'){
execute(['node_modules/typescript/bin/tsc','-p','apps/api/tsconfig.build.json']);
execute(['node_modules/typescript/bin/tsc','-p','apps/worker/tsconfig.build.json']);
}
// Load configuration in this parent; child Next workers get variables, not an env-file CLI flag.
if(scope!=='backend')execute([resolve('node_modules/next/dist/bin/next'),'build'],resolve('apps/web'),{...runtimeEnvironment('web',process.env),NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1'});
