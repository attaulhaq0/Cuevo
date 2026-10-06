import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { IdentityService } from '../../src/platform/identity/identity.service';
import type { Database } from '../../src/platform/database/database';
import { createImprovementController } from '../../src/modules/improvement/improvement.controller';

describe('intelligence API documentation', () => {
  it('describes explicit approval inputs, safe status and reservation responses', async () => {
    const controller = createImprovementController({} as IdentityService, {} as Database);
    @Module({ controllers: [controller] }) class TestModule {}
    const app = await NestFactory.create(TestModule, new FastifyAdapter({ logger: false }), { logger: false });
    try {
      await app.init();
      const document = SwaggerModule.createDocument(app, new DocumentBuilder().addBearerAuth().build());
      for (const [path, fields] of [
        ['/v1/intelligence/budget', ['currency', 'schoolDailyLimit', 'actorDailyLimit', 'maxConcurrentRuns', 'expectedVersion', 'confirmApproval', 'reason']],
        ['/v1/intelligence/policy', ['purpose', 'dataClassification', 'fixtureEnabled', 'liveEnabled', 'allowedActions', 'expectedVersion', 'confirmApproval', 'reason']],
      ] as const) {
        const operation = document.paths[path].post!;
        expect(operation.parameters).toContainEqual(expect.objectContaining({ name: 'Idempotency-Key', in: 'header', required: true }));
        expect(operation.requestBody).toMatchObject({ required: true, content: { 'application/json': { schema: { required: expect.arrayContaining([...fields]), additionalProperties: false, properties: { confirmApproval: { enum: [true] } } } } } });
        expect(document.paths[path].get!.responses['200']).toMatchObject({ content: { 'application/json': { schema: { properties: { policy: expect.any(Object) } } } } });
      }
      const budget = document.paths['/v1/intelligence/budget'].get!.responses['200'];
      expect(budget).toMatchObject({ content: { 'application/json': { schema: { properties: { period: { enum: ['UTC_DAY'] }, billedCost: expect.any(Object) } } } } });
      const list = document.paths['/v1/intelligence/runs'].get!;
      expect(list.parameters).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: 'cursor', in: 'query' }),
        expect.objectContaining({ name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 25 } }),
      ]));
      expect(list.responses['200']).toMatchObject({ content: { 'application/json': { schema: { properties: { items: { items: { properties: { state: { enum: ['REASONING', 'PROPOSAL_READY', 'FAILED'] } } } }, nextCursor: expect.any(Object) } } } } });
      const detail = document.paths['/v1/intelligence/runs/{id}'].get!;
      expect(detail.parameters).toContainEqual(expect.objectContaining({ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }));
      const responses = JSON.stringify([list.responses['200'], detail.responses['200']]);
      for (const privateField of ['leaseToken', 'commandKey', 'contextDetails', 'promptBody']) expect(responses).not.toContain(privateField);
      const review = document.paths['/v1/intelligence/runs/{id}/review'].post!;
      expect(review.parameters).toContainEqual(expect.objectContaining({ name: 'Idempotency-Key', in: 'header', required: true }));
      expect(review.requestBody).toMatchObject({ required: true, content: { 'application/json': { schema: { properties: { usefulness: { enum: ['USEFUL', 'NOT_USEFUL', 'UNKNOWN'] }, confirmReview: { enum: [true] } } } } } });
      const help = document.paths['/v1/interventions/{id}/help'].post!;
      expect(help.parameters).toContainEqual(expect.objectContaining({ name: 'Idempotency-Key', in: 'header', required: true }));
      expect(help.requestBody).toMatchObject({ required: true, content: { 'application/json': { schema: { properties: { kind: { enum: ['INSTRUCTIONS', 'WORKED_EXAMPLE', 'FEEDBACK'] }, confirmSend: { enum: [true] } } } } } });
      const choice = document.paths['/v1/interventions/{id}/choices'].post!;
      expect(choice.parameters).toContainEqual(expect.objectContaining({ name: 'Idempotency-Key', in: 'header', required: true }));
      expect(choice.requestBody).toMatchObject({ required: true, content: { 'application/json': { schema: { properties: { activityId: { format: 'uuid' }, confirmChoice: { enum: [true] } } } } } });
      expect(document.paths['/v1/intelligence/execution'].get!.responses['200']).toMatchObject({content:{'application/json':{schema:{properties:{status:{enum:['APPROVED','REQUIRES_APPROVAL','SERVER_UNAVAILABLE']}}}}}});
    } finally {
      await app.close();
    }
  });
});
