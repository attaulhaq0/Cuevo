import { useEffect, useRef } from 'react';
import { CuevoIcon, type CuevoIconName } from './icon';

export type WorkspaceTab = { id: string; label: string; icon: CuevoIconName; disabled?: boolean };
/** Presentational workspace navigation. Owners retain selection, permission and requests. */
export function WorkspaceTabs({ label, items, selected, onChange, disabled = false }: { label: string; items: WorkspaceTab[]; selected: string; onChange: (id: string) => void; disabled?: boolean }) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const rail = container.current;
    if (!rail) return;
    const revealSelected = () => {
      const active = rail.querySelector<HTMLElement>('button[aria-pressed="true"]');
      if (!active) return;
      const viewport = rail.getBoundingClientRect(), item = active.getBoundingClientRect();
      const offset = item.left < viewport.left ? item.left - viewport.left : item.right > viewport.right ? item.right - viewport.right : 0;
      if (offset) rail.scrollBy({ left: offset, behavior: 'instant' });
    };
    revealSelected();
    const observer = new ResizeObserver(revealSelected);
    observer.observe(rail);
    return () => observer.disconnect();
  }, [selected, items.map(item => item.id + item.label).join('|')]);
  return <div ref={container} className="learning-tabs cuevo-workspace-tabs" role="group" aria-label={label}>{items.map(item => <button type="button" key={item.id} aria-pressed={item.id === selected} disabled={disabled || item.disabled} onClick={() => onChange(item.id)}><CuevoIcon name={item.icon} size={22} /><span>{item.label}</span></button>)}</div>;
}
