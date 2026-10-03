'use client';

import { useState } from 'react';
import { CuevoIcon } from '@cuevo/ui';
import { themePreferenceCookie, type WorkspaceTheme } from '../theme-model';

const copy = {
  en: { label: 'Appearance', light: 'Light', dark: 'Dark', system: 'Use device settings' },
  ar: { label: 'المظهر', light: 'فاتح', dark: 'داكن', system: 'حسب إعدادات الجهاز' },
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
  return <div className="workspace-theme">
    <div className="workspace-theme__heading"><CuevoIcon name="appearance" size={24} /><span>{t.label}</span></div>
    <div className="workspace-theme__choices" role="group" aria-label={t.label}>
      <button type="button" aria-pressed={value === 'light'} onClick={() => onChange('light')}>{t.light}</button>
      <button type="button" aria-pressed={value === 'dark'} onClick={() => onChange('dark')}>{t.dark}</button>
    </div>
    <label className="workspace-theme__system"><input type="checkbox" checked={value === 'system'} onChange={event => onChange(event.currentTarget.checked ? 'system' : 'light')} /><span>{t.system}</span></label>
  </div>;
}
