import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
declare const CUEVO_ANALYTICS_DIRECTORY_URL: string | undefined;
/** Source and bundled runtimes receive an owner-relative private evidence location. */
export function analyticsFixtureDirectory() { return resolve(fileURLToPath(new URL(typeof CUEVO_ANALYTICS_DIRECTORY_URL === 'string' ? CUEVO_ANALYTICS_DIRECTORY_URL : '../../../../.local/analytics/', import.meta.url))); }
