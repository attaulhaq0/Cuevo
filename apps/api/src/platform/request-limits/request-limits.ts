import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

/** Single API process budget; never stores tokens, IP addresses or request content. */
export class RequestBudget {
  private readonly entries = new Map<string, { startedAt: number; count: number }>();
  constructor(private readonly limit: number, private readonly windowMs = 60000, private readonly capacity = 10000) {}
  consume(key: string, now = Date.now()) {
    const entry = this.entries.get(key);
    if (entry && now - entry.startedAt < this.windowMs) {
      if (entry.count >= this.limit) return false;
      entry.count++;
      return true;
    }
    if (entry) this.entries.delete(key);
    if (this.entries.size >= this.capacity) {
      for (const [expiredKey, row] of this.entries) if (now - row.startedAt >= this.windowMs) this.entries.delete(expiredKey);
      if (this.entries.size >= this.capacity) return false;
    }
    this.entries.set(key, { startedAt: now, count: 1 });
    return true;
  }
}

export function registerRequestLimits(instance: FastifyInstance, limits: { reads?: number; writes?: number; addresses?: number; readiness?: number } = {}) {
  const reads = new RequestBudget(limits.reads ?? 600);
  const writes = new RequestBudget(limits.writes ?? 120);
  const addresses = new RequestBudget(limits.addresses ?? 3000);
  const readiness = new RequestBudget(limits.readiness ?? 120);
  const digest = (value: string) => createHash('sha256').update(value).digest('hex');
  const refusals = new WeakMap<FastifyRequest, { code: 'REQUEST_LIMIT_REACHED'; message: string; requestId: string }>();
  instance.addHook('onRequest', async request => {
    if (request.url.split('?')[0] === '/health/ready') {
      if (!readiness.consume(digest(request.ip))) refusals.set(request, { code: 'REQUEST_LIMIT_REACHED', message: 'Readiness checks are temporarily limited.', requestId: request.id });
      return;
    }
    if (!request.url.startsWith('/v1/') || request.method === 'OPTIONS') return;
    const address = digest(request.ip);
    const authorization = request.headers.authorization;
    const key = typeof authorization === 'string' ? digest(authorization) : address;
    const budget = request.method === 'GET' || request.method === 'HEAD' ? reads : writes;
    if (!addresses.consume(address) || !budget.consume(key)) {
      refusals.set(request, {
        code: 'REQUEST_LIMIT_REACHED', message: 'Please wait before retrying this school request.', requestId: request.id,
      });
    }
  });
  return {
    isRefused: (request: FastifyRequest) => refusals.has(request),
    finish: (request: FastifyRequest, reply: FastifyReply) => {
      const refusal = refusals.get(request);
      if (!refusal) return;
      refusals.delete(request);
      return reply.code(429).header('Cache-Control', 'no-store').header('Retry-After', '60').send(refusal);
    },
  };
}
