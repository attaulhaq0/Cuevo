import { Controller, Get, Post, Req, Res, type Type } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiHeader, ApiOkResponse, ApiQuery } from '@nestjs/swagger';
import { z } from 'zod';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { DomainError } from '@cuevo/domain';
import { thinkingFocusResponseSchema, thinkingFocusHistorySchema, thinkingFocusQueueSchema, thinkingFocusSnapshotSchema, thinkingFocusCatalogueSchema,thinkingFocusMaterialManifestSchema } from '@cuevo/contracts';
import type { IdentityService } from '../../platform/identity/identity.service';
import type { Database } from '../../platform/database/database';
import { ThinkingFocusService, thinkingFocusCommands, type ThinkingFocusCommand } from './thinking-focus.service';
import { createAssetStorage, assetContentDisposition, type AssetStoragePort } from '../assets/public';
const response=(schema:z.ZodType)=>ApiOkResponse({schema:z.toJSONSchema(schema,{target:'openapi-3.0'}) as never});
const body=(command:ThinkingFocusCommand)=>ApiBody({required:true,schema:z.toJSONSchema(thinkingFocusCommands[command],{target:'openapi-3.0'}) as never});
export function createThinkingFocusController(identity:IdentityService,database:Database,config:{url?:string;secret?:string}={},storage?:AssetStoragePort):Type<unknown> {
  const service=new ThinkingFocusService(database,identity,storage??createAssetStorage(config));
  @Controller('/v1/thinking-focus') @ApiBearerAuth() class ThinkingFocusController {
    private async respond(request:FastifyRequest,reply:FastifyReply,run:(actor:Awaited<ReturnType<IdentityService['resolve']>>)=>Promise<unknown>|unknown) {
      try { const school=request.headers['x-school-id']; if(Array.isArray(school))throw new DomainError('INVALID_INPUT',400,'School selection is invalid.'); const actor=await identity.resolve(request.headers.authorization,school); return reply.code(200).header('Cache-Control','no-store').send(await run(actor)); }
      catch(error) { const safe=error instanceof DomainError?error:new DomainError('REQUEST_UNAVAILABLE',503,'Task focus temporarily unavailable.'); return reply.code(safe.status).header('Cache-Control','no-store').send({code:safe.code,message:safe.message,requestId:request.id}); }
    }
    private command(request:FastifyRequest,reply:FastifyReply,command:ThinkingFocusCommand) { const target=request.params as {kind:string;id:string}; return this.respond(request,reply,actor=>service.command(actor,command,target.kind,target.id,request.query,request.body,request.headers['idempotency-key'],request.id)); }
    @Get('/catalogue') @response(thinkingFocusCatalogueSchema) catalogue(@Req()r:FastifyRequest,@Res()p:FastifyReply){return this.respond(r,p,a=>service.catalogue(a));}
    @Get('/courses/:id') @response(thinkingFocusQueueSchema) @ApiQuery({name:'limit',required:false,type:Number}) @ApiQuery({name:'cursor',required:false,type:String}) queue(@Req()r:FastifyRequest,@Res()p:FastifyReply){return this.respond(r,p,a=>service.queue(a,(r.params as {id:string}).id,r.query));}
    @Get('/sources/:kind/:id') @response(thinkingFocusSnapshotSchema) snapshot(@Req()r:FastifyRequest,@Res()p:FastifyReply){const t=r.params as {kind:string;id:string};return this.respond(r,p,a=>service.snapshot(a,t.kind,t.id));}
    @Get('/:kind/:id/materials') @response(thinkingFocusMaterialManifestSchema) @ApiQuery({name:'sourceVersion',required:true,type:String}) @ApiQuery({name:'criterionKey',required:false,type:String}) materials(@Req()r:FastifyRequest,@Res()p:FastifyReply){const t=r.params as{kind:string;id:string};return this.respond(r,p,a=>service.materials(a,t.kind,t.id,r.query));}
    @Get('/:kind/:id/materials/:resourceId/:revisionId/download') @ApiQuery({name:'sourceVersion',required:true,type:String}) @ApiQuery({name:'criterionKey',required:false,type:String}) download(@Req()r:FastifyRequest,@Res()p:FastifyReply){const t=r.params as{kind:string;id:string;resourceId:string;revisionId:string};return this.respond(r,p,async()=>{const school=r.headers['x-school-id'];if(Array.isArray(school))throw new DomainError('INVALID_INPUT',400,'School selection is invalid.');const result=await service.materialDownload(r.headers.authorization,school,t.kind,t.id,t.resourceId,t.revisionId,r.query);p.header('Content-Type',result.asset.contentType).header('Content-Disposition',assetContentDisposition(result.asset.name)).header('X-Content-Type-Options','nosniff');return result.bytes;});}
    @Get('/:kind/:id') @response(thinkingFocusResponseSchema) @ApiQuery({name:'criterionKey',required:false,type:String}) current(@Req()r:FastifyRequest,@Res()p:FastifyReply){const t=r.params as {kind:string;id:string};return this.respond(r,p,a=>service.read(a,t.kind,t.id,r.query));}
    @Get('/:kind/:id/history') @response(thinkingFocusHistorySchema) @ApiQuery({name:'criterionKey',required:false,type:String}) history(@Req()r:FastifyRequest,@Res()p:FastifyReply){const t=r.params as {kind:string;id:string};return this.respond(r,p,a=>service.history(a,t.kind,t.id,r.query));}
    @Post('/:kind/:id/draft') @body('draft') @response(thinkingFocusResponseSchema) @ApiHeader({name:'Idempotency-Key',required:true}) draft(@Req()r:FastifyRequest,@Res()p:FastifyReply){return this.command(r,p,'draft');}
    @Post('/:kind/:id/review') @body('review') @response(thinkingFocusResponseSchema) @ApiHeader({name:'Idempotency-Key',required:true}) review(@Req()r:FastifyRequest,@Res()p:FastifyReply){return this.command(r,p,'review');}
  }
  return ThinkingFocusController;
}
