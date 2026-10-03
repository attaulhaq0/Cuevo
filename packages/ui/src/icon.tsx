import { ArrowRight, Bell, BookOpen, CalendarDays, ChartNoAxesColumnIncreasing, Check, ChevronDown, CircleHelp, ClipboardCheck, Eye, EyeOff, FolderOpen, Globe, GraduationCap, Heart, House, Laptop, LibraryBig, LockKeyhole, LogOut, Mail, MessageCircle, NotebookPen, PencilLine, RefreshCw, School, Search, Settings, ShieldCheck, Sprout, Target, TrendingUp, UserRound, UsersRound, X, type LucideProps } from 'lucide-react';
import type { ReactNode } from 'react';

const icons = { arrow: ArrowRight, chevron: ChevronDown, learning: BookOpen, help: CircleHelp, eye: Eye, eyeOff: EyeOff, language: Globe, student: GraduationCap, parent: Heart, device: Laptop, lock: LockKeyhole, email: Mail, feedback: MessageCircle, practice: PencilLine, school: School, shield: ShieldCheck, progress: TrendingUp, milestones: ChartNoAxesColumnIncreasing, person: UserRound, people: UsersRound, home: House, community: UsersRound, portfolio: FolderOpen, assessment: ClipboardCheck, development: Sprout, curriculum: LibraryBig, settings: Settings, notification: Bell, search: Search, calendar: CalendarDays, goal: Target, reflection: NotebookPen, close: X, check: Check, refresh: RefreshCw, logout: LogOut };
export type CuevoIconName = keyof typeof icons;

