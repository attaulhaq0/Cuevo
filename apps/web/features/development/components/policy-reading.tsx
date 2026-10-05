import { WorkspaceState } from '@cuevo/ui';
import type { Policy } from '../model';
import { developmentAr, developmentEn } from '../messages';

/** Read only the currently admitted policy; approval and period binding stay
 * with Development's existing source reads and command forms. */
export function DevelopmentPolicyReading({ policy, locale }: { policy: Policy; locale: 'en' | 'ar' }) {
  const t = locale === 'ar' ? developmentAr : developmentEn;
  const number = new Intl.NumberFormat(locale);
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' });
  return <div className="development-policy-reading">
    <p className="development-meta">{t.approvedOn}: <time dateTime={policy.approvedAt}><bdi>{date.format(new Date(policy.approvedAt))}</bdi> · UTC</time></p>
    <dl className="development-policy-values">{(['practice', 'revision', 'reflection'] as const).map(kind => <div key={kind}><dt>{t[kind]}</dt><dd>{number.format(policy.points[kind])}</dd></div>)}</dl>
    <div className="development-policy-milestones"><h3>{t.approvedMilestones}</h3>{policy.milestones.length ? <ul>{policy.milestones.map(milestone => <li key={milestone.key}><bdi>{milestone.title}</bdi><span>{t.milestonePoints}: <strong>{number.format(milestone.minimumPoints)}</strong></span></li>)}</ul> : <WorkspaceState kind="empty" icon="milestones" description={t.noPolicyMilestones}/>}</div>
  </div>;
}
