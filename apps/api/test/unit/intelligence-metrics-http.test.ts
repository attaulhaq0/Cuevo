import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import type { IdentityService } from '../../src/platform/identity/identity.service';
import type { Database } from '../../src/platform/database/database';
import { createImprovementController } from '../../src/modules/improvement/improvement.controller';
describe('intelligence metrics operation authority',()=>{it('denies coordinator metrics before any private run query',async()=>{
 let queries=0;
 const identity={resolve:async()=>({userId:'20000000-0000-4000-8000-000000000002',schoolId:'10000000-0000-4000-8000-000000000001',membershipId:'21000000-0000-4000-8000-000000000002',role:'coordinator',entitlements:['improvement']})}as unknown as IdentityService;
 const database={actorTransaction:async()=>{queries++;return{};}}as unknown as Database;
 const controller=createImprovementController(identity,database);@Module({controllers:[controller]})class TestModule{}
 const app=await NestFactory.create(TestModule,new FastifyAdapter({logger:false}),{logger:false});try{await app.init();const result=await app.getHttpAdapter().getInstance().inject({url:'/v1/intelligence/metrics'});expect(result.statusCode).toBe(403);expect(queries).toBe(0);}finally{await app.close();}
});});
