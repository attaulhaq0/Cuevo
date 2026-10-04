import type { ReactNode } from 'react';

/** Secondary context stays available without reserving a full empty panel. */
export function HomeDisclosure({ title, compact, className, children }: { title: string; compact: boolean; className: string; children: ReactNode }) {
  return compact ? <details className={`${className} home-secondary-disclosure`}><summary><h2>{title}</h2></summary>{children}</details> : <section className={className}>{children}</section>;
}
