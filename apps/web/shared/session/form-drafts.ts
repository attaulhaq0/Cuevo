export type FormValues = Record<string, string | boolean>;
type Draft = { values: FormValues; basis: Record<string, unknown> };

/** Private working input survives only within the current verified browser session. */
export class FormDrafts {
  private drafts = new Map<string, Draft>();
  get(slot: string): Draft | undefined { return this.drafts.get(slot); }
  first(prefix: string): string | undefined { return [...this.drafts.keys()].find(slot => slot.startsWith(prefix)); }
  save(slot: string, values: FormValues, basis: Record<string, unknown>) {
    this.drafts.set(slot, { values: { ...values }, basis: { ...basis } });
  }
  model<T>(slot: string): T | undefined { return this.drafts.get(slot)?.basis.model as T | undefined; }
  saveModel(slot: string, model: unknown) {
    const previous = this.drafts.get(slot);
    this.drafts.set(slot, { values: previous?.values ?? {}, basis: { ...previous?.basis, model } });
  }
  remove(slot: string) { this.drafts.delete(slot); }
  consume(slot: string, submitted: Draft | undefined): boolean {
    if (this.drafts.get(slot) !== submitted) return false;
    this.drafts.delete(slot); return true;
  }
  clearRead(scope: string, path: string) {
    const endpoint = path.split('?')[0];
    const prefix = endpoint.startsWith('/v1/assessments/') ? endpoint.replace(/\/(draft|quiz).*$/, '') : endpoint.split('/').slice(0, 3).join('/');
    for (const slot of this.drafts.keys()) if (slot.startsWith(scope) && slot.includes(prefix)) this.drafts.delete(slot);
    const assessment = endpoint.match(/^\/v1\/assessments\/([^/]+)\/draft$/)?.[1];
    if (assessment) this.drafts.delete(`${scope}assessment-response:${assessment}`);
    const documentAssessment = endpoint.match(/^\/v1\/assessments\/([^/]+)\/work-draft$/)?.[1];
    if (documentAssessment) {
      this.drafts.delete(`${scope}submission-document-answer:${documentAssessment}`);
      this.drafts.delete(`${scope}submission-documents:${documentAssessment}`);
      if (this.model(`${scope}selected-document-assessment`) === documentAssessment) this.drafts.delete(`${scope}selected-document-assessment`);
    }
    const room = endpoint.match(/^\/v1\/community\/rooms\/([^/]+)(?:\/|$)/)?.[1];
    if (room) for (const slot of this.drafts.keys()) {
      if (slot === `${scope}community-post:${room}` || slot === `${scope}community-mentions:${room}` || slot.startsWith(`${scope}community-reply:${room}:`)) this.drafts.delete(slot);
    }
    if (endpoint.startsWith('/v1/school/')) for (const slot of this.drafts.keys()) {
      if (slot.startsWith(`${scope}attendance-correction:`)) this.drafts.delete(slot);
    }
    if (endpoint.startsWith('/v1/development/')) for (const slot of this.drafts.keys()) {
      if (slot.startsWith(`${scope}leaderboard-participation:`)) this.drafts.delete(slot);
    }
    // Queue loss invalidates the source selection; a nested read failure still clears
    // private feedback above, but cannot erase an IDs-only editor navigation choice.
    if (endpoint === '/v1/submissions') for (const slot of this.drafts.keys()) {
      if (slot.startsWith(`${scope}teacher-submission-editor:`)) this.drafts.delete(slot);
    }
  }
  clear() { this.drafts.clear(); }
}
