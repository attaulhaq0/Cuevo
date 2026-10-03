import { z } from 'zod';
import { submissionArtifactSchema } from '@cuevo/contracts';
import { DomainError, requireCapability, type ActorContext } from '@cuevo/domain';
import type { Database } from '../../platform/database/database';
import type { IdentityService } from '../../platform/identity/identity.service';
import { validateAssetBytes, type AssetRecord, type AssetStoragePort } from '../assets/public';
const safe=(error:unknown)=>{if(error instanceof DomainError)return error;const code=error&&typeof error==='object'&&'code'in error?String(error.code):'';return new DomainError(code==='42501'?'FORBIDDEN':['22023','55000'].includes(code)?'PORTFOLIO_SOURCE_REQUIRES_REVIEW':'REQUEST_UNAVAILABLE',code==='42501'?403:['22023','55000'].includes(code)?409:503,'Selected document access requires review or is unavailable.');};
const recordSchema=submissionArtifactSchema.safeExtend({ownerId:z.uuid(),objectPath:z.string().min(1)});
export class PortfolioArtifactService {
 constructor(private readonly identity:IdentityService,private readonly database:Database,private readonly storage?:AssetStoragePort){}
 async download(header:string|undefined,school:string|undefined,itemId:string,revisionId:string,assetId:string){try{
  if(![itemId,revisionId,assetId].every(value=>z.uuid().safeParse(value).success))throw new DomainError('INVALID_INPUT',400,'Portfolio source selection invalid.');
  const actor=await this.identity.resolve(header,school);requireCapability(actor,actor.schoolId,'portfolio',['admin','teacher','student','parent']);if(!this.storage)throw new DomainError('ASSET_STORAGE_UNAVAILABLE',503,'Private storage unavailable.');
  const read=(context:ActorContext)=>this.database.actorTransaction(context.userId,context.schoolId,async c=>{const parsed=recordSchema.safeParse((await c.query('select internal.portfolio_artifact_delivery($1,$2,$3)as asset',[itemId,revisionId,assetId])).rows[0]?.asset);if(!parsed.success||parsed.data.id!==assetId||parsed.data.state!=='AVAILABLE')throw new DomainError('FORBIDDEN',403,'Portfolio artifact unavailable.');return parsed.data as AssetRecord;});
  const asset=await read(actor);const bytes=await this.storage.download(asset.objectPath);validateAssetBytes(asset,bytes);
  const current=await this.identity.resolve(header,school);requireCapability(current,current.schoolId,'portfolio',['admin','teacher','student','parent']);if(current.userId!==actor.userId||current.schoolId!==actor.schoolId)throw new DomainError('FORBIDDEN',403,'Portfolio context changed.');
  const fresh=await read(current);if(fresh.id!==asset.id||fresh.ownerId!==asset.ownerId||fresh.sha256!==asset.sha256||fresh.byteSize!==asset.byteSize||fresh.contentType!==asset.contentType||fresh.name!==asset.name||fresh.objectPath!==asset.objectPath)throw new DomainError('FORBIDDEN',403,'Portfolio artifact changed.');return{asset:fresh,bytes};}catch(error){throw safe(error);}
 }
}

