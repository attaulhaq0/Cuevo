'use client';

import { Languages } from 'lucide-react';
import { useApp } from './providers';

export function LanguageSwitch() {
  const { locale, setLocale, dictionary: t } = useApp();
  return <div className="language-switch" role="group" aria-label={t.language}>
    <Languages size={16} aria-hidden="true" />
    <button type="button" lang="en" aria-label="English" aria-pressed={locale === 'en'} onClick={() => setLocale('en')}>EN</button>
    <span aria-hidden="true" className="language-switch__divider" />
    <button type="button" lang="ar" aria-label="العربية" aria-pressed={locale === 'ar'} onClick={() => setLocale('ar')}>العربية</button>
  </div>;
}
