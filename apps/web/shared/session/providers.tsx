'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { createAuthClient, type PublicConfig } from './supabase';
import { fetchMembership, MembershipError, type Membership } from './membership';
import { getDictionary, type Locale } from '../i18n/locale';
import { classifyAuthError } from './auth-error';
import { CommandJournal } from '../api/client';
import { FormDrafts } from './form-drafts';
import { useBrowserDiagnostics, type DiagnosticSignal } from '../diagnostics/use-browser-diagnostics';

type AuthState = 'initializing' | 'signed-out' | 'verifying' | 'ready' | 'error' | 'not-configured';
type AppContext = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  dictionary: ReturnType<typeof getDictionary>;
  status: AuthState;
  membership: Membership | null;
  failure: MembershipError | null;
  signIn: (email: string, password: string) => Promise<'credentials' | 'unavailable' | null>;
  restoreSession: (session: { access_token: string; refresh_token: string }) => Promise<boolean>;
  signOut: () => Promise<boolean>;
  refreshAccess: () => void;
  holdMembershipVerification: () => () => void;
  online: boolean;
  accessToken: string | null;
  apiUrl: string;
  publicConfig:PublicConfig;
  commandJournal: CommandJournal;
  formDrafts: FormDrafts;
  notice: string | null;
  noticeLocation: string | null;
  clearNotice: () => void;
  announce: (message: string) => void;
  selectedChildId: string;
  selectChild: (id: string) => void;
  accessGeneration: number;
  reportDiagnostic: (value: DiagnosticSignal) => void;
};
const Context = createContext<AppContext | null>(null);

