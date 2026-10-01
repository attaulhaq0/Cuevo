'use client';

import { useState, useRef } from 'react';
import { ArrowRight, BookOpen, CheckCheck, CircleUserRound, Home, LogOut, RefreshCw, ShieldCheck, Sprout, type LucideIcon } from 'lucide-react';
import { Button, Status } from '@cuevo/ui';
import { useApp } from '../../../shared/session/providers';
import { Brand } from '../../../shared/components/brand';
import { LanguageSwitch } from '../../../shared/components/language-switch';
import type { Membership } from '../../../shared/session/membership';
import { LearningWorkspace } from '../../learning/ui';
import { learningAr, learningEn } from '../../learning/copy';
import { AcademicWorkspace } from '../../academic/ui';
import { academicAr, academicEn } from '../../academic/copy';
import { ProgressWorkspace } from '../../progress/ui';
import { progressAr, progressEn } from '../../progress/copy';
import { ImprovementWorkspace } from '../../improvement/ui';
import { improvementAr, improvementEn } from '../../improvement/copy';
import { SchoolWorkspace } from '../../school/ui';
import { schoolAr,schoolEn } from '../../school/copy';
import { CommunityWorkspace } from '../../community/ui';
import { communityAr,communityEn } from '../../community/copy';
import { PortfolioWorkspace } from '../../portfolio/ui';
import { portfolioAr,portfolioEn } from '../../portfolio/copy';
import { DevelopmentWorkspace } from '../../development/ui';
import { developmentAr,developmentEn } from '../../development/copy';
import { RoleHome } from '../../home/ui';
import { CurriculumWorkspace } from '../../curriculum/ui';
import { curriculumAr,curriculumEn } from '../../curriculum/copy';

type View = 'overview' | 'access' | 'account' | 'learning' | 'academic' | 'progress' | 'improvement' | 'school' | 'community' | 'portfolio' | 'development' | 'curriculum';

