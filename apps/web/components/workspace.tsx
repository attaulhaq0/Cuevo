'use client';

import { useState, useRef } from 'react';
import { ArrowRight, BookOpen, CheckCheck, CircleUserRound, Home, LogOut, RefreshCw, ShieldCheck, Sprout, type LucideIcon } from 'lucide-react';
import { Button, Status } from '@cuevo/ui';
import { useApp } from './providers';
import { Brand } from './brand';
import { LanguageSwitch } from './language-switch';
import type { Membership } from '../lib/membership';
import { LearningWorkspace } from './learning/learning-workspace';
import { learningAr, learningEn } from '../messages/learning';
import { AcademicWorkspace } from './academic/academic-workspace';
import { academicAr, academicEn } from '../messages/academic';

type View = 'overview' | 'access' | 'account' | 'learning' | 'academic';

export function Workspace({ membership }: { membership: Membership }) {
  const { dictionary: t, signOut, refreshAccess, locale } = useApp();
  const learning = locale === 'ar' ? learningAr : learningEn;
  const academic = locale === 'ar' ? academicAr : academicEn;
  const [view, setView] = useState<View>('overview');
  const [signingOut, setSigningOut] = useState(false);
  const [signOutFailed, setSignOutFailed] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const navigation: { id: View; label: string; Icon: LucideIcon }[] = [
    { id: 'overview', label: t.overview, Icon: Home },
    ...(membership.entitlements.includes('learning') ? [{ id: 'learning' as const, label: learning.learning, Icon: BookOpen }] : []),
    ...(membership.entitlements.includes('assessment') ? [{ id: 'academic' as const, label: academic.academic, Icon: CheckCheck }] : []),
    { id: 'access', label: t.accessDetails, Icon: ShieldCheck },
    { id: 'account', label: t.profile, Icon: CircleUserRound },
  ];

  function selectView(nextView: View) {
    setView(nextView);
    requestAnimationFrame(() => heading.current?.focus());
  }
  async function onSignOut() {
    setSigningOut(true);
    const success = await signOut();
    setSigningOut(false);
    setSignOutFailed(!success);
  }
  const title = view === 'academic' ? academic.academic : view === 'learning' ? learning.learning : view === 'overview' ? t.roleTitles[membership.role] : view === 'access' ? t.accessTitle : t.accountTitle;
  const body = view === 'academic' ? academic.body : view === 'learning' ? learning.learningBody : view === 'overview' ? t.roleBodies[membership.role] : view === 'access' ? t.accessBody : t.accountBody;
  const upcoming = [
    { Icon: BookOpen, title: t.learningTitle, body: t.learningBody },
    { Icon: CheckCheck, title: t.evidenceTitle, body: t.evidenceBody },
    { Icon: Sprout, title: t.supportTitle, body: t.supportBody },
  ];

  return <div className="workspace">
    <aside className="sidebar">
      <div className="sidebar__brand"><Brand compact /></div>
      <div className="school-identity"><span className="school-identity__icon"><BookOpen size={19} aria-hidden="true" /></span><div><p><bdi>{membership.school.name}</bdi></p><span>{t.roles[membership.role]}</span></div></div>
      <nav aria-label={t.mainNavigation} className="sidebar__nav">{navigation.map(({ id, Icon, label }) => <button key={id} type="button" className={`nav-item ${view === id ? 'nav-item--active' : ''}`} aria-current={view === id ? 'page' : undefined} onClick={() => selectView(id)}><Icon size={18} strokeWidth={1.8} aria-hidden="true" />{label}</button>)}</nav>
      <div className="sidebar__bottom"><Status>{t.foundation}</Status><p>{t.company}</p></div>
    </aside>
    <div className="workspace__body">
      <header className="workspace-header">
        <div className="workspace-header__leading"><span>{t.schoolWorkspace}</span><span className="workspace-mobile-brand"><Brand compact /></span></div>
        <div className="workspace-header__actions"><LanguageSwitch /><span className="header-divider" aria-hidden="true" /><button type="button" className="account-button" aria-label={t.profile} onClick={() => selectView('account')}><CircleUserRound size={20} aria-hidden="true" /><bdi>{membership.displayName}</bdi></button></div>
      </header>
      <main id="main-content" className="workspace-main" tabIndex={-1}>
        <div className="workspace-intro"><div><p className="eyebrow">{t.greeting} <bdi>{membership.displayName}</bdi></p><h1 ref={heading} tabIndex={-1}>{title}</h1><p>{body}</p></div><Status tone="positive">{t.sessionVerified}</Status></div>
        {view === 'academic' ? <AcademicWorkspace /> : view === 'learning' ? <LearningWorkspace /> : view === 'overview' ? <>
          <section className="connection-section" aria-labelledby="connection-title">
            <div className="connection-section__main"><div className="connection-icon"><ShieldCheck size={26} strokeWidth={1.6} aria-hidden="true" /></div><div><p className="eyebrow">{t.activeMembership}</p><h2 id="connection-title"><bdi>{membership.school.name}</bdi></h2><p>{t.activeMembershipBody}</p></div></div>
            <button type="button" className="text-action" onClick={() => selectView('access')}>{t.accessDetails}<ArrowRight size={17} className="directional-icon" aria-hidden="true" /></button>
          </section>
          <section className="upcoming-section" aria-labelledby="upcoming-heading"><div className="section-heading"><h2 id="upcoming-heading">{t.comingNext}</h2><p>{t.comingNextBody}</p></div><ol className="upcoming-list">{upcoming.map(({ Icon, title: itemTitle, body: itemBody }, index) => <li key={itemTitle}><span className="upcoming-list__number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><div className="upcoming-list__content"><h3><Icon size={17} aria-hidden="true" />{itemTitle}</h3><p>{itemBody}</p></div><Status>{t.notReady}</Status></li>)}</ol></section>
          <aside className="privacy-note"><ShieldCheck size={19} aria-hidden="true" /><div><h2>{t.privacyTitle}</h2><p>{t.privacyBody}</p></div></aside>
        </> : view === 'access' ? <>
          <section className="detail-section" aria-labelledby="access-membership-heading"><h2 id="access-membership-heading">{t.activeMembership}</h2><dl className="detail-list"><div><dt>{t.school}</dt><dd><bdi>{membership.school.name}</bdi></dd></div><div><dt>{t.role}</dt><dd>{t.roles[membership.role]}</dd></div><div><dt>{t.membership}</dt><dd><bdi className="identifier">{membership.membershipId}</bdi></dd></div></dl><Button type="button" variant="secondary" onClick={refreshAccess}><RefreshCw size={16} aria-hidden="true" />{t.refresh}</Button></section>
          <section className="detail-section" aria-labelledby="capabilities-heading"><h2 id="capabilities-heading">{t.capabilityTitle}</h2><p>{t.capabilityBody}</p>{membership.entitlements.length > 0 ? <ul className="capability-list">{membership.entitlements.map((capability) => <li key={capability}><bdi>{capability}</bdi></li>)}</ul> : <div className="notice"><Status tone="warning">{t.notConfigured}</Status><p>{t.noCapabilities}</p></div>}</section>
        </> : <section className="detail-section"><dl className="detail-list"><div><dt>{t.profile}</dt><dd><bdi>{membership.displayName}</bdi></dd></div><div><dt>{t.school}</dt><dd><bdi>{membership.school.name}</bdi></dd></div><div><dt>{t.role}</dt><dd>{t.roles[membership.role]}</dd></div><div><dt>{t.accountId}</dt><dd><bdi className="identifier">{membership.userId}</bdi></dd></div></dl><p className="account-help">{t.accountHelp}</p><p className="session-note">{t.sessionNote}</p><Button type="button" variant="secondary" onClick={() => void onSignOut()} disabled={signingOut}><LogOut size={16} aria-hidden="true" />{signingOut ? t.signingOut : t.signOut}</Button>{signOutFailed ? <p className="form-error" role="alert">{t.signOutError}</p> : null}</section>}
        <footer className="workspace-footer"><p>{t.foundationNote}</p><button type="button" className="text-action" onClick={() => void onSignOut()} disabled={signingOut}><LogOut size={14} aria-hidden="true" />{signingOut ? t.signingOut : t.signOut}</button></footer>
        {signOutFailed && view !== 'account' ? <p className="form-error" role="alert">{t.signOutError}</p> : null}
      </main>
    </div>
  </div>;
}
