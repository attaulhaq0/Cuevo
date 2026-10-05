export type AuditScope='build-and-runtime'|'runtime';
export function auditArguments(scope:AuditScope):string[]{
 if(scope==='build-and-runtime')return ['audit','--json','--audit-level=moderate'];
 if(scope==='runtime')return ['audit','--omit=dev','--json','--audit-level=moderate'];
 throw Error('Unknown dependency audit scope.');
}
export function dependencyAuditResult(scope:AuditScope,stdout:string,exitCode:number|null){
 const unavailable=()=>{throw Error('Dependency security evidence is unavailable or invalid.');};
 auditArguments(scope);
 let value:unknown;try{value=JSON.parse(stdout);}catch{return unavailable();}
 if(!value||typeof value!=='object'||Array.isArray(value)||'error'in value||!('metadata'in value))return unavailable();
 const metadata=value.metadata;if(!metadata||typeof metadata!=='object'||Array.isArray(metadata)||!('vulnerabilities'in metadata))return unavailable();
 const counts=metadata.vulnerabilities;if(!counts||typeof counts!=='object'||Array.isArray(counts))return unavailable();
 const levels=['info','low','moderate','high','critical','total']as const;
 const numbers=Object.fromEntries(levels.map(level=>[level,level in counts?(counts as Record<string,unknown>)[level]:undefined]))as Record<typeof levels[number],number>;
 if(levels.some(level=>!Number.isSafeInteger(numbers[level])||numbers[level]<0)||numbers.total!==numbers.info+numbers.low+numbers.moderate+numbers.high+numbers.critical)return unavailable();
 if(numbers.moderate+numbers.high+numbers.critical>0)throw Error('Dependencies require security review before release.');
 if(exitCode!==0)return unavailable();
 return {check:'dependency-security',scope,...numbers};
}
