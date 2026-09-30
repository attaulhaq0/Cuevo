import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type PublicConfig = { supabaseUrl: string; supabasePublishableKey: string; apiUrl: string };

export function createAuthClient(config: PublicConfig): SupabaseClient | null {
  if (!config.supabaseUrl || !config.apiUrl || !config.supabasePublishableKey.startsWith('sb_publishable_')) return null;
  try {
    return createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false },
    });
  } catch {
    return null;
  }
}
