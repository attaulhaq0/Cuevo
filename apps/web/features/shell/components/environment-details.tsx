import type { Locale } from '../../../shared/i18n/locale';

const copy = {
  en: { title:'About this workspace', body:'Your school controls access to learning, shared results and communication. Source and approval details appear beside the relevant work.' },
  ar: { title:'عن مساحة العمل هذه', body:'تحدد مدرستك صلاحيات الوصول إلى التعلّم والنتائج المشتركة والتواصل. تظهر تفاصيل المصادر والموافقات بجوار العمل المعني.' },
};

/** Optional account help makes no assumption about the school's data environment. */
export function EnvironmentDetails({ locale }: { locale:Locale }) {
  const t=copy[locale];
  return <details className="workspace-environment-details"><summary>{t.title}</summary><p>{t.body}</p></details>;
}
