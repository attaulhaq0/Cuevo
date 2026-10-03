'use client';

import { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowRight, BookOpen, CheckCheck, CircleUserRound, Home, LogOut, RefreshCw, ShieldCheck, Sprout, type LucideIcon } from 'lucide-react';
import { Button, Status } from '@cuevo/ui';
import { useApp } from '../../../shared/session/providers';
import { Brand } from '../../../shared/components/brand';
import { LanguageSwitch } from '../../../shared/components/language-switch';
import type { Membership } from '../../../shared/session/membership';
import { canOpenWorkspace } from '../../../shared/session/capabilities';
import { capabilityLabel } from '../../../shared/i18n/capability-label';
import{parseNavigationIntent,navigationParameters,type NavigationIntent}from'../../../shared/session/navigation-intent';
import { LearningWorkspace } from '../../learning/ui';
import { learningAr, learningEn } from '../../learning/copy';
import { AcademicWorkspace } from '../../academic/ui';
import { academicAr, academicEn } from '../../academic/copy';
import { ProgressWorkspace } from '../../progress/ui';
import { progressAr, progressEn } from '../../progress/copy';
import { ImprovementWorkspace } from '../../improvement/ui';
import { improvementAr, improvementEn } from '../../improvement/copy';
import { SchoolWorkspace,LearnerProfile } from '../../school/ui';
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
import{RestrictedRecordsWorkspace}from'../../restricted-records/ui';
import{restrictedAr,restrictedEn}from'../../restricted-records/copy';

type View = 'overview' | 'access' | 'account' | 'learning' | 'academic' | 'progress' | 'improvement' | 'school' | 'community' | 'portfolio' | 'development' | 'curriculum'|'restricted';

