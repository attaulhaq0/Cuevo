import { LearningApiError } from './client.ts';
export function parseList<T>(value: unknown, parse: (item: unknown) => T): T[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new LearningApiError('invalid');
  const items = (value as Record<string, unknown>).items;
  if (!Array.isArray(items) || items.length > 100) throw new LearningApiError('invalid');
  return items.map(item => parse(item));
}
