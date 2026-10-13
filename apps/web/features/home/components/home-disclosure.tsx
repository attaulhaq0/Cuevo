import type { ReactNode } from 'react';

/** Secondary context stays available without reserving a full empty panel. */
export function HomeDisclosure({ title, compact, className, children }: { title: string; compact: boolean; className: string; children: ReactNode }) {
  return compact ? <details className={`${className} home-secondary-disclosure`}><summary><h2>{title}</h2></summary>{children}</details> : <section className={className}>{children}</section>;
}

/** Healthy overview paging is optional; current source errors stay with their owner. */
export function HomeSourceDisclosure({ label, children }: { label: string; children: ReactNode }) {
  return <details className="home-overview-source-disclosure"><summary>{label}</summary><div className="home-overview-continuations">{children}</div></details>;
}
