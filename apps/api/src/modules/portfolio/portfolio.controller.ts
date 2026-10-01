import{Controller,Get,Post,Req,Res,type Type}from'@nestjs/common';import{ApiBearerAuth,ApiHeader,ApiBody}from'@nestjs/swagger';import{z}from'zod';import type{FastifyRequest,FastifyReply}from'fastify';import{DomainError}from'@cuevo/domain';
import{portfolioCreateSchema,portfolioReflectionSchema,portfolioReviewSchema,portfolioParentRevokeSchema}from'@cuevo/contracts';import type{IdentityService}from'../../platform/identity/identity.service';import type{Database}from'../../platform/database/database';import{PortfolioService,type PortfolioCommand}from'./portfolio.service';
const body=(schema:z.ZodType)=>ApiBody({required:true,schema:z.toJSONSchema(schema,{target:'openapi-3.0'})as never});
export function createPortfolioController(identity:IdentityService,database:Database):Type<unknown>{const service=new PortfolioService(database);
 @Controller('/v1/portfolio')@ApiBearerAuth()@ApiHeader({name:'X-School-Id',required:false})class PortfolioController{
 private async respond(req:FastifyRequest,res:FastifyReply,run:(actor:Awaited<ReturnType<IdentityService['resolve']>>)=>Promise<unknown>){try{const school=req.headers['x-school-id'];if(Array.isArray(school))throw new DomainError('INVALID_INPUT',400,'School selection is invalid.');const actor=await identity.resolve(req.headers.authorization,school);return res.code(200).header('Cache-Control','no-store').send(await run(actor));}catch(error){const safe=error instanceof DomainError?error:new DomainError('REQUEST_UNAVAILABLE',503,'Portfolio services are temporarily unavailable.');return res.code(safe.status).header('Cache-Control','no-store').send({code:safe.code,message:safe.message,requestId:req.id});}}
 private command(req:FastifyRequest,res:FastifyReply,command:PortfolioCommand){return this.respond(req,res,actor=>service.command(actor,command,(req.params as{id?:string}).id,req.body,req.headers['idempotency-key'],req.id));}
 @Get('/items')list(@Req()r:FastifyRequest,@Res()p:FastifyReply){return this.respond(r,p,a=>service.list(a,r.query));}
 @Get('/items/:id/history')history(@Req()r:FastifyRequest,@Res()p:FastifyReply){return this.respond(r,p,a=>service.list(a,r.query,(r.params as{id:string}).id));}
 @Post('/items')@body(portfolioCreateSchema)@ApiHeader({name:'Idempotency-Key',required:true})create(@Req()r:FastifyRequest,@Res()p:FastifyReply){return this.command(r,p,'create');}
 @Post('/items/:id/reflection')@body(portfolioReflectionSchema)@ApiHeader({name:'Idempotency-Key',required:true})reflection(@Req()r:FastifyRequest,@Res()p:FastifyReply){return this.command(r,p,'reflection');}
 @Post('/items/:id/review')@body(portfolioReviewSchema)@ApiHeader({name:'Idempotency-Key',required:true})review(@Req()r:FastifyRequest,@Res()p:FastifyReply){return this.command(r,p,'review');}
 @Post('/items/:id/parent-revoke')@body(portfolioParentRevokeSchema)@ApiHeader({name:'Idempotency-Key',required:true})revoke(@Req()r:FastifyRequest,@Res()p:FastifyReply){return this.command(r,p,'revoke');}
 }return PortfolioController;
}
