import { Controller,Get,Post,Req,Res,type Type } from '@nestjs/common';
import { ApiBearerAuth,ApiBody,ApiHeader } from '@nestjs/swagger';
import { z } from 'zod';
import type { FastifyRequest,FastifyReply } from 'fastify';
import { DomainError } from '@cuevo/domain';
import type { IdentityService } from '../../platform/identity/identity.service';
import type { Database } from '../../platform/database/database';
import type { LearningContentResource } from '@cuevo/contracts';
import { LearningContentService,learningContentCommands,type LearningContentCommand } from './content.service';
const body=(command:LearningContentCommand)=>ApiBody({required:true,schema:z.toJSONSchema(learningContentCommands[command],{target:'openapi-3.0'})as never});
export function createLearningContentController(identity:IdentityService,database:Database):Type<unknown>{const service=new LearningContentService(database);
 @Controller('/v1/learning-content')@ApiBearerAuth()class LearningContentController{
  private async respond(r:FastifyRequest,p:FastifyReply,run:(actor:Awaited<ReturnType<IdentityService['resolve']>>)=>Promise<unknown>){try{const school=r.headers['x-school-id'];if(Array.isArray(school))throw new DomainError('INVALID_INPUT',400,'School selector invalid.');const actor=await identity.resolve(r.headers.authorization,school);return p.code(200).header('Cache-Control','no-store').send(await run(actor));}catch(error){const safe=error instanceof DomainError?error:new DomainError('REQUEST_UNAVAILABLE',503,'Learning source temporarily unavailable.');return p.code(safe.status).header('Cache-Control','no-store').send({code:safe.code,message:safe.message,requestId:r.id});}}
  private read(r:FastifyRequest,p:FastifyReply,history=false){const source=r.params as{resource:LearningContentResource;id:string};return this.respond(r,p,actor=>service.read(actor,source.resource,source.id,history,r.query));}
  private command(r:FastifyRequest,p:FastifyReply,kind:LearningContentCommand){const source=r.params as{resource:LearningContentResource;id:string};return this.respond(r,p,actor=>service.command(actor,kind,source.resource,source.id,r.body,r.headers['idempotency-key'],r.id));}
  @Get('/sources/submission/:id')submissionContext(@Req()r:FastifyRequest,@Res()p:FastifyReply){return this.respond(r,p,actor=>service.context(actor,'submission',(r.params as{id:string}).id));}
  @Get('/sources/completion/:id')completionContext(@Req()r:FastifyRequest,@Res()p:FastifyReply){return this.respond(r,p,actor=>service.context(actor,'completion',(r.params as{id:string}).id));}
  @Get('/activities/:id/task-choices')taskChoices(@Req()r:FastifyRequest,@Res()p:FastifyReply){return this.respond(r,p,actor=>service.taskChoices(actor,(r.params as{id:string}).id,r.query));}
  @Get('/activities/:id/task')task(@Req()r:FastifyRequest,@Res()p:FastifyReply){return this.respond(r,p,actor=>service.task(actor,(r.params as{id:string}).id));}
  @Get('/:resource/:id')source(@Req()r:FastifyRequest,@Res()p:FastifyReply){return this.read(r,p);}
  @Get('/:resource/:id/history')history(@Req()r:FastifyRequest,@Res()p:FastifyReply){return this.read(r,p,true);}
  @Post('/:resource/:id/draft')@body('draft')@ApiHeader({name:'Idempotency-Key',required:true})draft(@Req()r:FastifyRequest,@Res()p:FastifyReply){return this.command(r,p,'draft');}
  @Post('/:resource/:id/publish')@body('publish')@ApiHeader({name:'Idempotency-Key',required:true})publish(@Req()r:FastifyRequest,@Res()p:FastifyReply){return this.command(r,p,'publish');}
  @Post('/:resource/:id/retire')@body('retire')@ApiHeader({name:'Idempotency-Key',required:true})retire(@Req()r:FastifyRequest,@Res()p:FastifyReply){return this.command(r,p,'retire');}
 }
 return LearningContentController;
}



