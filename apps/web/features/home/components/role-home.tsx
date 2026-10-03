'use client';
import type { Ref } from 'react';
import { useApp } from '../../../shared/session/providers';
import type { HomeDestination } from '../model';
import { StudentTrailHome } from './student-trail-home';
import { TeacherTrailHome } from './teacher-trail-home-connected';
import { ParentTrailHomeConnected } from './parent-trail-home-connected';
import { CoordinatorTrailHomeConnected } from './coordinator-trail-home-connected';
import { AdminTrailHome } from './admin-trail-home-connected';

/** One role composition. Every connected adapter retains its feature owners'
 * current authorized records; Home owns no domain command. */
export function RoleHome({ onNavigate, headingRef }: { onNavigate: (target: HomeDestination) => void; headingRef?: Ref<HTMLHeadingElement> }) {
  const { membership } = useApp();
  if (membership?.role === 'student') return <StudentTrailHome onNavigate={onNavigate} headingRef={headingRef} />;
  if (membership?.role === 'teacher') return <TeacherTrailHome onNavigate={onNavigate} headingRef={headingRef} />;
  if (membership?.role === 'parent') return <ParentTrailHomeConnected onNavigate={onNavigate} headingRef={headingRef} />;
  if (membership?.role === 'coordinator') return <CoordinatorTrailHomeConnected onNavigate={onNavigate} headingRef={headingRef} />;
  if (membership?.role === 'admin') return <AdminTrailHome onNavigate={onNavigate} headingRef={headingRef} />;
  return null;
}