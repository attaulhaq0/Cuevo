import { DomainError, requireCapability, type ActorContext } from '@cuevo/domain';
import { paginationSchema } from '@cuevo/contracts';
import type { Database } from '../../platform/database/database';

/** Current source authorization and equivalent saved-source checks remain SQL-owned. */
export class RecommendationPageService {
  constructor(private readonly database: Database) {}
  async read(actor: ActorContext, query: unknown) {
    requireCapability(actor, actor.schoolId, 'improvement', ['admin', 'coordinator', 'teacher']);
    const parsed = paginationSchema.safeParse(query);
    if (!parsed.success) throw new DomainError('INVALID_INPUT', 400, 'Review the proposal page selection.');
    return this.database.actorTransaction(actor.userId, actor.schoolId, async client => {
      const page = (await client.query('select internal.read_current_recommendation_page($1,$2)as page', [parsed.data.limit, parsed.data.cursor ?? null])).rows[0]?.page;
      if (!page || !Array.isArray(page.items) || page.items.length > parsed.data.limit || !(page.nextCursor === null || typeof page.nextCursor === 'string')) throw new DomainError('REQUEST_UNAVAILABLE', 503, 'The current proposal page is unconfirmed.');
      return page;
    });
  }
}
