import Image from 'next/image';
import { CuevoIcon, type CuevoIconName } from '@cuevo/ui';
import type { authEn } from '../messages';
import welcomeFox from '../assets/welcome-fox.webp';

export function LearningLoop({ copy }: { copy: typeof authEn }) {
  const stages: { label: string; icon: CuevoIconName; className: string }[] = [
    { label: copy.learning, icon: 'learning', className: 'learn' }, { label: copy.practice, icon: 'practice', className: 'practice' }, { label: copy.feedback, icon: 'feedback', className: 'feedback' }, { label: copy.progress, icon: 'milestones', className: 'progress' },
  ];
  const roles = [{ label: copy.learner, icon: 'student' as const }, { label: copy.teacher, icon: 'people' as const }, { label: copy.parent, icon: 'parent' as const }, { label: copy.coordinator, icon: 'school' as const }, { label: copy.institution, icon: 'shield' as const }];
  return <div className="auth-visual">
    <div className="learning-loop" aria-label={copy.loop}>
      <ol className="learning-loop__stages">{stages.map(stage => <li key={stage.className}><CuevoIcon name={stage.icon} variant="filled" size={18} /><span>{stage.label}</span></li>)}</ol>
    </div>
    <div className="auth-visual__lower"><div className="learning-loop__roles"><strong>{copy.roleHeading}<br />{copy.roleConnection}</strong><div>{roles.map(role => <span key={role.label}><CuevoIcon name={role.icon} variant="filled" size={19} /><span>{role.label}</span></span>)}</div></div><Image className="auth-welcome-fox" src={welcomeFox} alt={copy.welcomeArt} loading="eager" sizes="(max-width: 767px) 140px, 440px" /></div>
  </div>;
}
