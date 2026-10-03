import type { authEn } from '../messages';
import studioCompanions from '../assets/studio-companions.webp';
import welcomeFox from '../assets/welcome-fox.webp';
import { trailAssets, trailRoleAssets } from '../../../shared/characters/assets';

export function LearningLoop({ copy }: { copy: typeof authEn }) {
  const stages: { label: string; artwork: string; className: string }[] = [
    { label: copy.learning, artwork: trailAssets.lesson, className: 'learn' }, { label: copy.practice, artwork: trailAssets.practice, className: 'practice' }, { label: copy.feedback, artwork: trailAssets.feedback, className: 'feedback' }, { label: copy.progress, artwork: trailAssets.grow, className: 'progress' },
  ];
  const roles = [{ label: copy.learner, artwork: trailRoleAssets.student }, { label: copy.teacher, artwork: trailRoleAssets.teacher }, { label: copy.parent, artwork: trailRoleAssets.parent }, { label: copy.coordinator, artwork: trailRoleAssets.coordinator }, { label: copy.institution, artwork: trailRoleAssets.school }];
  return <div className="auth-visual">
    <div className="learning-loop" aria-label={copy.loop}>
      <div className="learning-loop__journey">
        <ol className="learning-loop__stages" aria-label={copy.loop}>{stages.map(stage => <li key={stage.className} className={`learning-loop__stage learning-loop__stage--${stage.className}`}><img src={stage.artwork} width={56} height={56} alt="" className="auth-stage-art"/><span>{stage.label}</span></li>)}</ol>
      </div>
    </div>
    <div className="auth-visual__lower"><div className="learning-loop__roles"><strong>{copy.roleHeading}<br />{copy.roleConnection}</strong><div>{roles.map(role => <span key={role.label}><img className="auth-role-art" src={role.artwork} width={48} height={48} alt=""/><span>{role.label}</span></span>)}</div></div><div className="auth-companions"><div className="auth-companions__scene"><picture><source media="(max-width: 767px)" srcSet={welcomeFox.src} width={welcomeFox.width} height={welcomeFox.height}/><img className="auth-companions__image" src={studioCompanions.src} width={studioCompanions.width} height={studioCompanions.height} alt={copy.welcomeArt}/></picture></div></div></div>
  </div>;
}
