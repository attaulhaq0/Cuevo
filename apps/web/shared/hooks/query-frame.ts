export type QueryReadContext = {
  apiUrl: string; accessToken: string | null;
  membership: { userId: string; schoolId: string; role: string } | null;
  accessGeneration: number; status: string; online: boolean;
};
/** Private in-memory source identity; never render or persist this credential-bearing key. */
export function queryReadFrame(app: QueryReadContext, path: string | null, refresh: number): string {
  return JSON.stringify([app.apiUrl, app.accessToken, app.membership?.userId, app.membership?.schoolId,
    app.membership?.role, app.accessGeneration, app.status, app.online, path, refresh]);
}
export function queryReadEnabled(app: QueryReadContext, path: string | null): boolean {
  return !!path && app.status === 'ready' && app.online && !!app.membership && !!app.accessToken;
}
