import { Controller, Get, Post, Req, Res, type Type } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiHeader } from '@nestjs/swagger';
import { z } from 'zod';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { DomainError } from '@cuevo/domain';
import { resourceStageSchema, resourceAttachSchema, resourceRevisionSchema, resourceRemoveSchema, resourcePublishSchema, assetFinalizeSchema } from '@cuevo/contracts';
import type { IdentityService } from '../../platform/identity/identity.service';
import type { Database } from '../../platform/database/database';
import { createAssetStorage, assetContentDisposition, type AssetStoragePort } from '../assets/public';
import { LearningResourceService, type ResourceCommand } from './resource.service';
const body = (schema: z.ZodType) => ApiBody({ required: true, schema: z.toJSONSchema(schema,{ target: 'openapi-3.0' }) as never });
export function createLearningResourceController(identity: IdentityService, database: Database, config: { url?: string; secret?: string }, injectedStorage?: AssetStoragePort): Type<unknown> {
  const service = new LearningResourceService(identity,database,injectedStorage ?? createAssetStorage(config));
  @Controller('/v1') @ApiBearerAuth() @ApiHeader({name:'X-School-Id',required:false}) class LearningResourceController {
    private context(request: FastifyRequest) { const school = request.headers['x-school-id']; if (Array.isArray(school)) throw new DomainError('INVALID_INPUT',400,'School selection invalid.'); return { header: request.headers.authorization, school }; }
    private async respond(request: FastifyRequest, reply: FastifyReply, action: () => Promise<unknown>) { try { return reply.code(200).header('Cache-Control','no-store').send(await action()); } catch (error) { const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''; const safe = error instanceof DomainError ? error : new DomainError(code === '42501' ? 'FORBIDDEN' : ['22023','23505','55000'].includes(code) ? 'RESOURCE_REQUIRES_REVIEW' : 'REQUEST_UNAVAILABLE',code === '42501' ? 403 : ['22023','23505','55000'].includes(code) ? 409 : 503,'Resource access requires review or is temporarily unavailable.'); return reply.code(safe.status).header('Cache-Control','no-store').send({code:safe.code,message:safe.message,requestId:request.id}); } }
    private command(request: FastifyRequest, reply: FastifyReply, command: Exclude<ResourceCommand,'finalize'>) { return this.respond(request,reply,async () => { const context = this.context(request); const params = request.params as { courseId: string; kind?: string; targetId?: string; resourceId?: string }; return service.command(context.header,context.school,command,params.courseId,params.kind??null,params.targetId??null,params.resourceId??null,request.body,request.headers['idempotency-key'],request.id); }); }
    @Get('/courses/:courseId/resources/:kind/:targetId') list(@Req()r:FastifyRequest,@Res()p:FastifyReply) { return this.respond(r,p,async () => { const c=this.context(r);const s=r.params as{courseId:string;kind:string;targetId:string};return service.list(c.header,c.school,s.courseId,s.kind,s.targetId,r.query); }); }
    @Post('/courses/:courseId/resource-assets') @body(resourceStageSchema) @ApiHeader({name:'Idempotency-Key',required:true}) stage(@Req()r:FastifyRequest,@Res()p:FastifyReply) { return this.command(r,p,'stage'); }
    @Post('/courses/:courseId/resource-assets/:assetId/finalize') @body(assetFinalizeSchema) @ApiHeader({name:'Idempotency-Key',required:true}) finalize(@Req()r:FastifyRequest,@Res()p:FastifyReply) { return this.respond(r,p,async()=>{const c=this.context(r);const s=r.params as{courseId:string;assetId:string};return service.finalize(c.header,c.school,s.courseId,s.assetId,r.body,r.headers['idempotency-key'],r.id);}); }
    @Post('/courses/:courseId/resources/:kind/:targetId') @body(resourceAttachSchema) @ApiHeader({name:'Idempotency-Key',required:true}) attach(@Req()r:FastifyRequest,@Res()p:FastifyReply) { return this.command(r,p,'attach'); }
    @Post('/courses/:courseId/resources/:resourceId/replace') @body(resourceRevisionSchema) @ApiHeader({name:'Idempotency-Key',required:true}) replace(@Req()r:FastifyRequest,@Res()p:FastifyReply) { return this.command(r,p,'replace'); }
    @Post('/courses/:courseId/resources/:resourceId/remove') @body(resourceRemoveSchema) @ApiHeader({name:'Idempotency-Key',required:true}) remove(@Req()r:FastifyRequest,@Res()p:FastifyReply) { return this.command(r,p,'remove'); }
    @Post('/courses/:courseId/resources/:resourceId/publish') @body(resourcePublishSchema) @ApiHeader({name:'Idempotency-Key',required:true}) publish(@Req()r:FastifyRequest,@Res()p:FastifyReply) { return this.command(r,p,'publish'); }
    @Get('/learning-resources/:resourceId/revisions/:revisionId/download') download(@Req()r:FastifyRequest,@Res()p:FastifyReply) { return this.respond(r,p,async()=>{const c=this.context(r);const s=r.params as{resourceId:string;revisionId:string};const result=await service.download(c.header,c.school,s.resourceId,s.revisionId);p.header('Content-Type',result.asset.contentType).header('Content-Disposition',assetContentDisposition(result.asset.name)).header('X-Content-Type-Options','nosniff');return result.bytes;}); }
  }
  return LearningResourceController;
}
