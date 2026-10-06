import type { CSSProperties } from 'react';

/** Public decorative material only. Theme is resolved by the current workspace
 * color scheme; no browser-dependent first render or domain state is read. */
export function TrailBackground({ src, className = '' }: { src: string; className?: string }) {
  return <div aria-hidden="true" className={`trail-background ${className}`} style={{ '--trail-background-light': `url("${src}")` } as CSSProperties} />;
}
