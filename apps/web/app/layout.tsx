import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { Providers } from '../shared/session/providers';
import { getLocale } from '../shared/i18n/locale';
import '@cuevo/ui/tokens.css';
import './globals.css';
import '../features/auth/styles.css';
import '../features/learning/styles.css';
import '../features/academic/styles.css';
import '../features/progress/styles.css';
import '../features/improvement/styles.css';
import '../features/school/styles.css';
import '../features/community/styles.css';
import '../features/portfolio/styles.css';
import '../features/development/styles.css';
import '../features/curriculum/styles.css';
import '../features/home/styles.css';

export const metadata: Metadata = {
  title: 'Cuevo — Your school workspace',
  description: 'The Cuevo learning experience platform by E Deviser.',
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = getLocale((await cookies()).get('cuevo_locale')?.value);
  const config = {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    supabasePublishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
    apiUrl: process.env.NEXT_PUBLIC_API_URL ?? '',
  };
  return <html lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}><body><Providers initialLocale={locale} config={config}>{children}</Providers></body></html>;
}
