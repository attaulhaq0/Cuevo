import type { Page } from '@playwright/test';
import { z } from 'zod';

type OriginKind = 'api' | 'auth' | 'web' | 'other';
type Source = { origin: OriginKind; path: string };
type Observation = Source & { sequence: number; kind: 'response' | 'request-failed' | 'console'; method: string | null; status: number | null; cancelled: boolean | null; unauthorizedConsole: boolean | null };
const apiSegments=new Set(['v1','me','curriculum','courses','classes','subjects','people','academic-references','assessments','submissions','results','marking','learning-content','thinking-focus','preparation','publish','draft','materials','availability','objectives','history','learning-summary','state','school','documents','diagnostics','config','support','resources','quiz','definition','attempts','reference','release','report-periods','other','{record}']);
const safePath=z.string().max(350).refine(path=>['unavailable','other','bounded-other','/','/_next/asset','/auth/other','/auth/v1/logout','/auth/v1/token','/auth/v1/user'].includes(path)||path.startsWith('/v1/')&&path.split('/').filter(Boolean).length<=10&&path.split('/').filter(Boolean).every(segment=>apiSegments.has(segment)));
const observation=z.object({origin:z.enum(['api','auth','web','other']),path:safePath,sequence:z.number().int().min(1).max(40),kind:z.enum(['response','request-failed','console']),method:z.enum(['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS']).nullable(),status:z.number().int().min(400).max(599).nullable(),cancelled:z.boolean().nullable(),unauthorizedConsole:z.boolean().nullable()}).strict();
const transportSchema=z.object({schemaVersion:z.literal('1'),code:z.literal('COURSE_OBJECTIVE_TRANSPORT_UNVERIFIED'),observations:z.array(observation).max(40),truncated:z.boolean()}).strict();
const focusSchema=z.object({schemaVersion:z.literal('1'),code:z.literal('PROGRESS_FOCUS_SOURCE_UNVERIFIED'),reads:z.array(z.object({path:safePath,status:z.number().int().min(100).max(599)}).strict()).max(20),truncated:z.boolean(),dom:z.object({locale:z.enum(['en','ar']).nullable(),direction:z.enum(['ltr','rtl']).nullable(),headingCount:z.number().int().nonnegative().max(1000),labelMatches:z.boolean().nullable(),headingFocused:z.boolean().nullable(),focusTag:z.enum(['BUTTON','INPUT','SELECT','TEXTAREA','A','H1','H2','H3','DIV','SECTION','SUMMARY','BODY','HTML','OTHER']).nullable(),classSelected:z.boolean().nullable(),classDisabled:z.boolean().nullable(),classRowCount:z.number().int().nonnegative().max(1000),loadingCount:z.number().int().nonnegative().max(1000),alertCount:z.number().int().nonnegative().max(1000)}).strict()}).strict();
/** Strict allowlisted diagnostics may enter CI logs; arbitrary strings never do. */
export function serializeFailureDiagnostic(value:unknown):string { return JSON.stringify(z.union([transportSchema,focusSchema]).parse(value)); }

/** Bounded transport metadata only; never response content, query strings or record IDs. */
export function diagnosticSource(raw: string, origins: { api: string; auth: string | null; web: string }): Source {
  let url: URL;
  try { url = new URL(raw); } catch { return { origin: 'other', path: 'unavailable' }; }
  const origin: OriginKind = url.origin === origins.api ? 'api' : url.origin === origins.auth ? 'auth' : url.origin === origins.web ? 'web' : 'other';
  if (origin === 'other') return { origin, path: 'other' };
  if (url.pathname.length > 300 || url.pathname.split('/').filter(Boolean).length > 10) return { origin, path: 'bounded-other' };
  if (origin === 'auth') return { origin, path: /^\/auth\/v1\/(?:logout|token|user)$/.test(url.pathname) ? url.pathname : '/auth/other' };
  if (origin === 'web') return { origin, path: url.pathname.startsWith('/_next/') ? '/_next/asset' : '/' };
  const segments = url.pathname.split('/').filter(Boolean);
  const path = segments.map(segment => /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(segment) ? '{record}' : apiSegments.has(segment) ? segment : 'other').join('/');
  return { origin, path: `/${path || 'other'}` };
}

/** Evidence delivery never replaces the protected assertion that produced it. */
export async function attachDiagnosticPreservingFailure<T>(verify:()=>Promise<T>,capture:()=>Promise<void>):Promise<T> {
  try { return await verify(); } catch (error) { try { await capture(); } catch { /* Preserve the exact original assertion if evidence delivery is unavailable. */ } throw error; }
}

export function observeCourseObjectiveTransport(page: Page, origins: { api: string; auth: string | null; web: string }) {
  const observations: Observation[] = []; let sequence = 0, truncated = false;
  const record = (value: Omit<Observation,'sequence'>) => { if (observations.length >= 40) { truncated = true; return; } observations.push({ sequence: ++sequence, ...value }); };
  page.on('response', response => { if (response.status() >= 400) record({ ...diagnosticSource(response.url(),origins), kind:'response', method:response.request().method(), status:response.status(), cancelled:null, unauthorizedConsole:null }); });
  page.on('requestfailed', request => record({ ...diagnosticSource(request.url(),origins), kind:'request-failed', method:request.method(), status:null, cancelled:/abort|cancel/i.test(request.failure()?.errorText ?? ''), unauthorizedConsole:null }));
  page.on('console', message => { if (message.type() === 'error') record({ ...diagnosticSource(message.location().url,origins), kind:'console', method:null, status:null, cancelled:null, unauthorizedConsole:/\b401\b|Unauthorized/.test(message.text()) }); });
  return () => ({ schemaVersion:'1', code:'COURSE_OBJECTIVE_TRANSPORT_UNVERIFIED', observations, truncated });
}
