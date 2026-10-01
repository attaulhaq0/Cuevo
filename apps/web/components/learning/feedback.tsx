'use client';

import { LearningApiError } from '../../lib/learning-api';
import { useLearningApi } from './use-learning';

export function LearningError({ error }: { error: LearningApiError }) {
  const { t } = useLearningApi();
  const messages = { denied: t.errorDenied, unauthorized: t.errorUnauthorized, conflict: t.errorConflict, invalid: t.errorInvalid, unavailable: t.errorUnavailable, 'too-large': t.errorTooLarge };
  return <div className="form-error" role="alert"><p>{messages[error.kind]}</p>{error.uncertain ? <p>{t.uncertain}</p> : null}{error.requestId ? <p className="support-reference">{t.requestReference}: <bdi>{error.requestId}</bdi></p> : null}</div>;
}
