import {resolve4,resolve6} from 'node:dns/promises';
import {connect} from 'node:net';
const targets=[{name:'direct',host:'db.mqxdjvsyckzocokuikmx.supabase.co'},{name:'session-pooler',host:'aws-0-ap-southeast-1.pooler.supabase.com'}];
for(const target of targets){
 const addresses=(await Promise.allSettled([resolve4(target.host),resolve6(target.host)])).flatMap((result,index)=>result.status==='fulfilled'?result.value.map(address=>({address,family:index===0?4:6})):[]);
 const attempts=await Promise.all(addresses.map(({address,family})=>new Promise<{family:number;reachable:boolean;code:string|null}>(done=>{let settled=false;const socket=connect({host:address,port:5432,family});const finish=(reachable:boolean,code:string|null)=>{if(settled)return;settled=true;socket.destroy();done({family,reachable,code});};socket.setTimeout(5000,()=>finish(false,'TIMEOUT'));socket.once('connect',()=>finish(true,null));socket.once('error',error=>finish(false,['ENETUNREACH','EHOSTUNREACH','ECONNREFUSED','ETIMEDOUT'].includes((error as NodeJS.ErrnoException).code??'')?(error as NodeJS.ErrnoException).code!:'OTHER'));})));
 console.log(JSON.stringify({target:target.name,host:target.host,port:5432,protocol:'TCP_CONNECT_ONLY_NO_AUTH',addresses:addresses.length,attempts}));
}