// The approved learning illustrations use a compact filled family. These vector
// glyphs share the same registry, currentColor and 24px optical grid as utilities.
const filled: Partial<Record<CuevoIconName, ReactNode>> = {
  learning: <><path d="M2 4.2C5.5 3.2 8.7 3.5 11.25 5.2V21C8.7 19.4 5.3 19.2 2 20V4.2Z" /><path d="M22 4.2C18.5 3.2 15.3 3.5 12.75 5.2V21C15.3 19.4 18.7 19.2 22 20V4.2Z" /></>,
  practice: <path fillRule="evenodd" d="m17.25 2.5 4.25 4.25a2.1 2.1 0 0 1 0 2.97L9.2 22 2 23l1-7.2L15.77 2.5a1.05 1.05 0 0 1 1.48 0ZM5.2 16.1l2.7 2.7L17.6 9.1l-2.7-2.7-9.7 9.7ZM4.5 18.2l-.3 2 2-.3-1.7-1.7Z" clipRule="evenodd" />,
  feedback: <><path d="M12 2a10 10 0 0 0-8.7 14.94L1.5 22l5.26-1.77A10 10 0 1 0 12 2Z" /><path d="M7.5 12h9" fill="none" stroke="var(--color-on-accent)" strokeWidth="2.1" strokeLinecap="round" /></>,
  milestones: <><rect x="3" y="14" width="4.2" height="8" rx="2.1" /><rect x="9.9" y="8" width="4.2" height="14" rx="2.1" /><rect x="16.8" y="2" width="4.2" height="20" rx="2.1" /></>,
  student: <><path d="M1 8.3 12 3l11 5.3L12 13.6 1 8.3Z" /><path d="M5 12.2V17c4.3 3.1 9.7 3.1 14 0v-4.8l-7 3.4-7-3.4Z" /><path d="M22 10v8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></>,
  people: <><circle cx="9" cy="7" r="4" /><path d="M1.5 20v-3c0-3 2.4-5 5.5-5h4c3.1 0 5.5 2 5.5 5v3h-15Z" /><circle cx="18" cy="7.5" r="3" /><path d="M17.5 12.5c3.3 0 5 1.9 5 4.5v3H18v-3a8 8 0 0 0-1.4-4.4l.9-.1Z" /></>,
  parent: <path fillRule="evenodd" d="M12 21.5 2.8 12.8A6.2 6.2 0 0 1 12 4.5a6.2 6.2 0 0 1 9.2 8.3L12 21.5ZM12 16l4.8-4.5c2.5-2.5-.8-5.9-3.2-3.6L12 9.5l-1.6-1.6c-2.4-2.3-5.7 1.1-3.2 3.6L12 16Z" clipRule="evenodd" />,
  school: <path fillRule="evenodd" d="M8 2h10v19h3v2H2v-2h2V9h4V2ZM11 5v3h2V5h-2Zm4 0v3h2V5h-2Zm-4 6v3h2v-3h-2Zm4 0v3h2v-3h-2ZM6 12v3h2v-3H6Zm0 5v3h2v-3H6Zm5 0v6h4v-6h-4Z" clipRule="evenodd" />,
  shield: <path fillRule="evenodd" d="M12 1.5 22 5v7.1c0 5.3-4.1 8.7-10 11-5.9-2.3-10-5.7-10-11V5l10-3.5ZM12 4 4.3 6.7V12c0 4.2 3.2 6.9 7.7 8.9V4Z" clipRule="evenodd" />,
  home: <path fillRule="evenodd" d="M12 2 1 11h3v11h16V11h3L12 2Zm-2 12h4v8h-4v-8Z" clipRule="evenodd" />,
  community: <><circle cx="12" cy="6" r="3.5" /><circle cx="4" cy="9" r="2.5" /><circle cx="20" cy="9" r="2.5" /><path d="M5.5 21v-5a6.5 6.5 0 0 1 13 0v5h-13ZM.5 21v-5a4 4 0 0 1 4.5-4 8.3 8.3 0 0 0-1.5 4v5h-3Zm20 0v-5a8.3 8.3 0 0 0-1.5-4 4 4 0 0 1 4.5 4v5h-3Z" /></>,
  portfolio: <><path d="M2 7V5a2 2 0 0 1 2-2h4l3 3h9a2 2 0 0 1 2 2v1H4L2 7Z" /><path d="M2 9.5h20v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-10Z" /></>,
  assessment: <path fillRule="evenodd" d="M9 2h6v2h3a3 3 0 0 1 3 3v13a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h3V2Zm-.5 4v2h7V6h-7ZM9 13l-2 2 4 4 6-6-2-2-4 4-2-2Z" clipRule="evenodd" />,
  development: <><path d="M13 13C12 5 16 2 23 2c0 7-3 11-10 11ZM10 15C3 15 1 11 1 5c7 0 11 3 11 10h-2Z" /><path d="M12 21v-8m0 5L7 11m5 3 5-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></>,
  curriculum: <><rect x="2" y="3" width="5" height="19" rx="1.5" /><rect x="8.5" y="3" width="5" height="19" rx="1.5" /><path d="m14.2 5 4.5-1.2 4.8 17.7-4.5 1.2-4.8-17.7Z" /></>,
  notification: <><path d="M12 2a2 2 0 0 1 2 2v.5a6 6 0 0 1 4 5.7V14l3 4H3l3-4v-3.8a6 6 0 0 1 4-5.7V4a2 2 0 0 1 2-2Z" /><path d="M9 20h6a3 3 0 0 1-6 0Z" /></>,
  calendar: <path fillRule="evenodd" d="M5 1h2v3h10V1h2v3h1a3 3 0 0 1 3 3v13a3 3 0 0 1-3 3H4a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h1V1Zm-2 9v10c0 .6.4 1 1 1h16c.6 0 1-.4 1-1V10H3Zm3 3h3v3H6v-3Zm5 0h3v3h-3v-3Zm5 0h3v3h-3v-3ZM6 17h3v3H6v-3Zm5 0h3v3h-3v-3Z" clipRule="evenodd" />,
};

export function CuevoIcon({ name, size = 20, variant = 'outline', ...props }: LucideProps & { name: CuevoIconName; variant?: 'outline' | 'filled' }) {
  if (variant === 'filled' && filled[name]) return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" {...props}>{filled[name]}</svg>;
  const Icon = icons[name];
  return <Icon aria-hidden="true" size={size} strokeWidth={1.8} {...props} />;
}
