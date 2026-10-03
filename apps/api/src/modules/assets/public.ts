import { createClient } from '@supabase/supabase-js';
import { DomainError } from '@cuevo/domain';
import { assetDisplayNameSchema } from '@cuevo/contracts';
export { checksum as assetChecksum, validateBytes as validateAssetBytes } from './assets.service';
export type { AssetRecord, AssetStoragePort } from './assets.service';
import type { AssetStoragePort } from './assets.service';

/** One private byte registry/bucket; domain services own purpose and link authorization. */
export function createAssetStorage(config: { url?: string; secret?: string }): AssetStoragePort | undefined {
  if (!config.url || !config.secret) return undefined;
  const storage = createClient(config.url, config.secret, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10000) }) } }).storage.from('learner-private');
  return { upload: async (path, bytes, contentType) => { const result = await storage.upload(path, bytes, { contentType, upsert: false }); if (result.error && String(result.error.statusCode) !== '409') throw new DomainError('ASSET_OUTCOME_UNKNOWN', 503, 'Upload outcome is unconfirmed. Retry the same upload.'); }, download: async path => { const result = await storage.download(path); if (result.error || !result.data) throw new DomainError('ASSET_STORAGE_UNAVAILABLE', 503, 'Private storage is unavailable.'); return Buffer.from(await result.data.arrayBuffer()); } };
}
export function assetContentDisposition(name: string): string {
  const checked = assetDisplayNameSchema.safeParse(name); if (!checked.success) throw new DomainError('INVALID_INPUT', 400, 'The file display name requires review.');
  const fallback = checked.data.replace(/[^A-Za-z0-9_. -]/g, '_').replace(/"/g, '_');
  const encoded = encodeURIComponent(checked.data).replace(/[!'()*]/g, character => '%' + character.charCodeAt(0).toString(16).toUpperCase());
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
