import { ar } from './ar';
import { en } from './en';

export type Locale = 'en' | 'ar';
export function getDictionary(locale: Locale) { return locale === 'ar' ? ar : en; }
export function getLocale(value: unknown): Locale { return value === 'ar' ? 'ar' : 'en'; }
