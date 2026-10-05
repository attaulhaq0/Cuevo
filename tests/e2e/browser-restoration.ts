/** Test-owned restoration must retain the original source failure. */
export async function withBrowserRestoration(verify:()=>Promise<void>,restore:()=>Promise<void>):Promise<void>{
 const failures:unknown[]=[];
 try{await verify()}catch(error){failures.push(error)}
 try{await restore()}catch(error){failures.push(error)}
 if(failures.length===1)throw failures[0];
 if(failures.length>1)throw new AggregateError(failures,'Browser source verification and test-owned restoration failed.',{cause:failures[0]});
}
