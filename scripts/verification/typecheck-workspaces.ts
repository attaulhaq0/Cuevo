import{spawnSync}from'node:child_process';import{resolve}from'node:path';
for(const args of[['node_modules/typescript/bin/tsc','--noEmit'],[resolve('node_modules/typescript/bin/tsc'),'--noEmit','-p','apps/web/tsconfig.json']]){const result=spawnSync(process.execPath,args,{stdio:'inherit'});if(result.status!==0)process.exit(result.status??1);}
