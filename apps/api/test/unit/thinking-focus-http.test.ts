import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { PoolClient } from 'pg';
import { DomainError } from '@cuevo/domain';
import type { IdentityService } from '../../src/platform/identity/identity.service';
import type { Database } from '../../src/platform/database/database';
import { createThinkingFocusController } from '../../src/modules/school-learning/thinking-focus.controller';

const id='00000000-0000-4000-8000-000000000001';
const actor={userId:id,schoolId:id,membershipId:id,role:'teacher' as const,entitlements:['learning','curriculum','assessment']};
const row={schemaVersion:'1',target:{kind:'ACTIVITY',id,criterionKey:null},courseId:id,targetTitle:'Use a procedure',sourceVersion:'source:1',status:'UNCLASSIFIED',revision:0,classification:null,source:{title:'Use a procedure',instructions:'Use the given example.',contentRevision:1,preparationVersion:null,policyVersion:null,rubricVersion:null,criterionTitle:null},canAuthor:true,canReview:false};
async function app(query:(sql:string,values:unknown[])=>unknown,allowed=true) {
  const identity={resolve:async(authorization:unknown,school:unknown)=>{if(!allowed||authorization!=='Bearer verified'||school!==id)throw new DomainError('UNAUTHENTICATED',401,'Sign in again.');return actor;}}as unknown as IdentityService;
  const database={actorTransaction:async(user:string,school:string,run:(c:PoolClient)=>Promise<unknown>)=>{expect([user,school]).toEqual([id,id]);return run({query:async(sql:string,values:unknown[])=>({rows:[{response:query(sql,values)}]})}as unknown as PoolClient);}}as unknown as Database;
  const controller=createThinkingFocusController(identity,database);@Module({controllers:[controller]})class TestModule{}
  const application=await NestFactory.create<NestFastifyApplication>(TestModule,new FastifyAdapter({logger:false}),{logger:false});await application.init();await application.getHttpAdapter().getInstance().ready();return application;
}
const headers={authorization:'Bearer verified','x-school-id':id};
describe('thinking focus HTTP purpose boundary',()=>{
  it('routes bounded course queue before target kind and emits verified no-store receipts',async()=>{
    const calls:string[]=[];const application=await app(sql=>{calls.push(sql);return sql.includes('read_thinking_focus_course')?{schemaVersion:'1',courseId:id,items:[row],nextCursor:null}:row;});
    try{const response=await application.inject({method:'GET',url:`/v1/thinking-focus/courses/${id}`,headers});expect(response.statusCode).toBe(200);expect(response.headers['cache-control']).toBe('no-store');expect(response.json().items[0].targetTitle).toBe('Use a procedure');expect(calls[0]).toContain('read_thinking_focus_course');
      const invalid=await application.inject({method:'GET',url:`/v1/thinking-focus/criterion/${id}`,headers});expect(invalid.statusCode).toBe(400);expect(calls).toHaveLength(1);
      const document=SwaggerModule.createDocument(application,new DocumentBuilder().build());expect(document.paths['/v1/thinking-focus/{kind}/{id}/review']?.post?.requestBody).toBeDefined();
    }finally{await application.close();}
  });
  it('denies missing verified identity before SQL and returns safe errors without database details',async()=>{
    let count=0;const denied=await app(()=>{count++;return row;},false);
    try{const response=await denied.inject({method:'GET',url:`/v1/thinking-focus/activity/${id}`,headers});expect(response.statusCode).toBe(401);expect(count).toBe(0);}finally{await denied.close();}
    const unavailable=await app(()=>{throw{code:'42501',message:'private SQL content',detail:'secret diagnostic'};});
    try{const response=await unavailable.inject({method:'GET',url:`/v1/thinking-focus/activity/${id}`,headers});expect(response.statusCode).toBe(403);expect(response.body).not.toContain('private SQL');expect(response.headers['cache-control']).toBe('no-store');}finally{await unavailable.close();}
  });
});
