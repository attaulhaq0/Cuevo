'use client';

import { LearningApiError } from '../api/client';
import { useApi } from '../hooks/use-api';


export function LearningError({ error, id }: { error: LearningApiError; id?: string }) {
  const { t } = useApi();
  const messages = { denied: t.errorDenied, unauthorized: t.errorUnauthorized, conflict: t.errorConflict, invalid: t.errorInvalid, unavailable: t.errorUnavailable, 'too-large': t.errorTooLarge, 'ai-unavailable': t.aiUnavailable, 'ai-failed': t.aiFailed };
  return <div id={id} className="form-error" role="alert"><p>{messages[error.kind]}</p>{error.uncertain ? <p>{t.uncertain}</p> : null}{error.requestId ? <p className="support-reference">{t.requestReference}: <bdi>{error.requestId}</bdi></p> : null}</div>;
}
