import Link from 'next/link';
import { cookies } from 'next/headers';
import { getDictionary, getLocale } from '../shared/i18n/locale';

export default async function NotFound() {
  const t = getDictionary(getLocale((await cookies()).get('cuevo_locale')?.value));
  return <main id="main-content" className="access-state"><h1>{t.notFoundTitle}</h1><p>{t.notFoundBody}</p><Link className="button button--primary" href="/">{t.returnHome}</Link></main>;
}
