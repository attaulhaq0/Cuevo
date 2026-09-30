import { createClient } from '@supabase/supabase-js';
import { decodeJwt } from 'jose';
import { DomainError } from '@cuevo/domain';
import { z } from 'zod';
import type { ServerConfig } from '@cuevo/config';
import type { VerifiedUser } from './identity.service';

export async function isAuthReady(config: ServerConfig): Promise<boolean> {
  if (!config.supabaseUrl || !config.supabasePublishableKey) return false;
  try {
    const response = await fetch(`${config.supabaseUrl}/auth/v1/health`, {
      headers: { apikey: config.supabasePublishableKey }, signal: AbortSignal.timeout(3000), redirect: 'error',
    });
    return response.ok;
  } catch { return false; }
}

export function createUserVerifier(config: ServerConfig): (token: string) => Promise<VerifiedUser> {
  const client = config.supabaseUrl && config.supabasePublishableKey ? createClient(config.supabaseUrl, config.supabasePublishableKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(5000) }) } }) : undefined;
  return async token => {
    if (!client) throw new DomainError('AUTH_UNAVAILABLE', 503, 'Authentication is temporarily unavailable.');
    let response;
    try { response = await client.auth.getUser(token); } catch { throw new DomainError('AUTH_UNAVAILABLE', 503, 'Authentication is temporarily unavailable.'); }
    if (response.error) {
      if (!response.error.status || response.error.status >= 500) throw new DomainError('AUTH_UNAVAILABLE', 503, 'Authentication is temporarily unavailable.');
      throw new DomainError('INVALID_SESSION', 401, 'Sign in again to continue.');
    }
    const user = response.data.user;
    try {
      const claims = decodeJwt(token); // Claims are inspected only after the Auth server verifies this token.
      const sessionId = z.uuid().parse(claims.session_id);
      if (!user || claims.sub !== user.id || !z.uuid().safeParse(user.id).success) throw new Error('Invalid subject');
      return { userId: user.id, sessionId };
    } catch { throw new DomainError('INVALID_SESSION', 401, 'Sign in again to continue.'); }
  };
}
