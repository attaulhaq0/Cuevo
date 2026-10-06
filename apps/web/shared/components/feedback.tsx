'use client';

import { LearningApiError } from '../api/client';
import { useApi } from '../hooks/use-api';
import { WorkspaceState } from '@cuevo/ui';


export function LearningError({ error, id }: { error: LearningApiError; id?: string }) {
  const { t } = useApi();
  const messages = { denied: t.errorDenied, unauthorized: t.errorUnauthorized, conflict: t.errorConflict, invalid: t.errorInvalid, unavailable: t.errorUnavailable, 'too-large': t.errorTooLarge, 'ai-unavailable': t.aiUnavailable, 'ai-failed': t.aiFailed };
  const denied=error.kind==='denied'||error.kind==='unauthorized';
  return <WorkspaceState id={id} kind={denied?'denied':error.kind==='unavailable'||error.kind==='ai-unavailable'?'unavailable':'review'} icon={denied?'lock':error.kind==='unavailable'?'offline':'help'} className="form-error" role="alert"><p>{messages[error.kind]}</p>{error.uncertain ? <p>{t.uncertain}</p> : null}{error.requestId ? <details className="support-reference"><summary>{t.requestReference}</summary><bdi>{error.requestId}</bdi></details> : null}</WorkspaceState>;
}
