import { isAbsolute, join, relative, resolve } from 'node:path';
import { types } from 'node:util';
import { z } from 'zod';

const failure=()=>new Error('Hosted migration operator endpoint, credential or certificate configuration requires review; contents withheld.');
const project=z.string().regex(/^[a-z]{20}$/);
const endpointSchema=z.object({projectRef:project,kind:z.enum(['direct','session-pooler']),host:z.string().min(1).max(253),port:z.literal(5432),database:z.literal('postgres'),provenance:z.literal('CALLER_SUPPLIED_PROVIDER_METADATA')}).strict();
const inputSchema=z.object({projectRef:project,repoRoot:z.string(),endpoint:endpointSchema,password:z.string().min(1).max(24576).refine(value=>value.trim().length>0&&[...value].every(character=>character.charCodeAt(0)>31&&character.charCodeAt(0)!==127)),certificate:z.object({path:z.string(),provenance:z.literal('CALLER_SUPPLIED_OWNED_PATH')}).strict(),toolchain:z.record(z.string(),z.string())}).strict();
const toolchainKeys=['PATH','Path','SystemRoot','SYSTEMROOT','WINDIR','ComSpec','COMSPEC','PATHEXT','TEMP','TMP','LANG','LC_ALL','TZ'] as const;

function ownJson(value:unknown,depth=0):unknown{
 if(depth>4)throw failure();
 if(value===null||typeof value==='string'||typeof value==='number'||typeof value==='boolean')return value;
 if(!value||typeof value!=='object'||types.isProxy(value)||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw failure();
 const result:Record<string,unknown>=Object.create(null);
 for(const key of Reflect.ownKeys(value)){const field=Object.getOwnPropertyDescriptor(value,key);if(typeof key!=='string'||!field||!('value'in field)||!field.enumerable)throw failure();Object.defineProperty(result,key,{value:ownJson(field.value,depth+1),enumerable:true});}
 return result;
}

export type HostedMigrationConnection={
 publicRecipe:{projectRef:string;databaseUrl:string;cliTargetArgs:string[];operator:'postgres';endpointKind:'direct'|'session-pooler';provenance:'CALLER_SUPPLIED_PROVIDER_METADATA';tls:'VERIFY_FULL_CONFIGURATION_ONLY';certificateProvenance:'CALLER_SUPPLIED_OWNED_PATH';execution:'NOT_EXECUTED'};
 privateEnvironment:Record<string,string>;
};

/** Pure operator configuration. Provider identity, physical CA ownership, TLS and release admission are checked by the executor. */
export function prepareHostedMigrationConnection(input:unknown):HostedMigrationConnection{
 const parsed=inputSchema.safeParse(ownJson(input));if(!parsed.success)throw failure();const value=parsed.data;
 if(value.endpoint.projectRef!==value.projectRef||!isAbsolute(value.repoRoot)||resolve(value.repoRoot)!==value.repoRoot)throw failure();
 const direct=value.endpoint.kind==='direct';
 if(direct?value.endpoint.host!==`db.${value.projectRef}.supabase.co`:!/^aws-[0-9]+-[a-z0-9]+(?:-[a-z0-9]+)*\.pooler\.supabase\.com$/.test(value.endpoint.host))throw failure();
 const certificateRoot=join(value.repoRoot,'.local','hosted-release'),certificatePath=value.certificate.path;
 const inside=relative(certificateRoot,certificatePath);
 if(!isAbsolute(certificatePath)||resolve(certificatePath)!==certificatePath||!inside||isAbsolute(inside)||inside.split(/[\\/]/).some(part=>!part||part==='.'||part==='..'))throw failure();
 const url=new URL(`postgresql://${direct?'postgres':`postgres.${value.projectRef}`}@${value.endpoint.host}:5432/postgres`);url.searchParams.set('sslmode','verify-full');
 if(url.password||url.hostname!==value.endpoint.host||url.port!=='5432'||url.pathname!=='/postgres'||url.search!=='?sslmode=verify-full'||url.hash)throw failure();
 const privateEnvironment:Record<string,string>={};for(const key of toolchainKeys)if(Object.hasOwn(value.toolchain,key))privateEnvironment[key]=value.toolchain[key];
 privateEnvironment.PGPASSWORD=value.password;privateEnvironment.PGSSLROOTCERT=certificatePath;
 return{publicRecipe:{projectRef:value.projectRef,databaseUrl:url.toString(),cliTargetArgs:['--db-url',url.toString()],operator:'postgres',endpointKind:value.endpoint.kind,provenance:'CALLER_SUPPLIED_PROVIDER_METADATA',tls:'VERIFY_FULL_CONFIGURATION_ONLY',certificateProvenance:'CALLER_SUPPLIED_OWNED_PATH',execution:'NOT_EXECUTED'},privateEnvironment};
}
