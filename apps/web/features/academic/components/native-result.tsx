'use client';

import { useApp } from '../../../shared/session/providers';
import type { NativeResult } from '../model';
import { academicAr, academicEn } from '../messages';
import { versionLabel } from '../../../shared/i18n/version-label';

export function NativeResultView({ result }: { result: NativeResult }) {
  const { locale } = useApp(); const t = locale === 'ar' ? academicAr : academicEn;
  if (result.type === 'numeric') return <div className="native-score"><strong>{new Intl.NumberFormat(locale).format(result.score)}</strong><span> / {new Intl.NumberFormat(locale).format(result.maxScore)}</span></div>;
  return <div className="native-rubric"><p className="learning-form__note"><strong>{result.rubricTitle}</strong> · {t.rubricVersion}: <bdi>{versionLabel(result.rubricVersion, locale)}</bdi></p><dl className="rubric-result-criteria">{result.criteria.map((criterion) => <div key={criterion.criterionKey}><dt>{criterion.criterionTitle}</dt><dd><strong>{criterion.levelLabel}</strong><p>{criterion.levelDescription}</p></dd></div>)}</dl><details><summary>{t.source}</summary><bdi>{result.rubricVersion}</bdi></details><p className="learning-form__note">{t.rubricNote}</p></div>;
}
