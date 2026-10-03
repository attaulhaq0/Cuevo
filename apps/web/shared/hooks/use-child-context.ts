'use client';
import { useApp } from '../session/providers';
import { usePaginatedLearningQuery } from './use-paginated-query';
import { parsePersonChoice } from '../api/people';
export function useChildContext(refresh = 0) {
  const { membership, selectedChildId, selectChild } = useApp();
  const parent = membership?.role === 'parent';
  const query = usePaginatedLearningQuery(parent ? '/v1/people?limit=100' : null, parsePersonChoice, refresh);
  const children = query.data.filter(person => person.role === 'student');
  const candidate = !query.loading && !query.error ? children.find(person => person.id === selectedChildId) ?? (!selectedChildId && children.length === 1 && !query.nextCursor ? children[0] : undefined) : undefined;
  const child = candidate && children.filter(person => person.displayName === candidate.displayName && person.classLabels.join('|') === candidate.classLabels.join('|')).length === 1 ? candidate : undefined;
  return { parent, query, children, child, selectChild };
}
