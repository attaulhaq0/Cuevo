import type { ReactNode } from 'react';

export function Status({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'positive' | 'warning' }) {
  return <span className={`status status--${tone}`}><span aria-hidden="true" className="status__dot" />{children}</span>;
}
