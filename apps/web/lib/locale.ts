import { ar } from '../messages/ar';
import { en } from '../messages/en';

export type Locale = 'en' | 'ar';
export function getDictionary(locale: Locale) { return locale === 'ar' ? ar : en; }
export function getLocale(value: unknown): Locale { return value === 'ar' ? 'ar' : 'en'; }
