export type SignInFailure = 'credentials' | 'unavailable';

export function classifyAuthError(error: unknown): SignInFailure {
  if (typeof error !== 'object' || error === null) return 'unavailable';
  const status = 'status' in error ? error.status : undefined;
  if (typeof status === 'number' && (status === 0 || status === 429 || status >= 500)) return 'unavailable';
  return 'code' in error && error.code === 'invalid_credentials' ? 'credentials' : 'unavailable';
}
