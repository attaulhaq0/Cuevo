import { ArrowRight, BookOpen, ChartNoAxesColumnIncreasing, ChevronDown, CircleHelp, Eye, EyeOff, Globe, GraduationCap, Heart, Laptop, LockKeyhole, Mail, MessageCircle, PencilLine, School, ShieldCheck, TrendingUp, UserRound, UsersRound, type LucideProps } from 'lucide-react';
import type { ReactNode } from 'react';

const icons = { arrow: ArrowRight, chevron: ChevronDown, learning: BookOpen, help: CircleHelp, eye: Eye, eyeOff: EyeOff, language: Globe, student: GraduationCap, parent: Heart, device: Laptop, lock: LockKeyhole, email: Mail, feedback: MessageCircle, practice: PencilLine, school: School, shield: ShieldCheck, progress: TrendingUp, milestones: ChartNoAxesColumnIncreasing, person: UserRound, people: UsersRound };
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
};

export function CuevoIcon({ name, size = 20, variant = 'outline', ...props }: LucideProps & { name: CuevoIconName; variant?: 'outline' | 'filled' }) {
  if (variant === 'filled' && filled[name]) return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" {...props}>{filled[name]}</svg>;
  const Icon = icons[name];
  return <Icon aria-hidden="true" size={size} strokeWidth={1.8} {...props} />;
}
