import 'reflect-metadata';
import { Controller, Get, Module, Req, Res } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import helmet from '@fastify/helmet';
import { SwaggerModule, DocumentBuilder, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { DomainError } from '@cuevo/domain';
import { parseServerConfig, type ServerConfig } from '@cuevo/config';
import { Database } from './database/database';
import { IdentityService, type MembershipRow } from './identity/identity.service';
import { createUserVerifier, isAuthReady } from './identity/supabase-auth';
import { createSchoolLearningController } from './school-learning/controller';
import { createAcademicController } from './academic/controller';
import { createLearnerStateController } from './learner-state/controller';

export async function createApp(config: ServerConfig = parseServerConfig(process.env)) {
  const database = new Database(config.databaseUrl);
  const identity = new IdentityService({
    verifyUser: createUserVerifier(config),
    currentMemberships: userId => database.actorTransaction(userId, undefined, async client => (await client.query<MembershipRow>('select * from "authorization".current_memberships()')).rows),
    isCurrentSession: (userId, sessionId) => database.actorTransaction(userId, undefined, async client => Boolean((await client.query<{ active: boolean }>('select "authorization".is_current_session($1::uuid) as active', [sessionId])).rows[0]?.active)),
  });
  @Controller()
  class FoundationController {
    @Get('/health/live') @ApiOperation({ summary: 'Process liveness' })
    live() { return { status: 'ok', service: 'cuevo-api' }; }
    @Get('/health/ready') @ApiOperation({ summary: 'Dependency readiness' })
    async ready(@Res({ passthrough: true }) reply: FastifyReply) {
      const [dbReady, authReady] = await Promise.all([database.ready(), isAuthReady(config)]);
      reply.code(dbReady && authReady ? 200 : 503).header('Cache-Control', 'no-store');
      return { status: dbReady && authReady ? 'ready' : 'unavailable', database: dbReady, authentication: authReady };
    }
    @Get('/v1/me') @ApiBearerAuth() @ApiOperation({ summary: 'Current verified membership' })
    async me(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
      const schoolHeader = request.headers['x-school-id'];
      try {
        if (Array.isArray(schoolHeader)) throw new DomainError('INVALID_SCHOOL', 400, 'School selection is invalid.');
        const membership = await identity.resolve(request.headers.authorization, schoolHeader);
        return reply.header('Cache-Control', 'no-store').send(membership);
      } catch (error) {
        const safe = error instanceof DomainError ? error : new DomainError('REQUEST_UNAVAILABLE', 503, 'This request is temporarily unavailable.');
        return reply.code(safe.status).header('Cache-Control', 'no-store').send({ code: safe.code, message: safe.message, requestId: request.id });
      }
    }
  }
  @Module({ controllers: [FoundationController, createSchoolLearningController(identity, database), createAcademicController(identity, database), createLearnerStateController(identity, database)] }) class FoundationModule {}
  const adapter = new FastifyAdapter({ bodyLimit: 1024 * 1024, requestIdHeader: false, logger: false });
  const app = await NestFactory.create<NestFastifyApplication>(FoundationModule, adapter, { logger: ['error', 'warn'] });
  await app.register(helmet);
  app.enableCors({ origin: config.allowedOrigin, credentials: false, allowedHeaders: ['Authorization', 'Content-Type', 'X-School-Id', 'Idempotency-Key'], exposedHeaders: ['X-Request-Id'] });
  const instance = adapter.getInstance();
  instance.addHook('onRequest', async (request, reply) => { reply.header('X-Request-Id', request.id); });
  const document = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('Cuevo API').setDescription('Cuevo by E Deviser. Server-owned school operations.').setVersion('0.1.0').addBearerAuth().build());
  SwaggerModule.setup('openapi', app, document, { ui: false, jsonDocumentUrl: 'openapi.json' });
  await app.init(); await instance.ready();
  return { app, database, close: async () => { await app.close(); await database.close(); } };
}
