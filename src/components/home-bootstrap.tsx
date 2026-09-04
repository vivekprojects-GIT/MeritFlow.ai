'use client';

import { useEffect, useState } from 'react';
import { AdminDashboard } from './admin-dashboard';
import { CourseBuilder } from './course-builder';
import { InstructorDashboard } from './instructor-dashboard';
import { Landing } from './landing';
import type { AppNotification, CoursePlaylist, CourseSummary } from '@/lib/courses-store';
import type { StudentClass, ClassSummary } from '@/lib/classes-store';
import type { University } from '@/lib/universities-store';

type Profile = {
  id: string;
  email: string;
  role: 'student' | 'instructor' | 'admin';
  accountKind?: 'personal' | 'institutional';
  universityId?: string | null;
};

type BootstrapState =
  | { status: 'loading' }
  | { status: 'guest' }
  | {
      status: 'student';
      profile: Profile;
      courses: CourseSummary[];
      billing: { isPro: boolean; purchases: string[] };
      classes: StudentClass[];
      playlists: CoursePlaylist[];
      notifications: AppNotification[];
    }
  | { status: 'instructor'; profile: Profile; classes: ClassSummary[] }
  | { status: 'admin'; profile: Profile; university: University | null };

export function HomeBootstrap() {
  const [state, setState] = useState<BootstrapState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const profileRes = await fetch('/api/profile');
      if (profileRes.status === 401) {
        if (!cancelled) setState({ status: 'guest' });
        return;
      }
      const profileData = (await profileRes.json()) as { profile?: Profile };
      const profile = profileData.profile;
      if (!profile) {
        if (!cancelled) setState({ status: 'guest' });
        return;
      }

      if (profile.role === 'admin') {
        const uni = (await fetch('/api/admin/university').then((r) => r.json()).catch(() => ({}))) as {
          university?: University | null;
        };
        if (!cancelled) setState({ status: 'admin', profile, university: uni.university ?? null });
        return;
      }

      if (profile.role === 'instructor') {
        const data = (await fetch('/api/classes').then((r) => r.json()).catch(() => ({}))) as {
          classes?: ClassSummary[];
        };
        if (!cancelled) setState({ status: 'instructor', profile, classes: data.classes ?? [] });
        return;
      }

      const [courses, billing, classes, playlists, notifications] = await Promise.all([
        fetch('/api/courses').then((r) => r.json()).catch(() => ({})),
        fetch('/api/billing').then((r) => r.json()).catch(() => ({})),
        fetch('/api/my-classes').then((r) => r.json()).catch(() => ({})),
        fetch('/api/playlists').then((r) => r.json()).catch(() => ({})),
        fetch('/api/notifications').then((r) => r.json()).catch(() => ({})),
      ]);
      if (!cancelled) {
        setState({
          status: 'student',
          profile,
          courses: courses.courses ?? [],
          billing: { isPro: Boolean(billing.isPro), purchases: billing.purchases ?? [] },
          classes: classes.classes ?? [],
          playlists: playlists.playlists ?? [],
          notifications: notifications.notifications ?? [],
        });
      }
    }
    load().catch(() => {
      if (!cancelled) setState({ status: 'guest' });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === 'loading') {
    return <div className="min-h-screen bg-canvas" />;
  }
  if (state.status === 'guest') return <Landing />;
  if (state.status === 'admin') {
    return <AdminDashboard userEmail={state.profile.email} initialUniversity={state.university} />;
  }
  if (state.status === 'instructor') {
    return <InstructorDashboard userEmail={state.profile.email} initialClasses={state.classes} brand={null} />;
  }
  return (
    <CourseBuilder
      accountKind={state.profile.accountKind ?? 'institutional'}
      userEmail={state.profile.email}
      initialCourses={state.courses}
      billing={state.billing}
      initialClasses={state.classes}
      initialPlaylists={state.playlists}
      initialNotifications={state.notifications}
      brand={null}
    />
  );
}
