import type { Locale } from './locale';

// Reconciled canonical human labels; presentation never grants access.
const labels: Record<string, readonly [string, string]> = {
  learning: ['Learning', 'التعلّم'],
  assessment: ['Assessment and feedback', 'التقييم والملاحظات'],
  curriculum: ['Curriculum', 'المنهج'],
  'learner.state': ['Learning progress', 'تقدّم التعلّم'],
  improvement: ['Next steps', 'الخطوات التالية'],
  'school.operations': ['School operations', 'إدارة المدرسة'],
  'school.context': ['School information', 'معلومات المدرسة'],
  development: ['Learning goals and recognition', 'أهداف التعلّم وتقدير الإنجاز'],
  community: ['School community', 'المجتمع المدرسي'],
  portfolio: ['Learning portfolio', 'ملف التعلّم'],
  'restricted.records': ['Restricted school notes', 'الملاحظات المدرسية المقيّدة'],
};

export function capabilityLabel(code: string, locale: Locale): string {
  if (!Object.hasOwn(labels, code)) return locale === 'ar' ? 'اسم الميزة غير متاح' : 'Feature name unavailable';
  return labels[code][locale === 'ar' ? 1 : 0];
}
