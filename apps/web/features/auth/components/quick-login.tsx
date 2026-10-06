'use client';
import { useEffect, useId, useState } from 'react';
import { Button, CuevoIcon } from '@cuevo/ui';
import { availableQuickLogin, quickLoginRoles, type QuickLoginRole } from '../quick-login-model';

const copy = { en: { title: 'Try Cuevo', notice: 'Choose a role in the example school.', admin: 'Administrator', coordinator: 'Coordinator', teacher: 'Teacher', student: 'Student', parent: 'Parent / guardian' }, ar: { title: 'جرّب كويفو', notice: 'اختر دورًا في المدرسة التجريبية.', admin: 'مسؤول المدرسة', coordinator: 'المنسّق', teacher: 'المعلّم', student: 'الطالب', parent: 'وليّ الأمر' } };
const icons = { admin: 'school', coordinator: 'curriculum', teacher: 'assessment', student: 'student', parent: 'parent' } as const;
export function TestingQuickLogin({ locale, pending, onLogin, error }: { locale: 'en' | 'ar'; pending: boolean; onLogin: (role: QuickLoginRole) => void; error: string | null }) {
  const [available, setAvailable] = useState(false); const id = useId();
  useEffect(() => { const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 10000); void fetch('/api/testing/quick-login', { cache: 'no-store', signal: controller.signal }).then(async response => { const value = response.ok ? await response.json() : null; if (!controller.signal.aborted) setAvailable(availableQuickLogin(value)); }).catch(() => {}).finally(() => clearTimeout(timeout)); return () => { clearTimeout(timeout); controller.abort(); }; }, []);
  if (!available) return null;
  return <QuickLoginChooser id={id} locale={locale} pending={pending} onLogin={onLogin} error={error} />;
}

export function QuickLoginChooser({ id, locale, pending, onLogin, error }: { id: string; locale: 'en' | 'ar'; pending: boolean; onLogin: (role: QuickLoginRole) => void; error: string | null }) {
  const t = copy[locale];
  return <div className="auth-testing-login" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
    <Button type="button" variant="secondary" popoverTarget={id} disabled={pending} aria-label={t.title}><CuevoIcon name="person" /><span>{t.title}</span></Button>
    <div id={id} popover="auto" role="region" aria-label={t.title} className="auth-testing-login__panel"><h2>{t.title}</h2><p>{t.notice}</p><div className="auth-testing-login__roles">{quickLoginRoles.map(role => <Button key={role} type="button" variant="quiet" disabled={pending} onClick={() => onLogin(role)}><CuevoIcon name={icons[role]} /><span>{t[role]}</span></Button>)}</div>{error ? <p role="alert" className="form-error">{error}</p> : null}</div>
  </div>;
}
