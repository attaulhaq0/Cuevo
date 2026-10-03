'use client';

import { TrailBackground } from '../../../shared/characters/ui';

import { useId, type ReactNode, type Ref } from 'react';
import { Button, CuevoIcon, type CuevoIconName } from '@cuevo/ui';
import type { StudentTrailAction, StudentTrailAssets, StudentTrailContext, StudentTrailStage } from '../trail-model';
import { studentTrailAr, studentTrailEn } from '../messages';

function TrailAction({ action, primary = false, icon }: { action: StudentTrailAction; primary?: boolean; icon?: CuevoIconName }) {
  return <Button type="button" variant={primary ? 'primary' : 'secondary'} className={primary ? 'student-trail__primary' : 'student-trail__action'} onClick={action.onClick} disabled={action.disabled || action.pending} aria-busy={action.pending || undefined}>
    {icon ? <CuevoIcon name={icon} variant="filled" /> : null}<span>{action.label}</span><CuevoIcon className="student-trail__direction" name="arrow" size={primary ? 25 : 20} />
  </Button>;
}

function TrailQuietAction({ action }: { action: StudentTrailAction }) {
  return <Button type="button" variant="quiet" onClick={action.onClick} disabled={action.disabled || action.pending} aria-busy={action.pending || undefined}>{action.label}</Button>;
}

function Illustration({ src, className = '' }: { src?: string; className?: string }) {
  return src ? <img className={`student-trail__illustration ${className}`} src={src} alt="" draggable="false" /> : null;
}

function TrailStage({ stage, src, locale }: { stage: StudentTrailStage; src: string; locale: 'en' | 'ar' }) {
  const t = locale === 'ar' ? studentTrailAr : studentTrailEn;
  const content = <><span className="student-trail__stage-art"><Illustration src={src} />{stage.state === 'complete' ? <span className="student-trail__complete" role="img" aria-label={t.completed}><CuevoIcon name="check" size={22} /></span> : null}</span><strong>{stage.title}</strong><span className="student-trail__stage-description">{stage.description}</span>{stage.state === 'unknown' ? <span className="student-trail__stage-status">{t.notYetKnown}</span> : null}</>;
  const stateLabel = stage.state === 'complete' ? t.completed : stage.state === 'unknown' ? t.notYetKnown : t.available;
  return <li className={`student-trail__stage student-trail__stage--${stage.key}`} data-state={stage.state}>{stage.action ? <button type="button" onClick={stage.action.onClick} disabled={stage.action.disabled || stage.action.pending} aria-busy={stage.action.pending || undefined} aria-label={`${stage.title}. ${stateLabel}. ${stage.action.label}`}>{content}</button> : <div>{content}</div>}</li>;
}

/** The sole Student Trail composition, shared by runtime and its preview.
 * All visible facts and commands come from the authorized feature owner. */
