export type WorkspaceTheme = 'light' | 'dark' | 'system';

/** Read once from the server cookie; browser/system state never changes first markup. */
export function workspaceTheme(value: unknown): WorkspaceTheme {
  return value === 'dark' || value === 'system' ? value : 'light';
}

export function themePreferenceCookie(theme: WorkspaceTheme, secure: boolean): string {
  return `cuevo_workspace_theme=${workspaceTheme(theme)}; Path=/; Max-Age=31536000; SameSite=Lax${secure ? '; Secure' : ''}`;
}
