'use client';

import { useId } from 'react';
import { Button, CuevoIcon, Status } from '@cuevo/ui';
import type { ParentTrailAction, ParentTrailContext } from '../parent-trail-model';
import { parentTrailAr, parentTrailEn } from '../parent-trail-messages';

function Action({ action, primary = false }: { action: ParentTrailAction; primary?: boolean }) {
  return <Button type="button" variant={primary ? 'primary' : 'quiet'} className="parent-trail__action" onClick={action.onClick} disabled={action.pending || action.disabled} aria-busy={action.pending || undefined}><span>{action.label}</span><CuevoIcon name="arrow" className="parent-trail__direction" /></Button>;
}

/** Parent-safe presentational home. Every source is the exact approved current
 * child projection; the owner retains selection, reads and receipt authority. */
export function ParentTrailHomeView({ context, locale = 'en', background }: { context: ParentTrailContext; locale?: 'en' | 'ar'; background?: string }) {
  const t = locale === 'ar' ? parentTrailAr : parentTrailEn;
  const id = useId();
  if (context.availability === 'denied' || context.availability === 'offline' || context.availability === 'error') return <section className="parent-trail parent-trail__recovery" lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}><h1>{t.heading}</h1><p role={context.availability === 'error' ? 'alert' : 'status'}>{context.notice || t[context.availability]}</p>{context.recovery ? <Action action={context.recovery} /> : null}</section>;
  if (context.child.status !== 'ready') {
    const message = context.child.status === 'resolving' ? t.checkingChildren : context.child.status === 'selection-required' ? t.chooseChild : context.child.status === 'requires-review' ? t.identityReview : t.childUnavailable;
    return <section className="parent-trail parent-trail__recovery" lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}><h1>{t.heading}</h1>{context.selector}<p role="status">{message}</p>{context.recovery ? <Action action={context.recovery} /> : null}</section>;
  }
  if (context.availability === 'loading' || !context.snapshot || context.snapshot.childKey !== context.child.key || context.snapshot.status === 'loading') return <section className="parent-trail parent-trail__recovery" lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}><h1>{t.heading}</h1>{context.selector}<p role="status">{t.checkingRecords}</p>{context.recovery ? <Action action={context.recovery} /> : null}</section>;
  const child = context.child;
  const snapshot = context.snapshot.status === 'unavailable' ? { ...context.snapshot, feedback: null, portfolio: null, upcoming: [], upcomingAction: undefined, communication: null, support: null } : context.snapshot;
  const feedback = snapshot.feedback?.publication === 'approved' ? snapshot.feedback : null;
  const portfolio = snapshot.portfolio?.publication === 'approved' ? snapshot.portfolio : null;
  const communication = snapshot.communication?.status === 'available' ? snapshot.communication : null;
  return <div className="parent-trail" lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
    {background ? <img className="parent-trail__background" src={background} alt="" /> : null}
    <div className="parent-trail__content"><header className="parent-trail__intro"><div><h1>{child.name ? <>{t.childHeading} <bdi>{child.name}</bdi></> : t.heading}</h1><p>{t.introduction}</p></div><div className="parent-trail__child-context"><CuevoIcon name="school" variant="filled" size={28} /><div><strong><bdi>{child.schoolName || t.schoolUnknown}</bdi></strong><p><bdi>{child.name || t.childUnknown}</bdi> · <bdi>{child.classLabel || t.classUnknown}</bdi></p>{context.selector}</div></div></header>
      {context.availability !== 'ready' || snapshot.status === 'partial' ? <p className="parent-trail__notice" role="status">{context.notice || (snapshot.status === 'partial' ? t.partial : t[context.availability === 'ready' ? 'loading' : context.availability])}</p> : null}
      <div className="parent-trail__grid"><div className="parent-trail__left"><section className="parent-trail__feedback parent-trail__panel" aria-labelledby={`${id}-feedback`}><div className="parent-trail__panel-heading"><span><CuevoIcon name="reflection" variant="filled" size={25} /></span><h2 id={`${id}-feedback`}>{t.latestFeedback}</h2>{feedback ? <><Status tone="positive">{t.approved}</Status><p className="parent-trail__date"><bdi>{feedback.dateLabel || t.dateUnknown}</bdi></p></> : null}</div>{feedback ? <><div className="parent-trail__feedback-body"><div className="parent-trail__teacher"><span aria-hidden="true"><CuevoIcon name="person" /></span><div><h3><bdi>{feedback.teacherName || t.teacherUnknown}</bdi></h3><p>{t.teacher}</p></div></div><blockquote><span aria-hidden="true">“</span><p>{feedback.text}</p><span aria-hidden="true">”</span></blockquote><div className="parent-trail__feedback-about"><h3>{t.aboutFeedback}</h3><p>{feedback.description}</p></div>{feedback.action ? <Action action={feedback.action} primary /> : null}</div><div className="parent-trail__native-context"><CuevoIcon name="curriculum" size={26} /><div><strong>{feedback.title}</strong>{feedback.nativeResultView}</div><p>{t.approved}</p></div></> : <p className="parent-trail__empty">{t.feedbackUnknown}</p>}</section>
        <section className="parent-trail__portfolio parent-trail__panel" aria-labelledby={`${id}-portfolio`}><div className="parent-trail__panel-heading"><span><CuevoIcon name="portfolio" variant="filled" size={26} /></span><h2 id={`${id}-portfolio`}>{t.portfolio}</h2></div>{portfolio ? <div className="parent-trail__portfolio-body"><span className="parent-trail__document"><CuevoIcon name="reflection" size={64} /></span><div><h3>{portfolio.title}</h3><p>{portfolio.description}</p>{portfolio.action ? <Action action={portfolio.action} /> : null}</div></div> : <p className="parent-trail__empty">{t.portfolioUnknown}</p>}</section>
      </div><div className="parent-trail__right">
        <section className="parent-trail__upcoming parent-trail__panel" aria-labelledby={`${id}-upcoming`}><div className="parent-trail__panel-heading"><span><CuevoIcon name="calendar" variant="filled" size={25} /></span><h2 id={`${id}-upcoming`}>{t.upcoming}</h2></div><p className="parent-trail__section-note">{t.upcomingIntro}</p>{snapshot.upcoming.length ? <ul>{snapshot.upcoming.map(item => <li key={item.key}><span><CuevoIcon name="reflection" size={26} /></span><div><h3>{item.title}</h3><p>{item.description}</p><p><bdi>{item.dateLabel || t.dateUnknown}</bdi></p>{item.action ? <Action action={item.action} /> : null}</div></li>)}</ul> : <p className="parent-trail__empty">{t.upcomingUnknown}</p>}{snapshot.upcomingAction ? <Action action={snapshot.upcomingAction} /> : null}</section>
        <section className="parent-trail__communication parent-trail__panel" aria-labelledby={`${id}-communication`}><div className="parent-trail__panel-heading"><span><CuevoIcon name="feedback" variant="filled" size={25} /></span><h2 id={`${id}-communication`}>{t.communication}</h2></div>{communication ? <div className="parent-trail__communication-body"><span><CuevoIcon name="feedback" size={30} /></span><div><h3>{communication.title}</h3><p>{communication.description}</p><p><bdi>{communication.teacherName || t.teacherUnknown}</bdi></p>{communication.action ? <Action action={communication.action} /> : null}</div></div> : <p className="parent-trail__empty">{t.communicationUnknown}</p>}</section>
        <section className="parent-trail__support parent-trail__panel" aria-labelledby={`${id}-support`}><div className="parent-trail__panel-heading"><span><CuevoIcon name="parent" variant="filled" size={27} /></span><h2 id={`${id}-support`}>{t.support}</h2></div>{snapshot.support ? <div className="parent-trail__support-body"><h3>{snapshot.support.title}</h3><p>{snapshot.support.description}</p>{snapshot.support.action ? <Action action={snapshot.support.action} /> : null}<CuevoIcon className="parent-trail__support-symbol" name="community" variant="filled" size={92} /></div> : <p className="parent-trail__empty">{t.supportUnknown}</p>}</section>
      </div></div>
    </div>
  </div>;
}
