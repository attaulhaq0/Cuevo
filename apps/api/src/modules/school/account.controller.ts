import { Controller, Get, Post, Req, Res, type Type } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiHeader, ApiResponse } from '@nestjs/swagger';
import { z } from 'zod';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { DomainError, requireCapability } from '@cuevo/domain';
import { schoolAccountInviteSchema, schoolAccountInvitationRevokeSchema, schoolAccountClaimSchema, schoolAccountInvitationReceiptSchema, schoolAccountInvitationPageSchema, schoolAccountClaimReceiptSchema, schoolAccountDeliveryRequestSchema, schoolAccountEffectReceiptSchema, schoolAccountEffectStatusSchema, schoolAccountRecoveryRequestSchema, schoolAccountRecoveryAuthorizationSchema, schoolAccountRecoveryCompletionSchema, schoolAccountRecoveryReceiptSchema } from '@cuevo/contracts';
import type { IdentityService, AccountIdentityService } from '../../platform/identity/identity.service';
import type { Database } from '../../platform/database/database';
import { SchoolAccountService } from './account.service';
import type { SchoolAccountEffectsService } from './account-effects.service';

const schema = (value: z.ZodType) => z.toJSONSchema(value, { target: 'openapi-3.0' }) as never;
export function createSchoolAccountController(identity: IdentityService, accountIdentity: AccountIdentityService, database: Database, effects?: SchoolAccountEffectsService): Type<unknown> {
  const service = new SchoolAccountService(database);
  @Controller('/v1') @ApiBearerAuth()
  class SchoolAccountController {
    private async respond(request: FastifyRequest, reply: FastifyReply, action: () => Promise<unknown>) {
      try { return reply.code(200).header('Cache-Control', 'no-store').send(await action()); }
      catch (error) {
        const safe = error instanceof DomainError ? error : new DomainError('ACCOUNT_OUTCOME_UNKNOWN', 503, 'The account request could not be confirmed. Reconcile the original request.');
        return reply.code(safe.status).header('Cache-Control', 'no-store').send({ code: safe.code, message: safe.message, requestId: request.id });
      }
    }
    private async administrator(request: FastifyRequest) {
      const school = request.headers['x-school-id'];
      if (typeof school !== 'string' || !z.uuid().safeParse(school).success) throw new DomainError('INVALID_SCHOOL', 400, 'Select the current school for this account operation.');
      return identity.resolve(request.headers.authorization, school);
    }
    @Post('/school/accounts/invitations') @ApiHeader({ name: 'X-School-Id', required: true }) @ApiHeader({ name: 'Idempotency-Key', required: true }) @ApiBody({ required: true, schema: schema(schoolAccountInviteSchema) }) @ApiResponse({ status: 200, schema: schema(schoolAccountInvitationReceiptSchema) })
    invite(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
      return this.respond(request, reply, async () => service.invite(await this.administrator(request), request.body, request.headers['idempotency-key'], request.id));
    }
    @Get('/school/accounts/invitations') @ApiHeader({ name: 'X-School-Id', required: true }) @ApiResponse({ status: 200, schema: schema(schoolAccountInvitationPageSchema) })
    list(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
      return this.respond(request, reply, async () => service.list(await this.administrator(request), request.query));
    }
    @Post('/school/accounts/invitations/:id/revoke') @ApiHeader({ name: 'X-School-Id', required: true }) @ApiHeader({ name: 'Idempotency-Key', required: true }) @ApiBody({ required: true, schema: schema(schoolAccountInvitationRevokeSchema) }) @ApiResponse({ status: 200, schema: schema(schoolAccountInvitationReceiptSchema) })
    revoke(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
      return this.respond(request, reply, async () => service.revoke(await this.administrator(request), (request.params as { id: string }).id, request.body, request.headers['idempotency-key'], request.id));
    }
    @Post('/account/school-admission/claim') @ApiHeader({ name: 'Idempotency-Key', required: true }) @ApiBody({ required: true, schema: schema(schoolAccountClaimSchema) }) @ApiResponse({ status: 200, schema: schema(schoolAccountClaimReceiptSchema) })
    claim(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
      return this.respond(request, reply, async () => {
        if (request.headers['x-school-id'] !== undefined) throw new DomainError('INVALID_SCHOOL', 400, 'The approved invitation determines its school.');
        return service.claim(await accountIdentity.resolve(request.headers.authorization), request.body, request.headers['idempotency-key'], request.id);
      });
    }
    @Post('/school/accounts/invitations/:id/deliver') @ApiHeader({ name: 'X-School-Id', required: true }) @ApiBody({ required: true, schema: schema(schoolAccountDeliveryRequestSchema) }) @ApiResponse({ status: 200, schema: schema(schoolAccountEffectReceiptSchema) })
    deliver(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
      return this.respond(request, reply, async () => {
        const actor = await this.administrator(request); requireCapability(actor, actor.schoolId, 'school.operations', ['admin']);
        const input = schoolAccountDeliveryRequestSchema.safeParse(request.body); const id = z.uuid().safeParse((request.params as { id: string }).id);
        if (!input.success || !id.success) throw new DomainError('INVALID_INPUT', 400, 'Review the exact invitation before delivery.');
        const status = await service.effectStatus(actor, id.data);
        if (status.receipt && ['COMPLETED', 'FAILED'].includes(status.state)) return status.receipt;
        if (!effects) throw new DomainError('ACCOUNT_DELIVERY_UNAVAILABLE', 503, 'Invitation delivery is unavailable.');
        const result = schoolAccountEffectReceiptSchema.safeParse(await effects.execute(actor, id.data));
        if (!result.success || result.data.id !== id.data || result.data.schoolId !== actor.schoolId) throw new DomainError('ACCOUNT_OUTCOME_UNKNOWN', 503, 'Invitation delivery could not be confirmed. Review the original invitation.');
        return result.data;
      });
    }
    @Get('/school/accounts/invitations/:id/delivery') @ApiHeader({ name: 'X-School-Id', required: true }) @ApiResponse({ status: 200, schema: schema(schoolAccountEffectStatusSchema) })
    deliveryStatus(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
      return this.respond(request, reply, async () => service.effectStatus(await this.administrator(request), (request.params as { id: string }).id));
    }
    @Post('/school/accounts/:id/recovery') @ApiHeader({ name: 'X-School-Id', required: true }) @ApiHeader({ name: 'Idempotency-Key', required: true }) @ApiBody({ schema: schema(schoolAccountRecoveryRequestSchema) }) @ApiResponse({ status: 200, schema: schema(schoolAccountInvitationReceiptSchema) })
    requestRecovery(@Req() request: FastifyRequest, @Res() reply: FastifyReply) { return this.respond(request, reply, async () => service.requestRecovery(await this.administrator(request), (request.params as { id: string }).id, request.body, request.headers['idempotency-key'], request.id)); }
    @Post('/account/recovery/authorize') @ApiHeader({ name: 'Idempotency-Key', required: true }) @ApiBody({ schema: schema(schoolAccountRecoveryAuthorizationSchema) }) @ApiResponse({ status: 200, schema: schema(schoolAccountRecoveryReceiptSchema) })
    authorizeRecovery(@Req() request: FastifyRequest, @Res() reply: FastifyReply) { return this.respond(request, reply, async () => { if (request.headers['x-school-id'] !== undefined) throw new DomainError('INVALID_SCHOOL', 400, 'The approved recovery determines its school.'); return service.recovery(await accountIdentity.resolve(request.headers.authorization), request.body, request.headers['idempotency-key'], request.id); }); }
    @Post('/account/recovery/complete') @ApiHeader({ name: 'Idempotency-Key', required: true }) @ApiBody({ schema: schema(schoolAccountRecoveryCompletionSchema) }) @ApiResponse({ status: 200, schema: schema(schoolAccountRecoveryReceiptSchema) })
    completeRecovery(@Req() request: FastifyRequest, @Res() reply: FastifyReply) { return this.respond(request, reply, async () => { if (request.headers['x-school-id'] !== undefined) throw new DomainError('INVALID_SCHOOL', 400, 'The approved recovery determines its school.'); return service.recovery(await accountIdentity.resolve(request.headers.authorization), request.body, request.headers['idempotency-key'], request.id, true); }); }
  }
  return SchoolAccountController;
}
