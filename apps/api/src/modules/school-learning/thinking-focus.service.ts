import { createHash } from 'node:crypto';
import { z } from 'zod';
import { DomainError, requireCapability, type ActorContext } from '@cuevo/domain';
import { idempotencyKeySchema, thinkingFocusTargetSchema, thinkingFocusDraftInputSchema, thinkingFocusReviewInputSchema, thinkingFocusResponseSchema, thinkingFocusHistorySchema, thinkingFocusQueueSchema, thinkingFocusSnapshotSchema, thinkingFocusQuerySchema, thinkingFocusHistoryQuerySchema, thinkingFocusMaterialsQuerySchema, thinkingFocusMaterialManifestSchema, learningResourceSchema, assetDisplayNameSchema, assetContentTypeSchema, type ThinkingFocusTarget, type ThinkingFocusResponse, type ThinkingFocusMaterialManifest } from '@cuevo/contracts';
import type { Database } from '../../platform/database/database';
import type { IdentityService } from '../../platform/identity/identity.service';
import { validateAssetBytes, type AssetRecord, type AssetStoragePort } from '../assets/public';
import { getThinkingFocusCatalogue, validateThinkingFocus } from '../curriculum/public';

export const thinkingFocusCommands = { draft:thinkingFocusDraftInputSchema, review:thinkingFocusReviewInputSchema };
export type ThinkingFocusCommand = keyof typeof thinkingFocusCommands;
const targetQuery = z.object({criterionKey:z.string().trim().min(1).max(100).optional()}).strict();
const historyQuery = thinkingFocusHistoryQuerySchema.extend({criterionKey:z.string().trim().min(1).max(100).optional()});
function parse<T>(schema:z.ZodType<T>, value:unknown):T { const result=schema.safeParse(value); if(!result.success)throw new DomainError('INVALID_INPUT',400,'Review the task focus fields.'); return result.data; }
function safe(error:unknown) { if(error instanceof DomainError)return error; const code=error&&typeof error==='object'&&'code' in error?String(error.code):''; return new DomainError(code==='42501'?'FORBIDDEN':['22023','23505','55000'].includes(code)?'THINKING_FOCUS_REQUIRES_REVIEW':'REQUEST_UNAVAILABLE',code==='42501'?403:['22023','23505','55000'].includes(code)?409:503,'Task focus needs current access or review.'); }
function target(kind:string,id:string,criterionKey?:string) { return parse(thinkingFocusTargetSchema,{kind:kind.toUpperCase(),id,criterionKey:criterionKey??null}); }
function readCapability(actor:ActorContext) { requireCapability(actor,actor.schoolId,'learning',['admin','teacher','coordinator','student']); }
function receipt<T>(schema:z.ZodType<T>, value:unknown, mutation=false):T { const result=schema.safeParse(value); if(!result.success)throw new DomainError(mutation?'THINKING_FOCUS_OUTCOME_UNKNOWN':'REQUEST_UNAVAILABLE',503,mutation?'Task focus receipt unconfirmed. Retry the same action.':'Task focus details unconfirmed.'); return result.data; }
function exactTarget(response:ThinkingFocusResponse,target:ThinkingFocusTarget,mutation=false) { if(response.target.kind!==target.kind||response.target.id!==target.id||response.target.criterionKey!==target.criterionKey||(mutation&&(!response.id||response.id!==response.classification?.id)))throw new DomainError(mutation?'THINKING_FOCUS_OUTCOME_UNKNOWN':'REQUEST_UNAVAILABLE',503,'Task focus source receipt unconfirmed.');return response; }
const materialAssetSchema=z.object({id:z.uuid(),ownerId:z.uuid(),name:assetDisplayNameSchema,contentType:assetContentTypeSchema,byteSize:z.number().int().positive().max(524288),sha256:z.string().regex(/^[a-f0-9]{64}$/),state:z.literal('AVAILABLE'),objectPath:z.string().min(1).max(2000)}).strict();
const materialDeliverySchema=z.object({manifest:thinkingFocusMaterialManifestSchema,resource:learningResourceSchema,asset:materialAssetSchema}).strict();
function exactManifest(raw:unknown,source:ThinkingFocusTarget,sourceVersion:string):ThinkingFocusMaterialManifest{const manifest=receipt(thinkingFocusMaterialManifestSchema,raw);if(manifest.target.kind!==source.kind||manifest.target.id!==source.id||manifest.target.criterionKey!==source.criterionKey||manifest.sourceVersion!==sourceVersion)throw new DomainError('REQUEST_UNAVAILABLE',503,'Review material source unconfirmed.');return manifest;}

