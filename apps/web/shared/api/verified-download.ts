import { assetContentTypeSchema, assetDisplayNameSchema } from '@cuevo/contracts';
import { LearningApiError, type LearningApiConfig } from './client';
import type { SessionReadLifecycle } from '../session/read-lifecycle';

export type DownloadMetadata = { name: string; contentType: string; byteSize: number; sha256: string };
export type VerifiedDownload = Readonly<{ bytes: ArrayBuffer; metadata: Readonly<DownloadMetadata>; signal: AbortSignal; isCurrent: () => boolean }>;
export type VerifiedDownloadInput = {
  config: LearningApiConfig;
  path: string;
  metadata: DownloadMetadata;
  signal: AbortSignal;
  isCurrent: () => boolean;
  readLifecycle?: SessionReadLifecycle;
  statusError?: (status: number) => LearningApiError;
  responseValid?: (headers: Headers) => boolean;
};

function metadataSnapshot(value: DownloadMetadata): Readonly<DownloadMetadata> {
  if (!assetDisplayNameSchema.safeParse(value.name).success || !assetContentTypeSchema.safeParse(value.contentType).success || !Number.isInteger(value.byteSize) || value.byteSize < 1 || value.byteSize > 524288 || !/^[a-f0-9]{64}$/.test(value.sha256)) throw new LearningApiError('invalid');
  return Object.freeze({ name: value.name, contentType: value.contentType, byteSize: value.byteSize, sha256: value.sha256 });
}

/** Mechanical private-byte checks only; the owner retains exact source admission and errors. */
export async function fetchVerifiedDownload(input: VerifiedDownloadInput): Promise<VerifiedDownload> {
  const metadata = metadataSnapshot(input.metadata), config = { ...input.config }, path = input.path;
  if (!config.accessToken || !config.schoolId || !path.startsWith('/v1/') || /[\r\n\\]/.test(path)) throw new LearningApiError('invalid');
  const lifecycle = input.readLifecycle, frame = lifecycle?.capture(), ownerCurrent = input.isCurrent;
  const ownerAdmitted = () => { try { return ownerCurrent() && (!frame || !!lifecycle?.isCurrent(frame)); } catch { return false; } };
  const admitted = () => !input.signal.aborted && ownerAdmitted();
  if (!admitted()) throw new LearningApiError('unavailable');
  const signal = AbortSignal.any([input.signal, AbortSignal.timeout(15000), ...(frame ? [frame.signal] : [])]);
  const isCurrent = () => !signal.aborted && ownerAdmitted();
  const requireCurrent = () => { if (!isCurrent()) throw new LearningApiError('unavailable'); };
  try {
    requireCurrent();
    const response = await fetch(config.apiUrl.replace(/\/$/, '') + path, { headers: { Authorization: `Bearer ${config.accessToken}`, 'X-School-Id': config.schoolId }, cache: 'no-store', credentials: 'omit', signal });
    requireCurrent();
    if (!response.ok) throw input.statusError?.(response.status) ?? new LearningApiError(response.status === 403 ? 'denied' : 'unavailable');
    if (input.responseValid && !input.responseValid(response.headers)) throw new LearningApiError('invalid');
    const bytes = await response.arrayBuffer();
    requireCurrent();
    if (bytes.byteLength !== metadata.byteSize) throw new LearningApiError('invalid');
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('');
    requireCurrent();
    if (hash !== metadata.sha256) throw new LearningApiError('invalid');
    return Object.freeze({ bytes, metadata, signal, isCurrent });
  } catch (error) {
    throw error instanceof LearningApiError ? error : new LearningApiError('unavailable');
  }
}

/** A delivery launch is not a domain receipt or proof that a person read the file. */
export function deliverVerifiedDownload(result: VerifiedDownload, options: { onDelivered?: () => void } = {}): boolean {
  if (!result.isCurrent()) return false;
  const url = URL.createObjectURL(new Blob([result.bytes], { type: result.metadata.contentType }));
  let revoked = false, timer: ReturnType<typeof setTimeout> | undefined;
  const revoke = () => {
    if (revoked) return;
    revoked = true;
    if (timer !== undefined) clearTimeout(timer);
    result.signal.removeEventListener('abort', revoke);
    URL.revokeObjectURL(url);
  };
  result.signal.addEventListener('abort', revoke, { once: true });
  try {
    if (!result.isCurrent()) { revoke(); return false; }
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = result.metadata.name;
    if (!result.isCurrent()) { revoke(); return false; }
    anchor.click();
    if (result.isCurrent()) options.onDelivered?.();
    return true;
  } finally {
    if (!result.isCurrent()) revoke();
    if (!revoked) timer = setTimeout(revoke, 1000);
  }
}
