import type { ReadingDocumentTheme } from '@cuevo/ui';

/** Capture resolved colors from the existing workspace, never a parallel report palette. */
export function currentReportTheme(workspace: Element): ReadingDocumentTheme {
  const styles = getComputedStyle(workspace);
  const color = (token: string) => {
    const probe = document.createElement('span'); probe.style.color = `var(${token})`; probe.style.position = 'absolute'; probe.style.visibility = 'hidden'; workspace.append(probe);
    try { return getComputedStyle(probe).color; } finally { probe.remove(); }
  };
  // Local fonts remain optional when a downloaded file is opened on another computer.
  return { canvas: color('--color-canvas'), surface: color('--color-surface'), muted: color('--color-surface-muted'), text: color('--color-text'), secondary: color('--color-text-secondary'), border: color('--color-border'), primary: color('--color-primary'), fontFamily: styles.fontFamily };
}