export function Workspace({ membership }: { membership: Membership }) {
  const { dictionary: t, signOut, refreshAccess, locale, notice } = useApp();
  const search = useSearchParams();
  const learning = locale === 'ar' ? learningAr : learningEn;
  const academic = locale === 'ar' ? academicAr : academicEn;
  const progress = locale === 'ar' ? progressAr : progressEn;
  const improvement = locale === 'ar' ? improvementAr : improvementEn;
  const school = locale === 'ar' ? schoolAr : schoolEn;
  const community = locale === 'ar' ? communityAr : communityEn;
  const portfolio=locale==='ar'?portfolioAr:portfolioEn;
  const development=locale==='ar'?developmentAr:developmentEn;
  const curriculum=locale==='ar'?curriculumAr:curriculumEn;
  const restricted=locale==='ar'?restrictedAr:restrictedEn;
  const requestedView = search.get('view');
  const intent=parseNavigationIntent(requestedView,search.get('source'),search.get('id'));
  const [signingOut, setSigningOut] = useState(false);
  const [signOutFailed, setSignOutFailed] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const canOpen = (target: View) => canOpenWorkspace(target, membership.entitlements, membership.role);
  const navigation: { id: View; label: string; Icon: LucideIcon }[] = [
    { id: 'overview', label: t.overview, Icon: Home },
    ...(canOpen('school') ? [{id:'school' as const,label:school.school,Icon:Home}]:[]),
    ...(canOpen('community') ? [{id:'community' as const,label:community.community,Icon:Home}]:[]),
    ...(canOpen('portfolio') ? [{id:'portfolio' as const,label:portfolio.portfolio,Icon:BookOpen}]:[]),
    ...(canOpen('development') ? [{id:'development' as const,label:development.development,Icon:Sprout}]:[]),
    ...(canOpen('curriculum') ? [{id:'curriculum' as const,label:curriculum.curriculum,Icon:BookOpen}]:[]),
    ...(canOpen('restricted')?[{id:'restricted'as const,label:restricted.title,Icon:ShieldCheck}]:[]),
    ...(canOpen('learning') ? [{ id: 'learning' as const, label: learning.learning, Icon: BookOpen }] : []),
    ...(canOpen('academic') ? [{ id: 'academic' as const, label: academic.academic, Icon: CheckCheck }] : []),
    ...(canOpen('progress') ? [{ id: 'progress' as const, label: progress.progress, Icon: Sprout }] : []),
    ...(canOpen('improvement') ? [{ id: 'improvement' as const, label: improvement.improvement, Icon: ArrowRight }] : []),
    { id: 'access', label: t.accessDetails, Icon: ShieldCheck },
    { id: 'account', label: t.profile, Icon: CircleUserRound },
  ];
  const view = navigation.some(item => item.id === requestedView) ? requestedView as View : 'overview';
  useEffect(() => { if (requestedView && !navigation.some(item => item.id === requestedView)) window.history.replaceState(null, '', location.pathname); }, [requestedView, membership.role, membership.entitlements]);

  function selectView(destination: View|NavigationIntent) {
    const nextView=typeof destination==='string'?destination:destination.view;
    if (!navigation.some(item => item.id === nextView)) return;
    const params = typeof destination==='string'?new URLSearchParams():navigationParameters(destination); if (nextView !== 'overview') params.set('view', nextView);
    window.history.pushState(null, '', `${location.pathname}${params.size ? '?' + params : ''}`);
    requestAnimationFrame(() => heading.current?.focus());
  }
  async function onSignOut() {
    setSigningOut(true);
    const success = await signOut();
    setSigningOut(false);
    setSignOutFailed(!success);
  }
  const title = view==='restricted'?restricted.title:view === 'portfolio' ? portfolio.portfolio : view === 'development' ? development.development : view === 'curriculum' ? curriculum.curriculum : view === 'community' ? community.community : view === 'school' ? school.school : view === 'improvement' ? improvement.improvement : view === 'progress' ? progress.progress : view === 'academic' ? academic.academic : view === 'learning' ? learning.learning : view === 'overview' ? t.roleTitles[membership.role] : view === 'access' ? t.accessTitle : t.accountTitle;
  const body = view==='restricted'?restricted.notice:view === 'portfolio' ? portfolio.body : view === 'development' ? development.body : view === 'curriculum' ? curriculum.body : view === 'community' ? community.body : view === 'school' ? school.body : view === 'improvement' ? improvement.body : view === 'progress' ? progress.body : view === 'academic' ? academic.body : view === 'learning' ? learning.learningBody : view === 'overview' ? t.roleBodies[membership.role] : view === 'access' ? t.accessBody : t.accountBody;
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
        {notice ? <p className="notice" role="status">{notice}</p> : null}
        {view==='restricted'?<RestrictedRecordsWorkspace/>:view === 'portfolio' ? <PortfolioWorkspace /> : view === 'development' ? <DevelopmentWorkspace /> : view === 'curriculum' ? <CurriculumWorkspace /> : view === 'community' ? <CommunityWorkspace /> : view === 'school' ? <SchoolWorkspace onAutomationControl={selectView}/> : view === 'improvement' ? <ImprovementWorkspace intent={intent?.view==='improvement'?intent:null} /> : view === 'progress' ? <ProgressWorkspace /> : view === 'academic' ? <AcademicWorkspace intent={intent?.view==='academic'?intent:null} /> : view === 'learning' ? <LearningWorkspace intent={intent?.view==='learning'?intent:null} /> : view === 'overview' ? <RoleHome onNavigate={selectView} /> : view === 'access' ? <>
          <section className="detail-section" aria-labelledby="access-membership-heading"><h2 id="access-membership-heading">{t.activeMembership}</h2><dl className="detail-list"><div><dt>{t.school}</dt><dd><bdi>{membership.school.name}</bdi></dd></div><div><dt>{t.role}</dt><dd>{t.roles[membership.role]}</dd></div></dl><Button type="button" variant="secondary" onClick={refreshAccess}><RefreshCw size={16} aria-hidden="true" />{t.refresh}</Button></section>
          <section className="detail-section" aria-labelledby="capabilities-heading"><h2 id="capabilities-heading">{t.capabilityTitle}</h2><p>{t.capabilityBody}</p>{membership.entitlements.length > 0 ? <ul className="capability-list">{membership.entitlements.map((capability) => <li key={capability}><bdi>{capabilityLabel(capability, locale)}</bdi></li>)}</ul> : <div className="notice"><Status tone="warning">{t.notConfigured}</Status><p>{t.noCapabilities}</p></div>}</section>
        </> : <section className="detail-section"><dl className="detail-list"><div><dt>{t.profile}</dt><dd><bdi>{membership.displayName}</bdi></dd></div><div><dt>{t.school}</dt><dd><bdi>{membership.school.name}</bdi></dd></div><div><dt>{t.role}</dt><dd>{t.roles[membership.role]}</dd></div></dl>{membership.entitlements.includes('school.operations')?<LearnerProfile/>:null}<details><summary>{t.reference}</summary><p className="identifier"><bdi>{membership.userId}</bdi></p><p className="identifier"><bdi>{membership.membershipId}</bdi></p></details><p className="account-help">{t.accountHelp}</p><p className="session-note">{t.sessionNote}</p><Button type="button" variant="secondary" onClick={() => void onSignOut()} disabled={signingOut}><LogOut size={16} aria-hidden="true" />{signingOut ? t.signingOut : t.signOut}</Button>{signOutFailed ? <p className="form-error" role="alert">{t.signOutError}</p> : null}</section>}
        <footer className="workspace-footer"><p>{t.foundationNote}</p><button type="button" className="text-action" onClick={() => void onSignOut()} disabled={signingOut}><LogOut size={14} aria-hidden="true" />{signingOut ? t.signingOut : t.signOut}</button></footer>
        {signOutFailed && view !== 'account' ? <p className="form-error" role="alert">{t.signOutError}</p> : null}
      </main>
    </div>
  </div>;
}
