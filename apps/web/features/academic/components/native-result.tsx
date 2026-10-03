'use client';

import { useApp } from '../../../shared/session/providers';
import type { NativeResult } from '../model';
import { academicAr, academicEn } from '../messages';

export function NativeResultView({ result }: { result: NativeResult }) {
  const { locale } = useApp(); const t = locale === 'ar' ? academicAr : academicEn;
  if (result.type === 'numeric') {
    const format = new Intl.NumberFormat(locale);
    const score = format.format(result.score); const maximum = format.format(result.maxScore);
    return <div className="native-score" role="img" aria-label={`${score} ${t.outOf} ${maximum}`}><bdi dir="ltr" aria-hidden="true"><strong>{score}</strong><span> / {maximum}</span></bdi></div>;
  }
  return <div className="native-rubric"><p className="learning-form__note"><strong>{result.rubricTitle}</strong></p><dl className="rubric-result-criteria">{result.criteria.map((criterion) => <div key={criterion.criterionKey}><dt>{criterion.criterionTitle}</dt><dd><strong>{criterion.levelLabel}</strong><p>{criterion.levelDescription}</p></dd></div>)}</dl><details><summary>{t.source}</summary><bdi>{result.rubricVersion}</bdi></details><p className="learning-form__note">{t.rubricNote}</p></div>;
}
