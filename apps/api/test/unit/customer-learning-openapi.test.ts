import 'reflect-metadata';
import {describe,expect,it}from'vitest';
import {Module}from'@nestjs/common';
import{NestFactory}from'@nestjs/core';
import{FastifyAdapter,type NestFastifyApplication}from'@nestjs/platform-fastify';
import{DocumentBuilder,SwaggerModule}from'@nestjs/swagger';
import{createSchoolLearningController}from'../../src/modules/school-learning/learning.controller';
import type{Database}from'../../src/platform/database/database';
import type{IdentityService}from'../../src/platform/identity/identity.service';
describe('customer learning generated API contract',()=>{
 it('describes paging, source completion and staff context returned by the learning API',async()=>{
  const controller=createSchoolLearningController({}as IdentityService,{}as Database);@Module({controllers:[controller]})class TestModule{}
  const app=await NestFactory.create<NestFastifyApplication>(TestModule,new FastifyAdapter({logger:false}),{logger:false});
  try{await app.init();const document=SwaggerModule.createDocument(app,new DocumentBuilder().build());const detail=document.paths['/v1/courses/{id}'].get!;
   const schema=(detail.responses!['200']as unknown as{content:Record<string,{schema:Record<string,unknown>}>}).content['application/json'].schema;
   expect(schema.properties).toMatchObject({selectedUnitId:{nullable:true},nextUnitCursor:{nullable:true},nextLessonCursor:{nullable:true},nextUnitSequence:{type:'integer'},curriculumContext:{type:'object'}});
   const properties=schema.properties as Record<string,Record<string,unknown>>;expect(JSON.stringify(properties.units)).toContain('completion');expect(JSON.stringify(properties.units)).toContain('nextLessonSequence');
   const people=(document.paths['/v1/people'].get!.responses!['200']as unknown as{content:Record<string,{schema:Record<string,unknown>}>}).content['application/json'].schema;expect(JSON.stringify(people)).toContain('classLabels');
   const assessments=(document.paths['/v1/assessments'].get!.responses!['200']as unknown as{content:Record<string,{schema:Record<string,unknown>}>}).content['application/json'].schema;
   const assessmentItems=(assessments.properties as Record<string,{items:{properties:Record<string,unknown>}}>).items.items;
   expect(assessmentItems.properties.currentSubmission).toMatchObject({type:'object',nullable:true,properties:{status:{enum:['SUBMITTED','RETURNED','RESUBMITTED','CLOSED']},returnId:{nullable:true},returnFeedback:{nullable:true},previousSubmissionId:{nullable:true},sourceReturnId:{nullable:true}}});
   expect(assessmentItems.properties).toMatchObject({status:{enum:['DRAFT','PUBLISHED']},preparationVersion:{minimum:1},intendedSubmissionKind:{enum:['TEXT','QUIZ']},intendedModel:{enum:['numeric','rubric']}});expect(document.paths['/v1/assessments/{id}/preparation']?.post).toBeDefined();expect(document.paths['/v1/assessments/{id}/publish']?.post).toBeDefined();
  }finally{await app.close();}
 });
});
