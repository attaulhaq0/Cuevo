'use client';

import { CuevoIcon } from '@cuevo/ui';
import { useApp } from '../session/providers';

export function LanguageSwitch({ expanded = false }: { expanded?: boolean }) {
  const { locale, setLocale, dictionary: t } = useApp();
  return <div className="language-switch" role="group" aria-label={t.language}>
    <CuevoIcon name="language" size={16} />
    <button type="button" lang="en" aria-label="English" aria-pressed={locale === 'en'} onClick={() => setLocale('en')}>{expanded ? 'English' : 'EN'}</button>
    <span aria-hidden="true" className="language-switch__divider" />
    <button type="button" lang="ar" aria-label="العربية" aria-pressed={locale === 'ar'} onClick={() => setLocale('ar')}>العربية</button>
  </div>;
}
