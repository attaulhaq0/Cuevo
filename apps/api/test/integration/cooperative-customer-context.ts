import type{QueryResult}from'pg';
import type{CustomerContext}from'./customer-test-context';
import type{CooperativeFixtureScope}from'./cooperative-fixture-scope';
/** Test-only wrapper; owner cleanup stays on the original context after body settlement. */
export function cooperativeCustomerContext(context:CustomerContext,scope:CooperativeFixtureScope):CustomerContext{
 const guard=<T>(work:()=>PromiseLike<T>)=>scope.operation(work);
 const query=context.client.query.bind(context.client)as(sql:string,values?:unknown[])=>Promise<QueryResult>;
 return{...context,request:(...args)=>guard(()=>context.request(...args)),command:(...args)=>guard(()=>context.command(...args)),drain:()=>guard(()=>context.drain()),client:new Proxy(context.client,{get(target,key){if(key==='query')return(sql:string,values?:unknown[])=>guard(()=>query(sql,values));return Reflect.get(target,key);}})}as CustomerContext;
}