export function Providers({ children, initialLocale, config }: { children: ReactNode; initialLocale: Locale; config: PublicConfig }) {
  const [locale, updateLocale] = useState(initialLocale);
  const [client] = useState(() => createAuthClient(config));
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthState>(config.supabaseUrl && config.supabasePublishableKey.startsWith('sb_publishable_') && config.apiUrl ? 'initializing' : 'not-configured');
  const [membership, setMembership] = useState<Membership | null>(null);
  const [failure, setFailure] = useState<MembershipError | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [accessGeneration, setAccessGeneration] = useState(0);
  const [online, setOnline] = useState(true);
  const selectedSchool = useRef<string | undefined>(undefined);
  const activeUser = useRef<string | undefined>(undefined);
  const accessVerified = useRef(false);
  const accountContinuations = useRef(0);
  const commandJournal = useRef(new CommandJournal());
  const formDrafts = useRef(new FormDrafts());
  const [notice, setNotice] = useState<{ message: string; location: string } | null>(null);
  const announce = useCallback((message: string) => setNotice({ message, location: `${window.location.pathname}?${new URLSearchParams(window.location.search).toString()}` }), []);
  const clearNotice = useCallback(() => setNotice(null), []);
  const [selectedChildId, selectChild] = useState('');
  const noticeScope = useRef(`${accessGeneration}:${selectedChildId}`);
  useEffect(() => {
    const scope = `${accessGeneration}:${selectedChildId}`;
    if (noticeScope.current !== scope) { noticeScope.current = scope; setNotice(null); }
  }, [accessGeneration, selectedChildId]);

  const setLocale = useCallback((nextLocale: Locale) => {
    updateLocale(nextLocale);
    // Action confirmations describe the language in which the action completed.
    // Clear that transient notice rather than leave a stale-language confirmation.
    setNotice(null);
    document.documentElement.lang = nextLocale;
    document.documentElement.dir = nextLocale === 'ar' ? 'rtl' : 'ltr';
    document.cookie = `cuevo_locale=${nextLocale}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
  }, []);
  const refreshAccess = useCallback(() => setRefresh((value) => value + 1), []);
  const holdMembershipVerification = useCallback(() => {
    accountContinuations.current++; accessVerified.current = false; setMembership(null); setStatus('verifying'); setRefresh(value => value + 1);
    let released = false;
    return () => { if (released) return; released = true; accountContinuations.current = Math.max(0, accountContinuations.current - 1); if (accountContinuations.current === 0) setRefresh(value => value + 1); };
  }, []);

  useEffect(() => {
    const onOnline = () => { setOnline(true); refreshAccess(); };
    const onOffline = () => { setOnline(false); setMembership(null); accessVerified.current = false; formDrafts.current.clear(); setNotice(null); };
    setOnline(navigator.onLine);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('focus', refreshAccess);
    const revalidation = window.setInterval(refreshAccess, 60_000);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('focus', refreshAccess);
      window.clearInterval(revalidation);
    };
  }, [refreshAccess]);

  useEffect(() => {
    if (!client) return;
    let active = true;
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      setFailure(null);
      if (!nextSession) {
        setMembership(null);
        accessVerified.current = false;
        commandJournal.current.clear();
        formDrafts.current.clear(); setNotice(null); selectChild('');
        selectedSchool.current = undefined;
        activeUser.current = undefined;
        setStatus('signed-out');
      } else {
        if (activeUser.current !== nextSession.user.id) { selectedSchool.current = undefined; accessVerified.current = false; setMembership(null); commandJournal.current.clear(); formDrafts.current.clear(); setNotice(null); selectChild(''); }
        activeUser.current = nextSession.user.id;
        if (!accessVerified.current) setStatus('verifying');
        refreshAccess();
      }
    });
    void client.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) { setStatus('error'); setFailure(new MembershipError('unauthorized')); return; }
      setSession(data.session);
      if (!data.session) setStatus('signed-out');
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, [client, refreshAccess]);

  const accessToken = session?.access_token;
  const reportDiagnostic = useBrowserDiagnostics({ apiUrl: config.apiUrl, userId: membership?.userId, schoolId: membership?.schoolId, accessToken: status === 'ready' ? accessToken : undefined, ready: status === 'ready', online, accessGeneration, locale });
  useEffect(() => {
    if (!accessToken || !online) return;
    if (accountContinuations.current > 0) { setMembership(null); accessVerified.current = false; setStatus('verifying'); return; }
    const controller = new AbortController();
    if (!accessVerified.current) { setStatus('verifying'); setMembership(null); }
    setFailure(null);
    void fetchMembership({ apiUrl: config.apiUrl, accessToken, schoolId: selectedSchool.current, signal: controller.signal })
      .then((current) => {
        if (controller.signal.aborted) return;
        selectedSchool.current = current.schoolId;
        accessVerified.current = true;
        setMembership(current);
        setAccessGeneration(value => value + 1);
        setStatus('ready');
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setMembership(null);
        formDrafts.current.clear(); setNotice(null);
        accessVerified.current = false;
        setStatus('error');
        setFailure(error instanceof MembershipError ? error : new MembershipError('unavailable'));
      });
    return () => controller.abort();
  }, [accessToken, config.apiUrl, online, refresh]);

  const signIn = useCallback(async (email: string, password: string): Promise<'credentials' | 'unavailable' | null> => {
    if (!client) return 'unavailable';
    try {
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (!error) return null;
      return classifyAuthError(error);
    } catch { return 'unavailable'; }
  }, [client]);

  const signOut = useCallback(async () => {
    if (!client) return false;
    try {
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error) return false;
      setMembership(null);
      setSession(null);
      selectedSchool.current = undefined;
      accessVerified.current = false;
      commandJournal.current.clear();
      formDrafts.current.clear(); setNotice(null); selectChild('');
      setStatus('signed-out');
      return true;
    } catch { return false; }
  }, [client]);

  const restoreSession = useCallback(async (session: { access_token: string; refresh_token: string }): Promise<boolean> => {
    if (!client || !session.access_token || !session.refresh_token) return false;
    try { const { error } = await client.auth.setSession(session); return !error; } catch { return false; }
  }, [client]);

  return <Context.Provider value={{ locale, setLocale, dictionary: getDictionary(locale), status, membership, failure, signIn, restoreSession, signOut, refreshAccess, holdMembershipVerification, online, accessToken: status === 'ready' ? accessToken ?? null : null, apiUrl: config.apiUrl, publicConfig:config, commandJournal: commandJournal.current, formDrafts: formDrafts.current, notice: notice?.message ?? null, noticeLocation: notice?.location ?? null, clearNotice, announce, selectedChildId, selectChild, accessGeneration, reportDiagnostic }}>{children}</Context.Provider>;
}

export function useApp() {
  const value = useContext(Context);
  if (!value) throw new Error('Cuevo application context is unavailable.');
  return value;
}
