import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createHash,randomBytes,scryptSync,timingSafeEqual } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { types } from 'node:util';
import { z } from 'zod';

const failure = () => Error('Synthetic Auth identity source or original attempt requires review; credentials withheld.');
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
export function isExactSyntheticAuthPassword(value:string):boolean{
 for(let index=0;index<value.length;index++){const code=value.charCodeAt(index);if(code<32||code===127)return false;if(code>=0xd800&&code<=0xdbff){const next=value.charCodeAt(++index);if(!(next>=0xdc00&&next<=0xdfff))return false;}else if(code>=0xdc00&&code<=0xdfff)return false;}return true;
}
const exactPassword=z.string().min(12).max(4096).refine(isExactSyntheticAuthPassword);
const passwordBindingSchema=z.object({algorithm:z.literal('scrypt'),N:z.literal(131072),r:z.literal(8),p:z.literal(1),salt:z.string().regex(/^[a-f0-9]{32}$/),key:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export type SyntheticAuthPasswordBinding=z.infer<typeof passwordBindingSchema>;
/** Private original-attempt verifier; never a browser or provider credential. */
export function createSyntheticAuthPasswordBinding(password:string):SyntheticAuthPasswordBinding{
 const input=exactPassword.parse(password),salt=randomBytes(16);
 return{algorithm:'scrypt',N:131072,r:8,p:1,salt:salt.toString('hex'),key:scryptSync(input,salt,32,{N:131072,r:8,p:1,maxmem:256*1024*1024}).toString('hex')};
}
export function verifySyntheticAuthPasswordBinding(password:string,value:unknown):boolean{
 const input=exactPassword.parse(password),binding=passwordBindingSchema.parse(own(value));
 const actual=scryptSync(input,Buffer.from(binding.salt,'hex'),32,{N:binding.N,r:binding.r,p:binding.p,maxmem:256*1024*1024});
 return timingSafeEqual(actual,Buffer.from(binding.key,'hex'));
}
const actorSchema = z.object({ actorId: z.uuid(), schoolId: z.uuid(), email: z.email().max(254), role: z.enum(['admin', 'coordinator', 'teacher', 'student', 'parent']), displayName: z.string().min(1).max(200) }).strict();
const manifestSchema = z.object({ synthetic: z.literal(true), schoolId: z.uuid(), denialSchoolId: z.uuid(), actors: z.array(actorSchema).length(133) }).strict();
export const syntheticAuthReceiptV1ActorSchema = z.object({ actorId: z.uuid(), emailSha256: z.string().regex(/^[a-f0-9]{64}$/), state: z.enum(['NOT_ATTEMPTED', 'INTENT', 'CONFIRMED', 'OUTCOME_UNKNOWN', 'REQUIRES_REVIEW']) }).strict();
const receiptActor=syntheticAuthReceiptV1ActorSchema;
const receiptV1Schema = z.object({ version: z.literal(1), evidence: z.literal('SOURCE_LOCKED_SYNTHETIC_AUTH_ATTEMPTS'), status: z.enum(['CONFIRMED', 'OUTCOME_UNKNOWN', 'REQUIRES_REVIEW']), manifestSha256: z.string().regex(/^[a-f0-9]{64}$/), originalKey: z.string().min(1).max(200), created: z.number().int().nonnegative().max(133), actors: z.array(receiptActor).length(133) }).strict();
export const syntheticAuthOriginalCreateContextSchema=z.object({version:z.literal(1),projectRef:z.string().regex(/^[a-z]{20}$/),sourceSha:z.string().regex(/^[a-f0-9]{40}$/),treeSha:z.string().regex(/^[a-f0-9]{40}$/),identitySha256:z.string().regex(/^[a-f0-9]{64}$/),runId:z.string().regex(/^[1-9][0-9]{0,19}$/),runAttempt:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),packageSha256:z.string().regex(/^[a-f0-9]{64}$/),passwordBinding:passwordBindingSchema}).strict();
const originalCreateSchema=z.object({operationSha256:z.string().regex(/^[a-f0-9]{64}$/),intentObservedAt:z.iso.datetime({offset:true})}).strict();
export const syntheticAuthReceiptV2ActorSchema=receiptActor.extend({originalCreate:originalCreateSchema.nullable()}).strict();
const receiptV2Actor=syntheticAuthReceiptV2ActorSchema;
export const syntheticAuthSeedReceiptSchema=z.union([receiptV1Schema,receiptV1Schema.extend({version:z.literal(2),originalCreateContext:syntheticAuthOriginalCreateContextSchema,actors:z.array(receiptV2Actor).length(133)}).strict().superRefine((receipt,context)=>{
 if(receipt.actors.some(actor=>actor.state==='INTENT'&&actor.originalCreate===null||actor.state==='NOT_ATTEMPTED'&&actor.originalCreate!==null)||receipt.status==='CONFIRMED'&&receipt.actors.some(actor=>actor.state!=='CONFIRMED'))context.addIssue({code:'custom',message:'Original Auth state and provenance require exact agreement.'});
})]);
const receiptSchema=syntheticAuthSeedReceiptSchema;
export type SyntheticAuthSeedReceipt = z.infer<typeof receiptSchema>;
export type SyntheticAuthSeedManifest = z.infer<typeof manifestSchema>;
export type SyntheticAuthOriginalCreateContext=z.infer<typeof syntheticAuthOriginalCreateContextSchema>;
export type SyntheticAuthOriginalCreate=z.infer<typeof originalCreateSchema>;
const inputSchema = z.object({ manifest: manifestSchema, password: exactPassword, originalKey: z.string().min(1).max(200), prior: receiptSchema.optional(),originalCreateContext:syntheticAuthOriginalCreateContextSchema.optional() }).strict();
export type SyntheticAuthSeedOptions = { persistAttempt?: (receipt: SyntheticAuthSeedReceipt) => Promise<void>;validateOriginalUser?:(actor:SyntheticAuthSeedManifest['actors'][number],attempt:SyntheticAuthOriginalCreate,user:Record<string,unknown>,context:SyntheticAuthOriginalCreateContext)=>Promise<void> };
function own(value: unknown, depth = 0): unknown {
  if (depth > 10) throw failure(); if (value === undefined || value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) return value;
  if (!value || typeof value !== 'object' || types.isProxy(value) || !Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw failure(); if (Array.isArray(value) && (value.length > 133 || Reflect.ownKeys(value).length !== value.length + 1)) throw failure();
  const output: Record<string, unknown> | unknown[] = Array.isArray(value) ? [] : Object.create(null); for (const key of Reflect.ownKeys(value)) { if (Array.isArray(value) && key === 'length') continue; const field = Object.getOwnPropertyDescriptor(value, key); if (typeof key !== 'string' || !field || !('value' in field) || !field.enumerable) throw failure(); Object.defineProperty(output, key, { value: own(field.value, depth + 1), enumerable: true }); } return output;
}
function canonical(value: unknown): string { if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'; if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical((value as Record<string, unknown>)[key])).join(',') + '}'; return JSON.stringify(value); }
export function syntheticAuthOriginalCreateSha256(context:SyntheticAuthOriginalCreateContext,originalKey:string,manifestSha256:string,actor:SyntheticAuthSeedManifest['actors'][number]){
 return hash(canonical({purpose:'CUEVO_HOSTED_SYNTHETIC_AUTH_CREATE',context:syntheticAuthOriginalCreateContextSchema.parse(own(context)),originalKey,manifestSha256,actorId:actor.actorId,emailSha256:hash(actor.email),emailConfirm:true,synthetic:true}));
}
export function syntheticAuthOriginalCreateMetadata(operationSha256:string){return{cuevo_synthetic_auth:{version:1 as const,operationSha256:z.string().regex(/^[a-f0-9]{64}$/).parse(operationSha256)}};}
function exactUser(value: unknown, actor: SyntheticAuthSeedManifest['actors'][number]) {
  if (!value || typeof value !== 'object' || types.isProxy(value)) return false; const user = value as Record<string, unknown>;
  const confirmation = user.email_confirmed_at, ban = user.banned_until;
  return user.id === actor.actorId && user.email === actor.email && user.is_anonymous === false && user.user_metadata !== null && typeof user.user_metadata === 'object' && (user.user_metadata as Record<string, unknown>).synthetic === true
    && typeof confirmation === 'string' && z.iso.datetime({ offset: true }).safeParse(confirmation).success && Date.parse(confirmation) <= Date.now()
    && (user.deleted_at === undefined || user.deleted_at === null) && (ban === undefined || ban === null || typeof ban === 'string' && z.iso.datetime({ offset: true }).safeParse(ban).success && Date.parse(ban) <= Date.now());
}
function readResponse(value: unknown) {
  const field = (object: unknown, key: string) => { if (!object || typeof object !== 'object' || types.isProxy(object)) throw failure(); const descriptor = Object.getOwnPropertyDescriptor(object, key); if (!descriptor || !('value' in descriptor)) throw failure(); return descriptor.value as unknown; };
  try {
    const data = field(value, 'data'), user = field(data, 'user'), error = field(value, 'error');
    const copiedUser = user === null ? null : own(user);
    const copiedError = error === null ? null : { status: field(error, 'status'), code: field(error, 'code') };
    return { user: copiedUser, error: copiedError };
  } catch { return null; }
}
function missing(result: ReturnType<typeof readResponse>) { const error = result?.error; return result?.user === null && error !== null && typeof error === 'object' && error !== undefined && (error as { status?: unknown }).status === 404 && (error as { code?: unknown }).code === 'user_not_found'; }

/** Reused source fixture core. Caller admits the native Auth target and persists
 * original attempts; this grants no school access, creates no sessions and
 * never deletes or retries an uncertain identity. */
export async function seedSyntheticAuthIdentities(client: SupabaseClient, value: unknown, options: SyntheticAuthSeedOptions = {}): Promise<SyntheticAuthSeedReceipt> {
  return runSyntheticAuthSeed(client, value, options, false);
}

/** One provider creation engine. The private compatibility branch is reachable
 * only by this module's original guarded local CLI; it makes no retained-attempt
 * or hosted retry claim. Exported consumers always require durable persistence. */
async function runSyntheticAuthSeed(client: SupabaseClient, value: unknown, options: SyntheticAuthSeedOptions, localCompatibility: boolean): Promise<SyntheticAuthSeedReceipt> {
  const input = inputSchema.parse(own(value)), raw = await readFile(new URL('../supabase/seed/identities.json', import.meta.url)), locked = manifestSchema.parse(JSON.parse(raw.toString('utf8')));
  if (hash(raw) !== '7464b3487adc3998d8f4ad4582ffd08ebafbdc8fd9a568433ddc687f4f03ac21' || canonical(input.manifest) !== canonical(locked) || new Set(input.manifest.actors.map(actor => actor.actorId)).size !== 133 || new Set(input.manifest.actors.map(actor => actor.email)).size !== 133) throw failure();
  if (!options || types.isProxy(options) || ![Object.prototype, null].includes(Object.getPrototypeOf(options)) || Reflect.ownKeys(options).some(key => key !== 'persistAttempt'&&key!=='validateOriginalUser')) throw failure(); const option = Object.getOwnPropertyDescriptor(options, 'persistAttempt'),validator=Object.getOwnPropertyDescriptor(options,'validateOriginalUser');for(const descriptor of[option,validator])if(descriptor&&(!('value'in descriptor)||typeof descriptor.value!=='function'))throw failure();const persist:SyntheticAuthSeedOptions['persistAttempt']=option?.value,validateOriginalUser:SyntheticAuthSeedOptions['validateOriginalUser']=validator?.value;
  const manifestSha256 = hash(canonical(locked)), actors = locked.actors.map(actor => ({ actorId: actor.actorId, emailSha256: hash(actor.email), state: 'NOT_ATTEMPTED' as SyntheticAuthSeedReceipt['actors'][number]['state'] }));
  if (input.prior) { if (input.prior.manifestSha256 !== manifestSha256 || input.prior.originalKey !== input.originalKey || input.prior.actors.some((actor, index) => actor.actorId !== actors[index].actorId || actor.emailSha256 !== actors[index].emailSha256)) throw failure(); for (const [index, actor] of input.prior.actors.entries()) actors[index].state = actor.state; }
  const originalCreateContext=input.prior?.version===2?input.prior.originalCreateContext:input.prior?undefined:input.originalCreateContext;
  if(originalCreateContext&&!verifySyntheticAuthPasswordBinding(input.password,originalCreateContext.passwordBinding))throw failure();
  if(input.prior?.version===2&&input.originalCreateContext&&canonical(input.prior.originalCreateContext)!==canonical(input.originalCreateContext))throw failure();
  const receipt:SyntheticAuthSeedReceipt=originalCreateContext?{version:2,evidence:'SOURCE_LOCKED_SYNTHETIC_AUTH_ATTEMPTS',status:'OUTCOME_UNKNOWN',manifestSha256,originalKey:input.originalKey,created:0,originalCreateContext,actors:actors.map((actor,index)=>({...actor,originalCreate:input.prior?.version===2?input.prior.actors[index].originalCreate:null}))}:{version:1,evidence:'SOURCE_LOCKED_SYNTHETIC_AUTH_ATTEMPTS',status:'OUTCOME_UNKNOWN',manifestSha256,originalKey:input.originalKey,created:0,actors};
  if(receipt.version===2&&input.prior?.version===2)receipt.created=input.prior.created;
  const currentActors=receipt.actors;
  const proveOriginalUser=async(index:number,actor:SyntheticAuthSeedManifest['actors'][number],user:Record<string,unknown>)=>{
   if(receipt.version!==2||!receipt.actors[index].originalCreate||!validateOriginalUser)throw failure();const attempt=receipt.actors[index].originalCreate!,metadata=user.app_metadata;
   if(attempt.operationSha256!==syntheticAuthOriginalCreateSha256(receipt.originalCreateContext,input.originalKey,manifestSha256,actor)||Date.parse(attempt.intentObservedAt)>Date.now()||!metadata||typeof metadata!=='object'||canonical((metadata as Record<string,unknown>).cuevo_synthetic_auth)!==canonical(syntheticAuthOriginalCreateMetadata(attempt.operationSha256).cuevo_synthetic_auth))throw failure();
   await validateOriginalUser(actor,attempt,user,receipt.originalCreateContext);
  };
  const save = async () => { if (persist) await persist(structuredClone(receipt)); };
  const stop = async (index: number, state: 'OUTCOME_UNKNOWN' | 'REQUIRES_REVIEW') => { currentActors[index].state = state; receipt.status = state; await save().catch(() => undefined); return structuredClone(receipt); };
  for (const [index, actor] of locked.actors.entries()) {
    let read: ReturnType<typeof readResponse>; try {
      const response = await client.auth.admin.getUserById(actor.actorId);
      if (localCompatibility && response.data.user) { actors[index].state = 'CONFIRMED'; continue; }
      read = readResponse(response);
    } catch { return stop(index, 'OUTCOME_UNKNOWN'); }
    if(read?.error===null&&exactUser(read.user,actor)){
     if(['INTENT','OUTCOME_UNKNOWN','REQUIRES_REVIEW'].includes(currentActors[index].state)||receipt.version===2&&receipt.actors[index].originalCreate!==null){
      try{await proveOriginalUser(index,actor,read.user as Record<string,unknown>);}catch{return stop(index,'OUTCOME_UNKNOWN');}
     }currentActors[index].state='CONFIRMED';if(receipt.version===2)receipt.created=Math.max(receipt.created,receipt.actors.filter(actor=>actor.originalCreate!==null&&actor.state==='CONFIRMED').length);continue;
    }
    if (!localCompatibility && !missing(read)) return stop(index, read?.error === null && read.user !== null ? 'REQUIRES_REVIEW' : 'OUTCOME_UNKNOWN');
    if (currentActors[index].state !== 'NOT_ATTEMPTED') return stop(index, 'OUTCOME_UNKNOWN');
    if (!localCompatibility && !persist) { receipt.status = 'REQUIRES_REVIEW'; return structuredClone(receipt); }
    if(input.originalCreateContext&&(receipt.version!==2||!validateOriginalUser)){receipt.status='OUTCOME_UNKNOWN';return structuredClone(receipt);}
    currentActors[index].state='INTENT';if(receipt.version===2)receipt.actors[index].originalCreate={operationSha256:syntheticAuthOriginalCreateSha256(receipt.originalCreateContext,input.originalKey,manifestSha256,actor),intentObservedAt:new Date(Date.now()).toISOString()};try{await save();}catch{return stop(index,'OUTCOME_UNKNOWN');}
    let result: ReturnType<typeof readResponse>; try {
      const response = await client.auth.admin.createUser({ id: actor.actorId, email: actor.email, password: input.password, email_confirm: true, user_metadata: { synthetic: true },...(receipt.version===2?{app_metadata:syntheticAuthOriginalCreateMetadata(receipt.actors[index].originalCreate!.operationSha256)}:{}) });
      if (localCompatibility) {
        if (response.error || response.data.user?.id !== actor.actorId) return stop(index, 'OUTCOME_UNKNOWN');
        actors[index].state = 'CONFIRMED'; receipt.created++; continue;
      }
      result = readResponse(response);
    } catch { return stop(index, 'OUTCOME_UNKNOWN'); }
    if (result?.error !== null || !exactUser(result.user, actor)) return stop(index, 'OUTCOME_UNKNOWN');
    let after: ReturnType<typeof readResponse>; try { after = readResponse(await client.auth.admin.getUserById(actor.actorId)); } catch { return stop(index, 'OUTCOME_UNKNOWN'); }
    if (after?.error !== null || !exactUser(after.user, actor)) return stop(index, 'OUTCOME_UNKNOWN');if(receipt.version===2)try{await proveOriginalUser(index,actor,after.user as Record<string,unknown>);}catch{return stop(index,'OUTCOME_UNKNOWN');}currentActors[index].state = 'CONFIRMED';if(receipt.version===2)receipt.created=Math.max(receipt.created,receipt.actors.filter(actor=>actor.originalCreate!==null&&actor.state==='CONFIRMED').length);else receipt.created++;try { await save(); } catch { return stop(index, 'OUTCOME_UNKNOWN'); }
  }
  receipt.status = 'CONFIRMED'; try { await save(); } catch { receipt.status = 'OUTCOME_UNKNOWN'; } return structuredClone(receipt);
}

async function main() {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !['localhost', '127.0.0.1'].includes(new URL(url).hostname) || new URL(url).port !== '56321') throw new Error('Synthetic identity seeding is restricted to the local Cuevo environment.');
  const manifest = JSON.parse(await readFile('supabase/seed/identities.json', 'utf8')), secrets = JSON.parse(await readFile('.local/runtime-secrets.json', 'utf8')) as { syntheticPassword: string }, client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  // Preserve the original reset-local workflow. It neither reads an old receipt
  // from a prior database generation nor claims durable hosted reconciliation.
  const result = await runSyntheticAuthSeed(client, { manifest, password: secrets.syntheticPassword, originalKey: 'standard-local-reference-auth' }, {}, true);
  if (result.status !== 'CONFIRMED') throw failure(); const parsed = manifestSchema.parse(manifest), accounts = parsed.actors.filter(actor => ['admin', 'coordinator', 'teacher', 'student', 'parent'].includes(actor.role)).map(actor => ({ role: actor.role, email: actor.email, password: secrets.syntheticPassword }));
  await writeFile('.local/synthetic-accounts.json', JSON.stringify(accounts, null, 2), { mode: 0o600 }); console.log(`Synthetic identities ready (${parsed.actors.length}, ${result.created} created). Local access details are in ignored .local/synthetic-accounts.json.`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
