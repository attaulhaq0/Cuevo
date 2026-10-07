import { createHash } from 'node:crypto';
import { expect, type Locator, type Page, type Request } from '@playwright/test';
import { parseMembership } from '../../apps/web/shared/session/membership';
import { z } from 'zod';

// This bounded test projection checks only the source basis used by the
// read-only opener. Application parsing and authorization remain with owners.
const roomProjection = z.object({ id: z.uuid(), classId: z.uuid(), ownerId: z.uuid(), type: z.enum(['CLASS', 'GROUP']), revision: z.number().int().positive().optional(), name: z.string().min(1), status: z.string().min(1), canModerate: z.boolean() });
const roomPage = z.object({ items: z.array(roomProjection).max(100), nextCursor: z.uuid().nullable() }).refine(value => new Set(value.items.map(item => item.id)).size === value.items.length);
type Room = z.infer<typeof roomProjection>;

const observers = new WeakMap<Page, CommunityGroupLifecycle>();
const fingerprint = (value: string) => createHash('sha256').update(value).digest('hex');
const basis = (room: Room) => JSON.stringify([room.id, room.classId, room.ownerId, room.type, room.revision ?? 1, room.name, room.status, room.canModerate]);
const failure = () => new Error('Current group review opening requires an unchanged authorized source and completed read-only activation.');

/** Observe existing HTTP reads only. No API request, role selection or command
 * is added; credentials stay in transient request hashes, never in evidence. */
export class CommunityGroupLifecycle {
  private pending = new Set<Request>();
  private requests = new Map<Request, { kind: 'membership' | 'rooms'; token: string; school: string | undefined; origin: string; generation: number }>();
  private generations = { membership: 0, rooms: 0 };
  private membership: { identity: string; token: string; school: string; origin: string } | null = null;
  private room: { value: Room; token: string; school: string | undefined; origin: string } | null = null;
  private active = false;
  private refused = false;
  private original: { identity: string; token: string; school: string; origin: string; room: string } | null = null;

  constructor(private page: Page, private roomId: string) {
    page.on('request', request => {
      const url = new URL(request.url());
      if (this.active && this.original?.origin === url.origin && request.method() !== 'GET' && request.method() !== 'OPTIONS') this.refused = true;
      if (request.method() !== 'GET' || !['/v1/me', '/v1/community/rooms'].includes(url.pathname)) return;
      const headers = request.headers();
      const token = headers.authorization ? fingerprint(headers.authorization) : '';
      const kind = url.pathname === '/v1/me' ? 'membership' : 'rooms';
      if (this.active && (token !== this.original?.token || url.origin !== this.original.origin || headers['x-school-id'] && headers['x-school-id'] !== this.original.school)) this.refused = true;
      if (kind === 'membership' || !url.searchParams.has('cursor')) this.generations[kind]++;
      if (kind === 'rooms' && !url.searchParams.has('cursor')) this.room = null;
      this.requests.set(request, { kind, token, school: headers['x-school-id'], origin: url.origin, generation: this.generations[kind] });
      this.pending.add(request);
    });
    page.on('response', response => {
      const request = response.request(), source = this.requests.get(request);
      if (!source) return;
      const current = () => this.requests.get(request) === source && source.generation === this.generations[source.kind];
      void (async () => {
        try {
          if (!current()) return;
          const incomplete = await response.finished();
          if (!current()) return;
          if (incomplete) throw failure();
          if (response.status() !== 200) throw failure();
          const value: unknown = await response.json();
          if (!current()) return;
          if (source.kind === 'membership') {
            const membership = parseMembership(value);
            if (!['teacher', 'admin'].includes(membership.role) || source.school && source.school !== membership.schoolId) throw failure();
            const identity = JSON.stringify([membership.userId, membership.schoolId, membership.role]);
            if (this.active && (identity !== this.original?.identity || source.token !== this.original.token)) throw failure();
            this.membership = { identity, token: source.token, school: membership.schoolId, origin: source.origin };
          } else {
            const page = roomPage.parse(value);
            const room = page.items.find(item => item.id === this.roomId);
            if (room) {
              if (room.type !== 'GROUP' || !room.canModerate || this.active && basis(room) !== this.original?.room) throw failure();
              this.room = { value: room, token: source.token, school: source.school, origin: source.origin };
            } else if (!page.nextCursor && !this.room) throw failure();
          }
        } catch {
          if (current()) this.refused = true;
        } finally {
          this.pending.delete(request);
          this.requests.delete(request);
        }
      })();
    });
    page.on('requestfailed', request => {
      if (!this.requests.has(request)) return;
      this.pending.delete(request);
      const source = this.requests.get(request)!;
      this.requests.delete(request);
      if (source.generation === this.generations[source.kind] && request.failure()?.errorText !== 'net::ERR_ABORTED') this.refused = true;
    });
  }

  private admitted() {
    if (this.refused) throw failure();
    if (this.pending.size || !this.membership || !this.room) return false;
    const { membership, room } = this;
    if (!membership.token || membership.token !== room.token || membership.school !== room.school || membership.origin !== room.origin) throw failure();
    if (this.original && (membership.identity !== this.original.identity || membership.token !== this.original.token || membership.school !== this.original.school || membership.origin !== this.original.origin || basis(room.value) !== this.original.room)) throw failure();
    return true;
  }

  async open(): Promise<Locator> {
    await expect.poll(() => this.admitted(), { timeout: 5000 }).toBe(true);
    const membership = this.membership!, room = this.room!;
    this.original = { ...membership, room: basis(room.value) };
    this.active = true;
    const form = this.page.getByRole('region', { name: 'Review group lifecycle', exact: true });
    try {
      await expect(form).toHaveCount(0);
      let opened = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        await expect.poll(() => this.admitted(), { timeout: 5000 }).toBe(true);
        if (await form.count()) throw failure();
        const opener = this.page.getByRole('button', { name: 'Review group lifecycle', exact: true });
        await expect(opener).toBeEnabled({ timeout: 5000 });
        if (!this.admitted()) throw failure();
        // A source refresh can cancel native activation between pointer-down
        // and pointer-up even when Playwright's click resolves successfully.
        // Only repeat this read-only opener before any working form exists.
        await opener.click({ timeout: 5000 });
        await expect.poll(async () => {
          if (this.refused) throw failure();
          return this.admitted() && (!await opener.count() || await opener.isEnabled());
        }, { timeout: 5000 }).toBe(true);
        await this.page.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
        if (!this.admitted()) throw failure();
        if (await form.count()) { opened = true; break; }
      }
      if (!opened) throw failure();
      await expect(form).toHaveCount(1);
      await expect(form.getByLabel('Group name', { exact: true })).toBeEnabled({ timeout: 5000 });
      await expect(form.getByLabel('Group name', { exact: true })).toHaveValue(room.value.name);
      await expect(form.getByLabel('Group state', { exact: true })).toHaveValue(room.value.status);
      await expect(form.getByLabel('Reason', { exact: true })).toHaveValue('');
      await expect(form.getByLabel('I approve this group lifecycle change', { exact: true })).not.toBeChecked();
      if (!this.admitted()) throw failure();
      return form;
    } finally {
      this.active = false;
    }
  }
}

export function observeCommunityGroupLifecycle(page: Page, roomId: string) {
  if (observers.has(page)) throw failure();
  const observer = new CommunityGroupLifecycle(page, roomId);
  observers.set(page, observer);
  return observer;
}
