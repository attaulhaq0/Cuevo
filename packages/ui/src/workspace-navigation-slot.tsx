'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

type NavigationSlot = { enabled: boolean; host: HTMLDivElement | null; setHost: (element: HTMLDivElement | null) => void; onActivate?: (id: string) => void };
const WorkspaceNavigationSlot = createContext<NavigationSlot | null>(null);

/** A DOM destination only. Feature owners retain live controls, callbacks and state. */
export function WorkspaceNavigationProvider({ enabled, onActivate, children }: { enabled: boolean; onActivate?: (id: string) => void; children: ReactNode }) {
  const [host, updateHost] = useState<HTMLDivElement | null>(null);
  const setHost = useCallback((element: HTMLDivElement | null) => updateHost(element), []);
  const value = useMemo(() => ({ enabled, host, setHost, onActivate }), [enabled, host, setHost, onActivate]);
  return <WorkspaceNavigationSlot.Provider value={value}>{children}</WorkspaceNavigationSlot.Provider>;
}

export function WorkspaceNavigationHost({ className }: { className?: string }) {
  const slot = useContext(WorkspaceNavigationSlot);
  return <div ref={slot?.setHost} className={className} data-workspace-sections />;
}

export function useWorkspaceNavigationSlot() {
  return useContext(WorkspaceNavigationSlot);
}
