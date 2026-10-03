'use client';

import { TrailBackground } from '../../../shared/characters/ui';

import { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button, CuevoIcon, Status } from '@cuevo/ui';
import { useApp } from '../../../shared/session/providers';
import { Brand } from '../../../shared/components/brand';
import { LanguageSwitch } from '../../../shared/components/language-switch';
import { trailAssets } from '../../../shared/characters/assets';
import type { Membership } from '../../../shared/session/membership';
import type { WorkspaceTarget } from '../../../shared/session/capabilities';
import{parseNavigationIntent,type NavigationIntent}from'../../../shared/session/navigation-intent';
import { isWorkspaceHomeActivation, openWorkspaceDestination, workspaceNavigation, workspaceView } from '../model';
import { WorkspaceChrome } from './workspace-chrome';
import { WorkspaceCommandNavigation } from './workspace-command-navigation';
import { ThemeControl } from './workspace-theme';
import { chromeAr, chromeEn } from '../messages';
import type { WorkspaceTheme } from '../theme-model';
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

type View = WorkspaceTarget;

export function Workspace({ membership, theme, onThemeChange }: { membership: Membership; theme: WorkspaceTheme; onThemeChange: (theme: WorkspaceTheme) => void }) {
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
  const navigation = workspaceNavigation(membership, {
    overview: t.overview, school: school.school, community: community.community,
    portfolio: portfolio.portfolio, development: development.development,
    curriculum: curriculum.curriculum, restricted: restricted.title, learning: learning.learning,
    academic: academic.academic, progress: progress.progress, improvement: improvement.improvement,
    access: t.accessDetails, account: t.profile,
  });
  const view = workspaceView(navigation, requestedView);
  const studentHome = view === 'overview' && membership.role === 'student';
  const composedHome = view === 'overview';
  const destinationKey = `${view}:${intent?.source ?? ''}:${intent?.id ?? ''}`;
  const focusedDestination = useRef(destinationKey);
  useEffect(() => {
    if (focusedDestination.current === destinationKey) return;
    focusedDestination.current = destinationKey;
    requestAnimationFrame(() => heading.current?.focus());
  }, [destinationKey]);
  useEffect(() => { if (requestedView && !navigation.some(item => item.id === requestedView)) window.history.replaceState(null, '', location.pathname); }, [requestedView, membership.role, membership.entitlements]);

  function selectView(destination: View|NavigationIntent) {
    if (!openWorkspaceDestination(destination, navigation, location.pathname, window.history)) return;
    requestAnimationFrame(() => heading.current?.focus());
  }
  const navigationItems = navigation.map(item => ({ ...item, onSelect: () => selectView(item.id) }));
  async function onSignOut() {
    setSigningOut(true);
    const success = await signOut();
    setSigningOut(false);
    setSignOutFailed(!success);
  }
  const title = view==='restricted'?restricted.title:view === 'portfolio' ? portfolio.portfolio : view === 'development' ? development.development : view === 'curriculum' ? curriculum.curriculum : view === 'community' ? community.community : view === 'school' ? school.school : view === 'improvement' ? improvement.improvement : view === 'progress' ? progress.progress : view === 'academic' ? academic.academic : view === 'learning' ? learning.learning : view === 'overview' ? t.roleTitles[membership.role] : view === 'access' ? t.accessTitle : t.accountTitle;
  const body = view==='restricted'?restricted.notice:view === 'portfolio' ? portfolio.body : view === 'development' ? development.body : view === 'curriculum' ? curriculum.body : view === 'community' ? community.body : view === 'school' ? school.body : view === 'improvement' ? improvement.body : view === 'progress' ? progress.body : view === 'academic' ? ['student', 'parent'].includes(membership.role) ? academic.learnerBody : academic.body : view === 'learning' ? learning.learningBody : view === 'overview' ? t.roleBodies[membership.role] : view === 'access' ? t.accessBody : t.accountBody;
  return <WorkspaceCommandNavigation navigation={navigationItems} selectedId={view} locale={locale}>{(searchAction, commandDialog) => <WorkspaceChrome context={{
    navigation: navigationItems,
    selectedId: view, navigationLabel: t.mainNavigation,
    schoolName: membership.school.name, personName: membership.displayName,
    roleLabel: t.roles[membership.role], locale, theme,
    expression: membership.role === 'student' ? 'student' : membership.role === 'parent' ? 'parent' : 'staff',
    brand: <div onClickCapture={event => { if (isWorkspaceHomeActivation(event) && (event.target as Element).closest('a')) { event.preventDefault(); event.stopPropagation(); selectView('overview'); } }}><Brand compact /></div>,
    languageControl: <LanguageSwitch />,
    appearanceControl: <ThemeControl value={theme} onChange={onThemeChange} locale={locale} />,
    accountAction: { label: t.profile, onClick: () => selectView('account') },
    settingsAction: navigation.some(item => item.id === 'access') ? { label: (locale === 'ar' ? chromeAr : chromeEn).settings, onClick: () => selectView('access') } : undefined,
    signOutAction: { label: signingOut ? t.signingOut : t.signOut, onClick: () => void onSignOut(), pending: signingOut },
    profileNotice: signOutFailed ? <p className="form-error" role="alert">{t.signOutError}</p> : null,
    searchAction,
  }}>
      <TrailBackground className="workspace-chrome__background" src={trailAssets.background} />
      <main id="main-content" className={`workspace-main${studentHome ? ' workspace-main--student-home' : ''}${view === 'learning' && membership.role === 'student' ? ' workspace-main--student-learning' : ''}${view === 'community' ? ' workspace-main--community' : ''}${view === 'academic' ? ' workspace-main--academic' : ''}`} tabIndex={-1}>
        {composedHome ? null : <div className="workspace-intro"><div><p className="eyebrow">{t.greeting} <bdi>{membership.displayName}</bdi></p><h1 ref={heading} tabIndex={-1}>{title}</h1><p>{body}</p></div><Status tone="positive">{t.sessionVerified}</Status></div>}
        {notice ? <p className="notice" role="status">{notice}</p> : null}
        {view==='restricted'?<RestrictedRecordsWorkspace/>:view === 'portfolio' ? <PortfolioWorkspace /> : view === 'development' ? <DevelopmentWorkspace /> : view === 'curriculum' ? <CurriculumWorkspace /> : view === 'community' ? <CommunityWorkspace /> : view === 'school' ? <SchoolWorkspace onAutomationControl={selectView}/> : view === 'improvement' ? <ImprovementWorkspace intent={intent?.view==='improvement'?intent:null} /> : view === 'progress' ? <ProgressWorkspace /> : view === 'academic' ? <AcademicWorkspace intent={intent?.view==='academic'?intent:null} /> : view === 'learning' ? <LearningWorkspace intent={intent?.view==='learning'?intent:null} /> : view === 'overview' ? <RoleHome onNavigate={selectView} headingRef={composedHome ? heading : undefined} /> : view === 'access' ? <>
          <section className="detail-section" aria-labelledby="access-membership-heading"><h2 id="access-membership-heading">{t.activeMembership}</h2><dl className="detail-list"><div><dt>{t.school}</dt><dd><bdi>{membership.school.name}</bdi></dd></div><div><dt>{t.role}</dt><dd>{t.roles[membership.role]}</dd></div></dl><Button type="button" variant="secondary" onClick={refreshAccess}><CuevoIcon name="refresh" size={16} />{t.refresh}</Button></section>
          <section className="detail-section" aria-labelledby="capabilities-heading"><h2 id="capabilities-heading">{t.capabilityTitle}</h2><p>{t.capabilityBody}</p>{membership.entitlements.length > 0 ? <ul className="capability-list">{membership.entitlements.map((capability) => <li key={capability}><bdi>{capability}</bdi></li>)}</ul> : <div className="notice"><Status tone="warning">{t.notConfigured}</Status><p>{t.noCapabilities}</p></div>}</section>
        </> : <section className="detail-section"><dl className="detail-list"><div><dt>{t.profile}</dt><dd><bdi>{membership.displayName}</bdi></dd></div><div><dt>{t.school}</dt><dd><bdi>{membership.school.name}</bdi></dd></div><div><dt>{t.role}</dt><dd>{t.roles[membership.role]}</dd></div></dl>{membership.entitlements.includes('school.operations')?<LearnerProfile/>:null}<details><summary>{t.reference}</summary><p className="identifier"><bdi>{membership.userId}</bdi></p><p className="identifier"><bdi>{membership.membershipId}</bdi></p></details><p className="account-help">{t.accountHelp}</p><p className="session-note">{t.sessionNote}</p><Button type="button" variant="secondary" onClick={() => void onSignOut()} disabled={signingOut}><CuevoIcon name="logout" size={16} />{signingOut ? t.signingOut : t.signOut}</Button>{signOutFailed ? <p className="form-error" role="alert">{t.signOutError}</p> : null}</section>}
        <footer className="workspace-footer"><p>{t.foundationNote}</p></footer>
        {signOutFailed && view !== 'account' ? <p className="form-error" role="alert">{t.signOutError}</p> : null}
      </main>
      {commandDialog}
  </WorkspaceChrome>}</WorkspaceCommandNavigation>;
}