export function Workspace({ membership }: { membership: Membership }) {
  const { dictionary: t, signOut, refreshAccess, locale } = useApp();
  const learning = locale === 'ar' ? learningAr : learningEn;
  const academic = locale === 'ar' ? academicAr : academicEn;
  const progress = locale === 'ar' ? progressAr : progressEn;
  const improvement = locale === 'ar' ? improvementAr : improvementEn;
  const school = locale === 'ar' ? schoolAr : schoolEn;
  const community = locale === 'ar' ? communityAr : communityEn;
  const portfolio=locale==='ar'?portfolioAr:portfolioEn;
  const development=locale==='ar'?developmentAr:developmentEn;
  const curriculum=locale==='ar'?curriculumAr:curriculumEn;
  const [view, setView] = useState<View>('overview');
  const [signingOut, setSigningOut] = useState(false);
  const [signOutFailed, setSignOutFailed] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const navigation: { id: View; label: string; Icon: LucideIcon }[] = [
    { id: 'overview', label: t.overview, Icon: Home },
    ...(membership.entitlements.includes('school.operations')?[{id:'school' as const,label:school.school,Icon:Home}]:[]),
    ...(membership.entitlements.includes('community')?[{id:'community' as const,label:community.community,Icon:Home}]:[]),
    ...(membership.entitlements.includes('portfolio')?[{id:'portfolio' as const,label:portfolio.portfolio,Icon:BookOpen}]:[]),
    ...(membership.role!=='parent'&&membership.entitlements.includes('learner.state')?[{id:'development' as const,label:development.development,Icon:Sprout}]:[]),
    ...(['admin','coordinator','teacher'].includes(membership.role)&&membership.entitlements.includes('curriculum')?[{id:'curriculum' as const,label:curriculum.curriculum,Icon:BookOpen}]:[]),
    ...(membership.entitlements.includes('learning') ? [{ id: 'learning' as const, label: learning.learning, Icon: BookOpen }] : []),
    ...(membership.entitlements.includes('assessment') ? [{ id: 'academic' as const, label: academic.academic, Icon: CheckCheck }] : []),
    ...(membership.entitlements.includes('learning') ? [{ id: 'progress' as const, label: progress.progress, Icon: Sprout }] : []),
    ...(membership.role !== 'parent' && membership.entitlements.includes('learning') ? [{ id: 'improvement' as const, label: improvement.improvement, Icon: ArrowRight }] : []),
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
  const title = view === 'portfolio' ? portfolio.portfolio : view === 'development' ? development.development : view === 'curriculum' ? curriculum.curriculum : view === 'community' ? community.community : view === 'school' ? school.school : view === 'improvement' ? improvement.improvement : view === 'progress' ? progress.progress : view === 'academic' ? academic.academic : view === 'learning' ? learning.learning : view === 'overview' ? t.roleTitles[membership.role] : view === 'access' ? t.accessTitle : t.accountTitle;
  const body = view === 'portfolio' ? portfolio.body : view === 'development' ? development.body : view === 'curriculum' ? curriculum.body : view === 'community' ? community.body : view === 'school' ? school.body : view === 'improvement' ? improvement.body : view === 'progress' ? progress.body : view === 'academic' ? academic.body : view === 'learning' ? learning.learningBody : view === 'overview' ? t.roleBodies[membership.role] : view === 'access' ? t.accessBody : t.accountBody;
  return <div className="workspace">
    <aside className="sidebar">
      <div className="sidebar__brand"><Brand compact /></div>
      <div className="school-identity"><span className="school-identity__icon"><BookOpen size={19} aria-hidden="true" /></span><div><p><bdi>{membership.school.name}</bdi></p><span>{t.roles[membership.role]}</span></div></div>
      <nav aria-label={t.mainNavigation} className="sidebar__nav">{navigation.map(({ id, Icon, label }) => <button key={id} type="button" className={`nav-item ${view === id ? 'nav-item--active' : ''}`} aria-current={view === id ? 'page' : undefined} onFocus={event => event.currentTarget.scrollIntoView({ behavior: 'instant', block: 'nearest', inline: 'nearest' })} onClick={() => selectView(id)}><Icon size={18} strokeWidth={1.8} aria-hidden="true" />{label}</button>)}</nav>
      <div className="sidebar__bottom"><Status>{t.foundation}</Status><p>{t.company}</p></div>
    </aside>
    <div className="workspace__body">
      <header className="workspace-header">
        <div className="workspace-header__leading"><span>{t.schoolWorkspace}</span><span className="workspace-mobile-brand"><Brand compact /></span></div>
        <div className="workspace-header__actions"><LanguageSwitch /><span className="header-divider" aria-hidden="true" /><button type="button" className="account-button" aria-label={t.profile} onClick={() => selectView('account')}><CircleUserRound size={20} aria-hidden="true" /><bdi>{membership.displayName}</bdi></button></div>
      </header>
      <main id="main-content" className="workspace-main" tabIndex={-1}>
        <div className="workspace-intro"><div><p className="eyebrow">{t.greeting} <bdi>{membership.displayName}</bdi></p><h1 ref={heading} tabIndex={-1}>{title}</h1><p>{body}</p></div><Status tone="positive">{t.sessionVerified}</Status></div>
        {view === 'portfolio' ? <PortfolioWorkspace /> : view === 'development' ? <DevelopmentWorkspace /> : view === 'curriculum' ? <CurriculumWorkspace /> : view === 'community' ? <CommunityWorkspace /> : view === 'school' ? <SchoolWorkspace /> : view === 'improvement' ? <ImprovementWorkspace /> : view === 'progress' ? <ProgressWorkspace /> : view === 'academic' ? <AcademicWorkspace /> : view === 'learning' ? <LearningWorkspace /> : view === 'overview' ? <RoleHome onNavigate={selectView} /> : view === 'access' ? <>
          <section className="detail-section" aria-labelledby="access-membership-heading"><h2 id="access-membership-heading">{t.activeMembership}</h2><dl className="detail-list"><div><dt>{t.school}</dt><dd><bdi>{membership.school.name}</bdi></dd></div><div><dt>{t.role}</dt><dd>{t.roles[membership.role]}</dd></div><div><dt>{t.membership}</dt><dd><bdi className="identifier">{membership.membershipId}</bdi></dd></div></dl><Button type="button" variant="secondary" onClick={refreshAccess}><RefreshCw size={16} aria-hidden="true" />{t.refresh}</Button></section>
          <section className="detail-section" aria-labelledby="capabilities-heading"><h2 id="capabilities-heading">{t.capabilityTitle}</h2><p>{t.capabilityBody}</p>{membership.entitlements.length > 0 ? <ul className="capability-list">{membership.entitlements.map((capability) => <li key={capability}><bdi>{capability}</bdi></li>)}</ul> : <div className="notice"><Status tone="warning">{t.notConfigured}</Status><p>{t.noCapabilities}</p></div>}</section>
        </> : <section className="detail-section"><dl className="detail-list"><div><dt>{t.profile}</dt><dd><bdi>{membership.displayName}</bdi></dd></div><div><dt>{t.school}</dt><dd><bdi>{membership.school.name}</bdi></dd></div><div><dt>{t.role}</dt><dd>{t.roles[membership.role]}</dd></div><div><dt>{t.accountId}</dt><dd><bdi className="identifier">{membership.userId}</bdi></dd></div></dl><p className="account-help">{t.accountHelp}</p><p className="session-note">{t.sessionNote}</p><Button type="button" variant="secondary" onClick={() => void onSignOut()} disabled={signingOut}><LogOut size={16} aria-hidden="true" />{signingOut ? t.signingOut : t.signOut}</Button>{signOutFailed ? <p className="form-error" role="alert">{t.signOutError}</p> : null}</section>}
        <footer className="workspace-footer"><p>{t.foundationNote}</p><button type="button" className="text-action" onClick={() => void onSignOut()} disabled={signingOut}><LogOut size={14} aria-hidden="true" />{signingOut ? t.signingOut : t.signOut}</button></footer>
        {signOutFailed && view !== 'account' ? <p className="form-error" role="alert">{t.signOutError}</p> : null}
      </main>
    </div>
  </div>;
}
