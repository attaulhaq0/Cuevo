import { Controller, Get, Post, Req, Res, type Type } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { DomainError } from '@cuevo/domain';
import type { IdentityService } from '../identity/identity.service';
import type { Database } from '../database/database';
import { BrowserDiagnosticsService } from './browser-diagnostics.service';

export function createBrowserDiagnosticsController(identity: IdentityService, database: Database): Type<unknown> {
  const service = new BrowserDiagnosticsService(database);
  @Controller('/v1/diagnostics') @ApiBearerAuth()
  class BrowserDiagnosticsController {
    @Get('/config') async config(@Req() request: FastifyRequest, @Res() reply: FastifyReply) { return this.handle(request, reply, false); }
    @Post('/browser') async record(@Req() request: FastifyRequest, @Res() reply: FastifyReply) { return this.handle(request, reply, true); }
    private async handle(request: FastifyRequest, reply: FastifyReply, recording: boolean) {
      try {
        const school = request.headers['x-school-id']; const key = request.headers['idempotency-key'];
        if (Array.isArray(school) || Array.isArray(key)) throw new DomainError('INVALID_DIAGNOSTIC', 400, 'Browser diagnostic request is invalid.');
        const actor = await identity.resolve(request.headers.authorization, school);
        const result = recording ? await service.record(actor, request.body, key, request.id) : await service.config(actor);
        return reply.code(200).header('Cache-Control', 'no-store').send(result);
      } catch (error) {
        const safe = error instanceof DomainError ? error : new DomainError('DIAGNOSTICS_UNAVAILABLE', 503, 'Browser diagnostics are temporarily unavailable.');
        return reply.code(safe.status).header('Cache-Control', 'no-store').send({ code: safe.code, message: safe.message, requestId: request.id });
      }
    }
  }
  return BrowserDiagnosticsController;
}
