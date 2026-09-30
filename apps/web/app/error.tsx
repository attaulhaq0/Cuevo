'use client';

import { Button } from '@cuevo/ui';
import { useApp } from '../components/providers';

export default function ErrorPage({ reset }: { reset: () => void }) {
  const { dictionary: t } = useApp();
  return <main id="main-content" className="access-state"><h1>{t.errorTitle}</h1><p>{t.errorBody}</p><Button type="button" onClick={reset}>{t.retry}</Button></main>;
}
