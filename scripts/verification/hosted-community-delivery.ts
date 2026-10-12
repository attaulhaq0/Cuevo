import { z } from 'zod';
import { canonicalReleaseExecutionJson } from './release-review';

const schoolId = '10000000-0000-4000-8000-000000000001';
const teacherId = '20000000-0000-4000-8000-000000000004', studentId = '20000000-0000-4000-8000-000000000012';
const uuid = z.uuid(), digest = z.string().regex(/^[a-f0-9]{64}$/), date = z.iso.datetime({ offset: true });
const operation = z.enum(['room.create', 'member.configure', 'post.create', 'reaction.configure', 'post.report', 'room.restrict', 'post.moderate', 'announcement.create', 'notification.read', 'group.lifecycle', 'announcement.withdraw']);
const commandSchema = z.object({ eventId: uuid, operation, intentRecordSha256: digest, id: uuid, nativeReceiptSha256: digest, httpReceiptObserved: z.literal(true) }).strict();
const issuedActor = z.object({ actorId: z.enum([teacherId, studentId]), generation: z.number().int().positive().max(13) });
const invalidationSchema = issuedActor.extend({ eventId: uuid, roomId: uuid, schoolId: z.literal(schoolId),
  joinProof: z.object({ joinRef: z.string().regex(/^[0-9]{1,20}$/), replyRef: z.string().regex(/^[0-9]{1,20}$/) }).strict(), observedAt: date }).strict();
const rereadSchema = issuedActor.extend({ eventId: uuid, roomId: uuid, schoolId: z.literal(schoolId), path: z.string().max(200),
  status: z.literal(200), requestId: z.string().regex(/^[-A-Za-z0-9_.:]{1,200}$/), observedAt: date, sourceIds: z.array(uuid).max(100).optional() }).strict();
const identitySchema = z.object({ schoolId: z.literal(schoolId), groupId: uuid, observedAfter: date, observedBefore: date }).strict();
const inputSchema = z.object({ commands: z.array(commandSchema).min(15).max(18), invalidations: z.array(invalidationSchema).min(1).max(100),
  rereads: z.array(rereadSchema).min(1).max(100), identity: identitySchema }).strict();
export type HostedCommunityDeliveryInput = z.infer<typeof inputSchema>;
export type HostedCommunityDeliveryResult = { status: 'DELIVERY_CORRELATED' | 'REQUIRES_REVIEW'; eventIds: string[]; hostedAcceptance: false; nativeExecutionVerified: false };
/** Empty means unobserved. This parser keeps the shared minimized row shape;
 * parsing supplied facts never proves a real authorized response. */
export function parseHostedCommunityDeliveryReads(value: unknown): HostedCommunityDeliveryInput['rereads'] {
  try { return z.array(rereadSchema).max(100).parse(JSON.parse(canonicalReleaseExecutionJson(value))); }
  catch { throw Error('Hosted Community delivery reads require review; private contents withheld.'); }
}
const empty = (): HostedCommunityDeliveryResult => ({ status: 'REQUIRES_REVIEW', eventIds: [], hostedAcceptance: false, nativeExecutionVerified: false });
const validEpoch = (actor: z.infer<typeof issuedActor>) => actor.actorId === teacherId ? [1, 5, 9, 13].includes(actor.generation) : [3, 7].includes(actor.generation);
const recipe = ['room.create', 'member.configure', 'member.configure', 'post.create', 'post.create', 'reaction.configure', 'reaction.configure', 'post.create', 'post.report', 'room.restrict', 'room.restrict', 'post.moderate', 'post.moderate', 'announcement.create', 'notification.read', 'member.configure', 'group.lifecycle', 'announcement.withdraw'] as const;

/** Pure correlation of supplied minimized observations. The protected consumer
 * must obtain its native summary and real current-session response evidence
 * independently; this function never grants native or hosted authority. */
export function validateHostedCommunityDelivery(value: unknown): HostedCommunityDeliveryResult {
  try {
    const input = inputSchema.parse(JSON.parse(canonicalReleaseExecutionJson(value))), { commands, invalidations, rereads, identity } = input;
    if (![15, 18].includes(commands.length) || commands.some((command, index) => command.operation !== recipe[index])
      || new Set(commands.map(row => row.eventId)).size !== commands.length || new Set(commands.map(row => row.intentRecordSha256)).size !== commands.length) return empty();
    const after = Date.parse(identity.observedAfter), before = Date.parse(identity.observedBefore);
    if (before < after || new Set(invalidations.map(row => row.eventId)).size !== invalidations.length) return empty();
    const normalEvents = new Set(commands.filter(row => !['announcement.create', 'notification.read', 'group.lifecycle', 'announcement.withdraw'].includes(row.operation)).map(row => row.eventId));
    const delivery = new Map<string, z.infer<typeof invalidationSchema>>(), requestIds = new Set<string>();
    for (const row of invalidations) {
      const observed = Date.parse(row.observedAt);
      if (!normalEvents.has(row.eventId) || row.roomId !== identity.groupId || !validEpoch(row) || row.joinProof.joinRef !== row.joinProof.replyRef || observed < after || observed > before) return empty();
      delivery.set(row.eventId, row);
    }
    const correlated = new Set<string>(); let nativePostProjected = false;
    for (const row of rereads) {
      const event = delivery.get(row.eventId), observed = Date.parse(row.observedAt);
      if (!event || row.roomId !== identity.groupId || row.actorId !== event.actorId || row.generation !== event.generation || !validEpoch(row)
        || observed < Date.parse(event.observedAt) || observed > before || requestIds.has(row.requestId)
        || !['/v1/me', '/v1/community/rooms?limit=100', '/v1/community/rooms/' + identity.groupId + '/posts?limit=100'].includes(row.path)
        || row.sourceIds && new Set(row.sourceIds).size !== row.sourceIds.length) return empty();
      requestIds.add(row.requestId); correlated.add(row.eventId);
      const command = commands.find(command => command.eventId === row.eventId);
      if (row.path === '/v1/community/rooms/' + identity.groupId + '/posts?limit=100' && command?.operation === 'post.create'
        && row.sourceIds?.includes(command.id)) nativePostProjected = true;
    }
    if (!correlated.size || !nativePostProjected || invalidations.some(row => !correlated.has(row.eventId))) return empty();
    return { status: 'DELIVERY_CORRELATED', eventIds: [...correlated].sort(), hostedAcceptance: false, nativeExecutionVerified: false };
  } catch { return empty(); }
}
