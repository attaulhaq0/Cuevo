import { Controller, Get, Post, Req, Res, type Type } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiHeader } from '@nestjs/swagger';
import { z } from 'zod';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { DomainError } from '@cuevo/domain';
import type { IdentityService } from '../../platform/identity/identity.service';
import type { Database } from '../../platform/database/database';
import { ParentConversationService, conversationCommands, type ConversationCommand, type ConversationResource } from './conversation.service';
const body=(command:ConversationCommand)=>ApiBody({required:true,schema:z.toJSONSchema(conversationCommands[command],{target:'openapi-3.0'})as never});
export function createParentConversationController(identity:IdentityService,database:Database):Type<unknown>{const service=new ParentConversationService(database);
 @Controller('/v1/community/conversations')@ApiBearerAuth()class ParentConversationController{
  private async respond(r:FastifyRequest,p:FastifyReply,run:(actor:Awaited<ReturnType<IdentityService['resolve']>>)=>Promise<unknown>){try{const school=r.headers['x-school-id'];if(Array.isArray(school))throw new DomainError('INVALID_INPUT',400,'School selection invalid.');const actor=await identity.resolve(r.headers.authorization,school);return p.code(200).header('Cache-Control','no-store').send(await run(actor));}catch(error){const safe=error instanceof DomainError?error:new DomainError('REQUEST_UNAVAILABLE',503,'Conversation temporarily unavailable.');return p.code(safe.status).header('Cache-Control','no-store').send({code:safe.code,message:safe.message,requestId:r.id});}}
  private list(r:FastifyRequest,p:FastifyReply,resource:ConversationResource){return this.respond(r,p,actor=>service.list(actor,resource,(r.params as{id?:string}).id??null,r.query));}
  private command(r:FastifyRequest,p:FastifyReply,command:ConversationCommand){return this.respond(r,p,actor=>service.command(actor,command,(r.params as{id?:string}).id??null,r.body,r.headers['idempotency-key'],r.id));}
  @Get('/policy')policy(@Req()r:FastifyRequest,@Res()p:FastifyReply){return this.list(r,p,'policy');}
  @Post('/policy')@body('policy')@ApiHeader({name:'Idempotency-Key',required:true})approve(@Req()r:FastifyRequest,@Res()p:FastifyReply){return this.command(r,p,'policy');}
  @Get('/choices')choices(@Req()r:FastifyRequest,@Res()p:FastifyReply){return this.list(r,p,'choices');}
  @Get('/')threads(@Req()r:FastifyRequest,@Res()p:FastifyReply){return this.list(r,p,'threads');}
  @Post('/')@body('create')@ApiHeader({name:'Idempotency-Key',required:true})create(@Req()r:FastifyRequest,@Res()p:FastifyReply){return this.command(r,p,'create');}
  @Get('/:id')thread(@Req()r:FastifyRequest,@Res()p:FastifyReply){return this.list(r,p,'thread');}
  @Get('/:id/messages')messages(@Req()r:FastifyRequest,@Res()p:FastifyReply){return this.list(r,p,'messages');}
  @Post('/:id/messages')@body('send')@ApiHeader({name:'Idempotency-Key',required:true})send(@Req()r:FastifyRequest,@Res()p:FastifyReply){return this.command(r,p,'send');}
  @Get('/:id/reports')reports(@Req()r:FastifyRequest,@Res()p:FastifyReply){return this.list(r,p,'reports');}
  @Post('/messages/:id/read')@body('read')@ApiHeader({name:'Idempotency-Key',required:true})read(@Req()r:FastifyRequest,@Res()p:FastifyReply){return this.command(r,p,'read');}
  @Post('/messages/:id/report')@body('report')@ApiHeader({name:'Idempotency-Key',required:true})report(@Req()r:FastifyRequest,@Res()p:FastifyReply){return this.command(r,p,'report');}
  @Post('/messages/:id/moderate')@body('moderate')@ApiHeader({name:'Idempotency-Key',required:true})moderate(@Req()r:FastifyRequest,@Res()p:FastifyReply){return this.command(r,p,'moderate');}
  @Post('/:id/state')@body('state')@ApiHeader({name:'Idempotency-Key',required:true})state(@Req()r:FastifyRequest,@Res()p:FastifyReply){return this.command(r,p,'state');}
 }
 return ParentConversationController;
}

