import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type PublicConfig = { supabaseUrl: string; supabasePublishableKey: string; apiUrl: string };
let browserClient: { key: string; client: SupabaseClient } | undefined;

export function createAuthClient(config: PublicConfig): SupabaseClient | null {
  if (typeof window === 'undefined' || !config.supabaseUrl || !config.apiUrl || !config.supabasePublishableKey.startsWith('sb_publishable_')) return null;
  const key = `${config.supabaseUrl}|${config.supabasePublishableKey}|${config.apiUrl}`;
  if (browserClient?.key === key) return browserClient.client;
  try {
    browserClient?.client.auth.stopAutoRefresh();
    const client = createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false },
    });
    browserClient = { key, client };
    return client;
  } catch {
    return null;
  }
}