export class ThinkingFocusService {
  constructor(private readonly database:Database,private readonly identity?:IdentityService,private readonly storage?:AssetStoragePort) {}
  private materialCapability(actor:ActorContext){requireCapability(actor,actor.schoolId,'learning',['admin','teacher','coordinator']);if(actor.role==='coordinator')requireCapability(actor,actor.schoolId,'curriculum',['coordinator']);}
  async materials(actor:ActorContext,kind:string,id:string,query:unknown){this.materialCapability(actor);const input=parse(thinkingFocusMaterialsQuerySchema,query),source=target(kind,id,input.criterionKey);try{return await this.database.actorTransaction(actor.userId,actor.schoolId,async c=>exactManifest((await c.query('select internal.read_thinking_focus_materials($1,$2,$3,$4)as response',[source.kind.toLowerCase(),source.id,source.criterionKey,input.sourceVersion])).rows[0]?.response,source,input.sourceVersion));}catch(error){throw safe(error);}}
  async materialDownload(header:string|undefined,school:string|undefined,kind:string,id:string,resourceId:string,revisionId:string,query:unknown){
    if(!this.identity||!this.storage)throw new DomainError('REQUEST_UNAVAILABLE',503,'Private review material storage unavailable.');
    const actor=await this.identity.resolve(header,school);this.materialCapability(actor);const input=parse(thinkingFocusMaterialsQuerySchema,query),source=target(kind,id,input.criterionKey);parse(z.uuid(),resourceId);parse(z.uuid(),revisionId);
    const read=async(current:ActorContext)=>this.database.actorTransaction(current.userId,current.schoolId,async c=>{const result=receipt(materialDeliverySchema,(await c.query('select internal.read_thinking_focus_material_delivery($1,$2,$3,$4,$5,$6)as response',[source.kind.toLowerCase(),source.id,source.criterionKey,input.sourceVersion,resourceId,revisionId])).rows[0]?.response);exactManifest(result.manifest,source,input.sourceVersion);const record=result.resource,asset=result.asset;if(record.id!==resourceId||record.revisionId!==revisionId||!result.manifest.items.some(item=>item.id===resourceId&&item.revisionId===revisionId&&JSON.stringify(item)===JSON.stringify(record))||record.assetId!==asset.id||record.name!==asset.name||record.contentType!==asset.contentType||record.byteSize!==asset.byteSize||record.sha256!==asset.sha256)throw new DomainError('REQUEST_UNAVAILABLE',503,'Review material revision unconfirmed.');return result;});
    try{const original=await read(actor),bytes=await this.storage.download(original.asset.objectPath);validateAssetBytes(original.asset as AssetRecord,bytes);const current=await this.identity.resolve(header,school);this.materialCapability(current);if(current.userId!==actor.userId||current.schoolId!==actor.schoolId)throw new DomainError('FORBIDDEN',403,'Review material access changed.');const fresh=await read(current);if(JSON.stringify(fresh)!==JSON.stringify(original))throw new DomainError('THINKING_FOCUS_REQUIRES_REVIEW',409,'Review material changed before delivery.');return{asset:fresh.asset,bytes};}catch(error){throw safe(error);}
  }
  catalogue(actor:ActorContext) { readCapability(actor); return getThinkingFocusCatalogue(); }
  async read(actor:ActorContext,kind:string,id:string,query:unknown) {
    readCapability(actor); const input=parse(targetQuery,query); const source=target(kind,id,input.criterionKey);
    try { return await this.database.actorTransaction(actor.userId,actor.schoolId,async client=>exactTarget(receipt(thinkingFocusResponseSchema,(await client.query('select internal.read_thinking_focus($1,$2,$3) as response',[source.kind.toLowerCase(),source.id,source.criterionKey])).rows[0]?.response),source)); } catch(error){throw safe(error);}
  }
  async history(actor:ActorContext,kind:string,id:string,query:unknown) {
    requireCapability(actor,actor.schoolId,'learning',['admin','teacher','coordinator']); const input=parse(historyQuery,query); const source=target(kind,id,input.criterionKey);
    try { return await this.database.actorTransaction(actor.userId,actor.schoolId,async client=>{const result=receipt(thinkingFocusHistorySchema,(await client.query('select internal.read_thinking_focus_history($1,$2,$3,$4,$5) as response',[source.kind.toLowerCase(),source.id,source.criterionKey,input.limit,input.cursor??null])).rows[0]?.response);if(result.target.kind!==source.kind||result.target.id!==source.id||result.target.criterionKey!==source.criterionKey)throw new DomainError('REQUEST_UNAVAILABLE',503,'Task focus history source unconfirmed.');return result;}); }catch(error){throw safe(error);}
  }
  async queue(actor:ActorContext,id:string,query:unknown) {
    requireCapability(actor,actor.schoolId,'learning',['admin','teacher','coordinator']); parse(z.uuid(),id); const input=parse(thinkingFocusQuerySchema,query);
    try { return await this.database.actorTransaction(actor.userId,actor.schoolId,async client=>{const result=receipt(thinkingFocusQueueSchema,(await client.query('select internal.read_thinking_focus_course($1,$2,$3) as response',[id,input.limit,input.cursor??null])).rows[0]?.response);if(result.courseId!==id)throw new DomainError('REQUEST_UNAVAILABLE',503,'Task focus review course unconfirmed.');return result;}); }catch(error){throw safe(error);}
  }
  async snapshot(actor:ActorContext,kind:string,id:string) {
    if(kind==='result')requireCapability(actor,actor.schoolId,'assessment',['admin','teacher','coordinator','student','parent']);else readCapability(actor); parse(z.enum(['completion','submission','result']),kind); parse(z.uuid(),id);
    try { return await this.database.actorTransaction(actor.userId,actor.schoolId,async client=>{const result=receipt(thinkingFocusSnapshotSchema,(await client.query('select internal.read_thinking_focus_snapshot($1,$2) as response',[kind,id])).rows[0]?.response);const matches=kind==='result'?result.kind==='submission'&&result.resultId===id:result.kind===kind&&result.id===id&&result.resultId===undefined;if(!matches)throw new DomainError('REQUEST_UNAVAILABLE',503,'Recorded task focus source unconfirmed.');return result;}); }catch(error){throw safe(error);}
  }
  async command(actor:ActorContext,command:ThinkingFocusCommand,kind:string,id:string,query:unknown,body:unknown,key:unknown,requestId:string) {
    requireCapability(actor,actor.schoolId,'learning',command==='draft'?['admin','teacher']:['admin','coordinator']);
    if(command==='review')requireCapability(actor,actor.schoolId,'curriculum',['admin','coordinator']);
    const filters=parse(targetQuery,query); const source=target(kind,id,filters.criterionKey); const input=parse(thinkingFocusCommands[command] as z.ZodType<Record<string,unknown>>,body); const identity=parse(idempotencyKeySchema,key);
    if(command==='draft')validateThinkingFocus(input.focus);
    const fingerprint=createHash('sha256').update(JSON.stringify({command,target:source,input})).digest('hex');
    try { return await this.database.actorTransaction(actor.userId,actor.schoolId,async client=>exactTarget(receipt(thinkingFocusResponseSchema,(await client.query('select internal.thinking_focus_command($1,$2,$3,$4,$5::jsonb,$6,$7,$8) as response',[command,source.kind.toLowerCase(),source.id,source.criterionKey,JSON.stringify(input),identity,fingerprint,requestId])).rows[0]?.response,true),source,true)); } catch(error){throw safe(error);}
  }
}
