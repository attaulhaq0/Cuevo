'use client';
import { useEffect, useState } from 'react';
import { updateCurriculumSourceDenials, curriculumHasSourceDenial, type CurriculumSourceDenials, type CurriculumSourceRead } from './workspace-model';
/** Current feature owners share denial memory without retaining protected rows
 * or changing the original command journal. */
export function useCurriculumSourceDenial(reads: readonly CurriculumSourceRead[]): boolean {
  const [denials, setDenials] = useState<CurriculumSourceDenials>({});
  const current = updateCurriculumSourceDenials(denials, reads.filter(read => !!read.path));
  useEffect(() => { if (current !== denials) setDenials(current); }, [current, denials]);
  return curriculumHasSourceDenial(current, reads);
}