export function StudentTrailView({ context, assets, locale = 'en', headingRef, nativeFeedback }: { context: StudentTrailContext; assets: StudentTrailAssets; locale?: 'en' | 'ar'; headingRef?: Ref<HTMLHeadingElement>; nativeFeedback?: ReactNode }) {
  const t = locale === 'ar' ? studentTrailAr : studentTrailEn;
  const challengeId = useId();
  const number = new Intl.NumberFormat(locale);
  if (context.availability === 'denied' || context.availability === 'offline') return <section className="student-trail student-trail__denied" lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}><h1 ref={headingRef} tabIndex={headingRef ? -1 : undefined}>{t.nextStep}</h1><p role="status">{context.notice || t[context.availability]}</p>{context.recovery ? <TrailAction action={context.recovery} /> : null}</section>;
  const recognition = context.recognition;
  const knownPoints = recognition.status === 'recorded' && recognition.totalPoints !== null;
  const recognitionNote = recognition.status === 'disabled' ? t.recognitionDisabled : recognition.status === 'processing' ? t.recognitionProcessing : recognition.status === 'requires-review' ? t.recognitionReview : t.recognitionUnknown;
  const availabilityNotice = context.availability === 'ready' ? null : context.notice || t[context.availability];
  return <div className="student-trail" lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'} data-availability={context.availability} data-character={context.companion.visible ? 'visible' : 'hidden'}>
    <TrailBackground src={assets.background} className="student-trail__background" />
      {availabilityNotice ? <div className="student-trail__notice" role={context.availability === 'error' ? 'alert' : 'status'}><p>{availabilityNotice}</p>{context.recovery ? <TrailAction action={context.recovery} /> : null}</div> : null}
    <div className="student-trail__content">

      <div className="student-trail__intro-row">
        <header className="student-trail__intro"><h1 ref={headingRef} tabIndex={headingRef ? -1 : undefined}>{context.displayName ? <>{t.hello}, <bdi>{context.displayName}</bdi>!</> : t.helloUnknown}</h1><h2>{t.nextStep}</h2><p>{t.introduction}</p></header>
      </div>

      <div className="student-trail__scene">
        {assets.path ? <Illustration src={assets.path} className="student-trail__path" /> : null}
        <div className="student-trail__current">
          <div className="student-trail__task-art" aria-hidden="true"><span className="student-trail__current-label">{t.currentStep}</span>{assets.workSubject && assets.pedestal ? <><Illustration src={assets.pedestal} className="student-trail__pedestal" /><Illustration src={assets.workSubject} className="student-trail__work-subject" /></> : <Illustration src={assets.work} className="student-trail__work" />}{context.companion.visible ? <div className="student-trail__foxi-crop"><Illustration src={assets.foxi} className="student-trail__foxi" /></div> : null}{context.companion.visible ? <p className="student-trail__encouragement">{t.smallSteps}</p> : null}</div>
          <section className="student-trail__task" aria-labelledby={`${challengeId}-task`}>
            <h2 id={`${challengeId}-task`}>{context.task ? <>{context.task.stepNumber ? `${number.format(context.task.stepNumber)}. ` : ''}{context.task.title}</> : t.taskUnknown}</h2>
            <p className="student-trail__task-description">{context.task?.description || t.taskUnknownBody}</p>
            {context.task ? <div className="student-trail__task-context"><p><CuevoIcon name="learning" /><bdi>{context.task.course || t.courseUnknown}</bdi></p><p><CuevoIcon name="curriculum" /><bdi>{context.task.unit || t.unitUnknown}</bdi></p></div> : null}
            {context.task?.primaryAction ? <TrailAction action={context.task.primaryAction} primary /> : context.recovery ? <TrailAction action={context.recovery} primary /> : null}
            {context.task && ['submitted', 'processing', 'unknown'].includes(context.task.state) ? <p className="student-trail__record-state" role="status">{context.task.state === 'processing' ? t.taskProcessing : context.task.state === 'unknown' ? t.notYetKnown : t.submitted}</p> : null}
          </section>
        </div>
        <section className="student-trail__goal" aria-labelledby={`${challengeId}-goal`}>
          <span className="student-trail__goal-icon">{assets.goal ? <Illustration src={assets.goal} /> : <CuevoIcon name="goal" size={43} />}</span>
          <div><h2 id={`${challengeId}-goal`}>{t.goal}</h2><p>{context.goal?.text || t.goalUnknown}</p></div>
          {context.goal?.action ? <Button type="button" variant="secondary" onClick={context.goal.action.onClick} disabled={context.goal.action.disabled || context.goal.action.pending} aria-busy={context.goal.action.pending || undefined}><CuevoIcon name="practice" />{context.goal.action.label}</Button> : null}
        </section>
        {context.companion.alternative || context.companion.hideAction ? <aside className={`student-trail__companion-picker${context.companion.alternative ? '' : ' student-trail__companion-picker--compact'}`} aria-label={context.companion.name}>
          {context.companion.alternative ? <><Illustration src={assets.owl} className="student-trail__owl" /><div className="student-trail__companion-copy"><h2>{context.companion.alternative.name}</h2><p>{context.companion.alternative.description}</p><Button type="button" variant="secondary" onClick={context.companion.alternative.action.onClick} disabled={context.companion.alternative.action.disabled || context.companion.alternative.action.pending} aria-busy={context.companion.alternative.action.pending || undefined}>{context.companion.alternative.action.label}</Button></div></> : null}
          {context.companion.hideAction ? <Button type="button" variant="quiet" className="student-trail__hide" onClick={context.companion.hideAction.onClick} disabled={context.companion.hideAction.disabled || context.companion.hideAction.pending} aria-busy={context.companion.hideAction.pending || undefined}><span><CuevoIcon name={context.companion.visible ? 'eyeOff' : 'eye'} size={28} /></span>{context.companion.hideAction.label}</Button> : null}
        </aside> : null}
        <ol className="student-trail__stages" aria-label={t.learningTrail}>{context.stages.map(stage => <TrailStage key={stage.key} stage={stage} src={assets[stage.key]} locale={locale} />)}</ol>

        <section className="student-trail__feedback student-trail__panel" aria-labelledby={`${challengeId}-feedback`}>
          <div className="student-trail__panel-heading"><span className="student-trail__symbol student-trail__symbol--feedback"><CuevoIcon name="feedback" variant="filled" size={23} /></span><h2 id={`${challengeId}-feedback`}>{t.teacherFeedback}</h2></div>
          {context.feedback ? <><div className="student-trail__teacher">{context.feedback.teacherImage ? <img src={context.feedback.teacherImage} alt="" className="student-trail__teacher-image" /> : null}<div><h3><bdi>{context.feedback.teacherName || t.teacherUnknown}</bdi></h3>{context.feedback.teacherContext ? <p><bdi>{context.feedback.teacherContext}</bdi></p> : null}</div><p className="student-trail__date"><bdi>{context.feedback.dateLabel || t.dateUnknown}</bdi></p></div><blockquote><span aria-hidden="true">“</span><p>{context.feedback.text}</p></blockquote>{nativeFeedback}{context.feedback.action ? <TrailAction action={context.feedback.action} icon="feedback" /> : null}</> : <p className="student-trail__empty">{t.feedbackUnknown}</p>}
        </section>

        <section className="student-trail__upcoming student-trail__panel" aria-labelledby={`${challengeId}-upcoming`}>
          <div className="student-trail__panel-heading"><CuevoIcon name="calendar" variant="filled" size={26} /><h2 id={`${challengeId}-upcoming`}>{t.upcoming}</h2>{context.upcoming?.viewAll ? <TrailQuietAction action={context.upcoming.viewAll} /> : null}</div>
          {context.upcoming ? <><div className="student-trail__upcoming-task"><span className="student-trail__practice-icon"><CuevoIcon name="reflection" size={32} /></span><div><h3>{context.upcoming.title}</h3><p>{context.upcoming.description}</p>{context.upcoming.availabilityLabel ? <p className="student-trail__available"><CuevoIcon name="calendar" size={20} />{context.upcoming.availabilityLabel}</p> : null}</div><CuevoIcon name="arrow" className="student-trail__direction" size={18} /></div>{context.upcoming.action ? <TrailAction action={context.upcoming.action} icon="student" /> : null}</> : <p className="student-trail__empty">{t.upcomingUnknown}</p>}
        </section>
      </div>

      <div className="student-trail__bottom-row">
        <section className="student-trail__recognition student-trail__panel" aria-labelledby={`${challengeId}-recognition`}>
          <Illustration src={assets.milestone} className="student-trail__treasure" />
          <div className="student-trail__recognition-copy"><div className="student-trail__panel-heading"><h2 id={`${challengeId}-recognition`}>{t.milestones}</h2>{recognition.action ? <TrailQuietAction action={recognition.action} /> : null}</div><div className="student-trail__recognition-body"><div>{knownPoints ? <p className="student-trail__point-total"><strong>{number.format(recognition.totalPoints!)}</strong><span>{t.points}</span></p> : <p className="student-trail__recognition-unknown">{recognitionNote}</p>}{knownPoints ? <p className="student-trail__basis">{t.recognitionBasis}</p> : null}{recognition.periodLabel ? <p className="student-trail__basis"><bdi>{recognition.periodLabel}</bdi></p> : null}{recognition.currentMilestone ? <p className="student-trail__basis">{recognition.currentMilestone}</p> : null}</div>{knownPoints && recognition.entries.length ? <ul className="student-trail__recorded-actions">{recognition.entries.map((entry, index) => <li key={`${entry.kind}:${index}`}><span className={`student-trail__entry-symbol student-trail__entry-symbol--${entry.kind}`}><CuevoIcon name={entry.kind === 'practice' ? 'practice' : entry.kind === 'revision' ? 'feedback' : 'help'} variant="filled" size={17} /></span><span>{entry.label}</span><strong>{entry.points > 0 ? '+' : ''}{number.format(entry.points)}</strong></li>)}</ul> : null}</div></div>
        </section>

        {context.classChallenge ? <section className="student-trail__challenge student-trail__panel" aria-labelledby={`${challengeId}-challenge`}>
          <div className="student-trail__panel-heading"><CuevoIcon name="community" variant="filled" size={30} /><h2 id={`${challengeId}-challenge`}>{t.classChallenge}<span className="student-trail__optional">{t.optional}</span></h2>{context.classChallenge.periodLabel ? <p className="student-trail__period"><bdi>{context.classChallenge.periodLabel}</bdi></p> : null}</div><div className="student-trail__challenge-body"><span className="student-trail__challenge-symbol"><CuevoIcon name="goal" size={38} /></span><div><h3>{context.classChallenge.title}</h3><p>{context.classChallenge.description}</p></div>{assets.community ? <Illustration src={assets.community} className="student-trail__community-art" /> : null}</div>{context.classChallenge.participating === null ? <p className="student-trail__participation" role="status">{context.classChallenge.participationLabel}</p> : <label className="student-trail__participation" htmlFor={challengeId}><input id={challengeId} type="checkbox" checked={context.classChallenge.participating} disabled={!context.classChallenge.onParticipationChange || context.classChallenge.pending} aria-busy={context.classChallenge.pending || undefined} onChange={event => context.classChallenge?.onParticipationChange?.(event.currentTarget.checked)} />{context.classChallenge.participationLabel}</label>}<p className="student-trail__class-note">{t.classNote}</p>{context.classChallenge.action ? <TrailAction action={context.classChallenge.action} /> : null}
        </section> : null}

        {context.help ? <section className="student-trail__help student-trail__panel" aria-labelledby={`${challengeId}-help`}><div className="student-trail__panel-heading"><span className="student-trail__symbol"><CuevoIcon name="help" variant="filled" size={26} /></span><h2 id={`${challengeId}-help`}>{context.help.title}</h2><span className="student-trail__help-mode">{context.help.mode === 'future' ? t.future : context.help.mode === 'human' ? t.humanHelp : t.approvedMaterials}</span></div><div className="student-trail__help-body"><p>{context.help.description}</p>{assets.help ? <Illustration src={assets.help} className="student-trail__help-art" /> : null}</div>{context.help.action ? <TrailAction action={context.help.action} icon="goal" /> : null}<p className="student-trail__help-note">{context.help.note}</p></section> : null}
      </div>

    </div>
  </div>;
}
