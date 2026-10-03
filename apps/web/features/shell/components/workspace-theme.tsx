'use client';

import { useState } from 'react';
import { themePreferenceCookie, type WorkspaceTheme } from '../theme-model';

const copy = {
  en: { label: 'Appearance', light: 'Light', dark: 'Dark', system: 'System' },
  ar: { label: 'المظهر', light: 'فاتح', dark: 'داكن', system: 'حسب الجهاز' },
};

/** A presentation cookie contains no school, actor, academic data or credentials. */
export function useWorkspaceTheme(initialTheme: WorkspaceTheme) {
  const [theme, updateTheme] = useState(initialTheme);
  function setTheme(next: WorkspaceTheme) {
    updateTheme(next);
    document.cookie = themePreferenceCookie(next, location.protocol === 'https:');
  }
  return { theme, setTheme };
}

export function ThemeControl({ value, onChange, locale }: { value: WorkspaceTheme; onChange: (theme: WorkspaceTheme) => void; locale: 'en' | 'ar' }) {
  const t = copy[locale];
  return <label className="workspace-theme"><span>{t.label}</span><select value={value} onChange={event => onChange(event.currentTarget.value as WorkspaceTheme)} aria-label={t.label}><option value="light">{t.light}</option><option value="dark">{t.dark}</option><option value="system">{t.system}</option></select></label>;
}
