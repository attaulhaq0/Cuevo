'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type NavigationSlot = { enabled: boolean; compactHeadings: boolean; currentWorkspaceLabel?: string; host: HTMLDivElement | null; setHost: (element: HTMLDivElement | null) => void; onActivate?: (id: string) => void };
const WorkspaceNavigationSlot = createContext<NavigationSlot | null>(null);

/** A DOM destination only. Feature owners retain live controls, callbacks and state. */
export function WorkspaceNavigationProvider({ enabled, compactHeadings = false, currentWorkspaceLabel, onActivate, children }: { enabled: boolean; compactHeadings?: boolean; currentWorkspaceLabel?: string; onActivate?: (id: string) => void; children: ReactNode }) {
  const [host, updateHost] = useState<HTMLDivElement | null>(null);
  const setHost = useCallback((element: HTMLDivElement | null) => updateHost(element), []);
  const value = useMemo(() => ({ enabled, compactHeadings, currentWorkspaceLabel, host, setHost, onActivate }), [enabled, compactHeadings, currentWorkspaceLabel, host, setHost, onActivate]);
  return <WorkspaceNavigationSlot.Provider value={value}>{children}</WorkspaceNavigationSlot.Provider>;
}

export function WorkspaceNavigationHost({ className }: { className?: string }) {
  const slot = useContext(WorkspaceNavigationSlot);
  return <div ref={slot?.setHost} className={className} data-workspace-sections />;
}

export function useWorkspaceNavigationSlot() {
  return useContext(WorkspaceNavigationSlot);
}

/** Places the current owner's live controls; it adds no selection or activation policy. */
export function WorkspaceNavigationContent({children}:{children:ReactNode}) {
 const slot=useWorkspaceNavigationSlot();
 return slot?.enabled ? slot.host ? createPortal(children,slot.host) : null : <>{children}</>;
}
