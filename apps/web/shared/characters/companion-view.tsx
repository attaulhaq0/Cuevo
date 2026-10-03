'use client';

import { useState, type ReactNode } from 'react';
import { resolveCompanionPose, type CompanionName, type CompanionRegistry, type CompanionState, type CompanionReceipt } from './model';

/** One static decorative renderer. Selection/state/receipt are already
 * authorized by the owner; this component observes or awards nothing. */
export function CompanionView({ registry, character, state, visible, quiet = false, reducedMotion = false, receipt, fallback = null, className = '' }: {
  registry: CompanionRegistry;
  character: CompanionName;
  state: CompanionState;
  visible: boolean;
  quiet?: boolean;
  reducedMotion?: boolean;
  receipt?: CompanionReceipt;
  fallback?: ReactNode;
  className?: string;
}) {
  const [failedSources, setFailedSources] = useState<string[]>([]);
  const pose = resolveCompanionPose(registry, character, state === 'acknowledge' && !receipt ? 'ready' : state, failedSources);
  if (!visible || !pose) return <>{fallback}</>;
  return <span className={`companion-view ${className}`} data-presentation={quiet || reducedMotion ? 'quiet' : 'static'}><img src={pose.src} width={pose.width} height={pose.height} alt="" aria-hidden="true" draggable="false" decoding="async" onError={() => setFailedSources(current => current.includes(pose.src) ? current : [...current, pose.src])} />{fallback}</span>;
}
