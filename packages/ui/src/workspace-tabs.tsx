'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CuevoIcon, type CuevoIconName } from './icon';
import { useWorkspaceNavigationSlot } from './workspace-navigation-slot';

export type WorkspaceTab = { id: string; label: string; icon: CuevoIconName; disabled?: boolean };
/** Presentational workspace navigation. Owners retain selection, permission and requests. */
export function WorkspaceTabs({ label, items, selected, onChange, disabled = false, actions }: { label: string; items: WorkspaceTab[]; selected: string; onChange: (id: string) => void; disabled?: boolean; actions?: ReactNode }) {
  const slot = useWorkspaceNavigationSlot();
  const host = slot?.enabled ? slot.host : null;
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
  }, [selected, items.map(item => item.id + item.label).join('|'), host]);
  if (!items.length && !actions) return null;
  const content = <div className="cuevo-workspace-section-navigation">
    {items.length > 1 ? <div ref={container} className="learning-tabs cuevo-workspace-tabs" role="group" aria-label={label}>{items.map(item => <button type="button" key={item.id} data-workspace-section={item.id} aria-pressed={item.id === selected} disabled={disabled || item.disabled} onClick={() => {
      if (disabled || item.disabled) return;
      onChange(item.id);
      if (item.id !== selected && slot?.enabled) slot.onActivate?.(item.id);
    }} onKeyDown={event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      const rail = container.current;
      if (!rail) return;
      const buttons = Array.from(rail.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
      if (!buttons.length) return;
      const index = buttons.indexOf(event.currentTarget), rtl = getComputedStyle(rail).direction === 'rtl';
      const step = (event.key === 'ArrowRight' ? 1 : -1) * (rtl ? -1 : 1);
      const target = event.key === 'Home' ? buttons[0] : event.key === 'End' ? buttons.at(-1) : buttons[(Math.max(0, index) + step + buttons.length) % buttons.length];
      event.preventDefault();
      target?.focus();
    }}><CuevoIcon name={item.icon} size={22} /><span>{item.label}</span></button>)}</div> : items.length === 1 ? <span className="cuevo-workspace-section-current" aria-disabled={disabled || items[0].disabled || undefined}><CuevoIcon name={items[0].icon} size={22} /><span>{items[0].label}</span></span> : null}
    {actions ? <div className="cuevo-workspace-section-actions">{actions}</div> : null}
  </div>;
  // Server HTML and the first client render both wait for the actual host.
  // A portal keeps this owner's current callbacks instead of registering snapshots.
  return slot?.enabled ? host ? createPortal(content, host) : null : content;
}
