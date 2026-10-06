'use client';

import { Button, CuevoIcon, WorkspaceState, type CuevoIconName } from '@cuevo/ui';
import type { Membership } from '../../../shared/session/membership';
import { useApp } from '../../../shared/session/providers';
import { capabilityLabel } from '../../../shared/i18n/capability-label';

const capabilities: Record<string, { icon: CuevoIconName }> = {
  learning: { icon: 'learning' },
  assessment: { icon: 'assessment' },
  curriculum: { icon: 'curriculum' },
  'learner.state': { icon: 'progress' },
  improvement: { icon: 'arrow' },
  'school.operations': { icon: 'school' },
  'school.context': { icon: 'school' },
  community: { icon: 'community' },
  portfolio: { icon: 'portfolio' },
  development: { icon: 'development' },
  'restricted.records': { icon: 'shield' },
};

/** Membership and school capabilities are distinct from record authorization. */
export function WorkspaceAccessView({ membership, onRefresh, locale, dictionary: t }: { membership: Membership; onRefresh: () => void; locale: 'en' | 'ar'; dictionary: ReturnType<typeof useApp>['dictionary'] }) {
  return <div className="workspace-access">
    <section className="workspace-access__membership" aria-labelledby="access-membership-heading">
      <header><CuevoIcon name="person" size={28}/><h2 id="access-membership-heading">{t.activeMembership}</h2></header>
      <dl><div><dt>{t.school}</dt><dd><bdi>{membership.school.name}</bdi></dd></div><div><dt>{t.role}</dt><dd>{t.roles[membership.role]}</dd></div></dl>
      <p>{t.activeMembershipBody}</p>
      <Button type="button" variant="secondary" onClick={onRefresh}><CuevoIcon name="refresh" size={20}/>{t.refresh}</Button>
    </section>
    <section className="workspace-access__capabilities" aria-labelledby="capabilities-heading">
      <header><CuevoIcon name="shield" size={28}/><h2 id="capabilities-heading">{t.capabilityTitle}</h2></header>
      <p>{t.capabilityBody}</p>
      {membership.entitlements.length ? <ul>{membership.entitlements.map(code => <li key={code}><CuevoIcon name={capabilities[code]?.icon ?? 'help'} size={26}/><span>{capabilityLabel(code, locale)}</span></li>)}</ul> : <WorkspaceState kind="unknown" icon="shield" title={t.notConfigured} description={t.noCapabilities}/>}
      {membership.role==='admin'&&membership.entitlements.length?<details><summary>{t.technicalDetails}</summary><ul className="workspace-access__source-codes">{membership.entitlements.map(code => <li key={code}><bdi>{code}</bdi></li>)}</ul></details>:null}
    </section>
  </div>;
}

export function WorkspaceAccess({ membership, onRefresh }: { membership: Membership; onRefresh: () => void }) {
  const { dictionary, locale } = useApp();
  return <WorkspaceAccessView membership={membership} onRefresh={onRefresh} locale={locale} dictionary={dictionary}/>;
}
