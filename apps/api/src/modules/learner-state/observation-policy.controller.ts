import { Controller, Get, Post, Req, Res, type Type } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiHeader, ApiResponse } from '@nestjs/swagger';
import { z } from 'zod';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { DomainError, type ActorContext } from '@cuevo/domain';
import { learnerObservationPolicyInputSchema, learnerObservationPolicyStatusSchema, learnerObservationPolicyReceiptSchema } from '@cuevo/contracts';
import type { IdentityService } from '../../platform/identity/identity.service';
import type { Database } from '../../platform/database/database';
import { LearnerObservationPolicyService } from './observation-policy.service';
const schema=(value:z.ZodType)=>z.toJSONSchema(value,{target:'openapi-3.0'})as never;
export function createLearnerObservationPolicyController(identity:IdentityService,database:Database):Type<unknown>{
 const service=new LearnerObservationPolicyService(database);
 @Controller('/v1/learner-observation-policy')@ApiBearerAuth()@ApiHeader({name:'X-School-Id',required:true})
 class LearnerObservationPolicyController{
  private async respond(request:FastifyRequest,reply:FastifyReply,run:(actor:ActorContext)=>Promise<unknown>){try{const school=request.headers['x-school-id'];if(typeof school!=='string'||!z.uuid().safeParse(school).success)throw new DomainError('INVALID_SCHOOL',400,'Select the current school for observation policy review.');const actor=await identity.resolve(request.headers.authorization,school);return reply.code(200).header('Cache-Control','no-store').send(await run(actor));}catch(error){const safe=error instanceof DomainError?error:new DomainError('REQUEST_UNAVAILABLE',503,'Learning observation policy is temporarily unavailable.');return reply.code(safe.status).header('Cache-Control','no-store').send({code:safe.code,message:safe.message,requestId:request.id});}}
  @Get()@ApiResponse({status:200,schema:schema(learnerObservationPolicyStatusSchema)})read(@Req()request:FastifyRequest,@Res()reply:FastifyReply){return this.respond(request,reply,actor=>service.read(actor));}
  @Post()@ApiHeader({name:'Idempotency-Key',required:true})@ApiBody({required:true,schema:schema(learnerObservationPolicyInputSchema)})@ApiResponse({status:200,schema:schema(learnerObservationPolicyReceiptSchema)})approve(@Req()request:FastifyRequest,@Res()reply:FastifyReply){return this.respond(request,reply,actor=>service.approve(actor,request.body,request.headers['idempotency-key'],request.id));}
 }
 return LearnerObservationPolicyController;
}
