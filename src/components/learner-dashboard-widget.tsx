'use client';

import { useState, type ReactNode } from 'react';
import type { UpcomingAssignment } from '@/lib/assignments-store';
import type { StudentClass } from '@/lib/classes-store';
import type { AppNotification, CoursePlaylist, CourseSummary } from '@/lib/courses-store';
import { dueInfo, formatDueDate } from '@/lib/due';
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  AwardIcon,
  BellIcon,
  BookIcon,
  CheckIcon,
  ClockIcon,
  FolderIcon,
  HeartIcon,
  LayersIcon,
  PlusIcon,
  SparklesIcon,
} from './icons';
import { LearnerPulsePanel } from './learner-pulse';
import { ModeAnalyticsPanel, type ModeAnalyticsColumn, type ModeAnalyticsInsight } from './mode-analytics-panel';

type ActiveBuild = {
  title: string;
  status: 'building' | 'ready' | 'error';
  stage: string;
  message: string;
  completedModules: number;
  totalModules: number;
};

export function LearnerDashboardWidget({
  courses,
  classes,
  playlists,
  deadlines,
  notifications,
  activeBuild,
  onCreateCourse,
  onOpenBuild,
  onOpenDeadline,
}: {
  courses: CourseSummary[];
  classes: StudentClass[];
  playlists: CoursePlaylist[];
  deadlines: UpcomingAssignment[];
  notifications: AppNotification[];
  activeBuild: ActiveBuild | null;
  onCreateCourse?: () => void;
  onOpenBuild?: () => void;
  onOpenDeadline: (classId: string, assignmentId?: string) => void;
}) {
  const [now] = useState(() => Date.now());
  const allTracks = [
    ...courses.map((course) => ({
      id: course.id,
      title: course.title,
      kind: 'Course',
      lessonCount: course.lessonCount,
      completedCount: course.completedCount,
      category: course.category || 'General',
    })),
    ...classes.map((klass) => ({
      id: klass.id,
      title: klass.title,
      kind: 'Class',
      lessonCount: klass.lessonCount,
      completedCount: klass.completedCount,
      category: klass.level || 'Class',
    })),
  ];
  const totalLessons = allTracks.reduce((sum, item) => sum + item.lessonCount, 0);
  const completedLessons = allTracks.reduce((sum, item) => sum + item.completedCount, 0);
  const progressPct = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;
  const activeTracks = allTracks.filter((item) => item.completedCount > 0 && item.completedCount < item.lessonCount);
  const finishedTracks = allTracks.filter((item) => item.lessonCount > 0 && item.completedCount >= item.lessonCount);
  const favoriteCount = courses.filter((course) => course.favorite).length;
  const organizedCourses = courses.filter((course) => course.playlistIds.length > 0).length;
  const organizedPct = courses.length > 0 ? Math.round((organizedCourses / courses.length) * 100) : 0;
  const unreadCount = notifications.filter((item) => item.readAt == null).length;
  const openDeadlines = deadlines
    .filter((item) => !item.graded)
    .slice()
    .sort((a, b) => a.dueAt - b.dueAt);
  const overdue = openDeadlines.filter((item) => dueInfo(item.dueAt, now, submissionOf(item)).tone === 'overdue');
  const dueSoon = openDeadlines.filter((item) => {
    const tone = dueInfo(item.dueAt, now, submissionOf(item)).tone;
    return tone === 'overdue' || tone === 'soon';
  });
  const categories = topCategories(courses);
  const next = nextAction({ activeBuild, overdue, dueSoon, activeTracks, allTracks });
  const buildProgress = activeBuild ? buildPct(activeBuild) : courses.length > 0 ? 100 : 0;
  const deadlineReadiness =
    openDeadlines.length > 0 ? Math.round(((openDeadlines.length - overdue.length) / openDeadlines.length) * 100) : 100;
  const modeAnalytics: ModeAnalyticsColumn[] = [
    {
      eyebrow: 'Create mode',
      title: activeBuild ? 'Live course stream' : 'Saved course workspace',
      value: activeBuild ? `${activeBuild.completedModules}/${activeBuild.totalModules || 0}` : courses.length.toLocaleString(),
      detail: activeBuild ? activeBuild.stage : 'courses available to organize',
      icon: <SparklesIcon className="h-4 w-4" />,
      rows: [
        { label: 'Generation progress', value: `${buildProgress}%`, pct: buildProgress, tone: activeBuild?.status === 'error' ? 'warn' : 'neutral' },
        { label: 'Playlist organization', value: `${organizedPct}%`, pct: organizedPct },
        { label: 'Favorites signal', value: favoriteCount.toLocaleString(), pct: Math.min(100, favoriteCount * 20) },
      ],
      signals: ['Live build card', 'Playlist routing', 'Failure notifications', 'Ask /edit tutor'],
      tone: activeBuild?.status === 'error' ? 'warn' : undefined,
    },
    {
      eyebrow: 'Learn mode',
      title: 'Study momentum',
      value: `${progressPct}%`,
      detail: `${completedLessons}/${totalLessons || 0} lessons completed`,
      icon: <BookIcon className="h-4 w-4" />,
      rows: [
        { label: 'Active track coverage', value: `${activeTracks.length}/${allTracks.length || 0}`, pct: allTracks.length ? Math.round((activeTracks.length / allTracks.length) * 100) : 0 },
        { label: 'Deadline readiness', value: `${deadlineReadiness}%`, pct: deadlineReadiness, tone: overdue.length > 0 ? 'warn' : 'good' },
        { label: 'Finished tracks', value: finishedTracks.length.toLocaleString(), pct: allTracks.length ? Math.round((finishedTracks.length / allTracks.length) * 100) : 0, tone: finishedTracks.length > 0 ? 'good' : 'neutral' },
      ],
      signals: ['Due radar', 'Tutor ask mode', 'Completion tracking', 'Class progress'],
      tone: overdue.length > 0 ? 'warn' : undefined,
    },
  ];
  const executiveInsights: ModeAnalyticsInsight[] = [
    {
      label: 'Next move',
      value: next.label,
      detail: next.title,
      tone: next.tone === 'warning' ? 'warn' : next.tone === 'success' ? 'good' : 'neutral',
    },
    {
      label: 'Learning health',
      value: `${progressPct}%`,
      detail: totalLessons > 0 ? `${completedLessons}/${totalLessons} lessons completed across courses and classes.` : 'Start a course or join a class to activate progress analytics.',
      tone: finishedTracks.length > 0 ? 'good' : 'neutral',
    },
    {
      label: 'Risk watch',
      value: overdue.length > 0 ? `${overdue.length}` : 'Clear',
      detail: overdue.length > 0 ? 'Overdue assignments need attention before new learning work.' : 'No overdue assignments are blocking momentum.',
      tone: overdue.length > 0 ? 'warn' : 'good',
    },
  ];

  return (
    <section className="mt-10 rounded-[26px] border border-line bg-surface p-4 shadow-soft sm:p-5 lg:p-6">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <span className="eyebrow">Dashboard</span>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">Learning command center</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">
                Courses, classes, deadlines, builds, and study rhythm in one place.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {onCreateCourse && (
                <button
                  type="button"
                  onClick={onCreateCourse}
                  className="press ring-focus inline-flex items-center gap-1.5 rounded-full bg-accent-fill px-3.5 py-2 text-xs font-bold text-canvas"
                >
                  <PlusIcon className="h-3.5 w-3.5" />
                  Create course
                </button>
              )}
              <span
                className={[
                  'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold',
                  next.tone === 'warning'
                    ? 'bg-warn-soft text-warn'
                    : next.tone === 'success'
                      ? 'bg-success-soft text-success'
                      : 'bg-mint text-accent',
                ].join(' ')}
              >
                {next.tone === 'warning' ? <AlertTriangleIcon className="h-3.5 w-3.5" /> : <SparklesIcon className="h-3.5 w-3.5" />}
                {next.label}
              </span>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric icon={<LayersIcon className="h-3.5 w-3.5" />} label="Active tracks" value={String(activeTracks.length)} sub={`${allTracks.length} total`} />
            <Metric icon={<BookIcon className="h-3.5 w-3.5" />} label="Lesson progress" value={`${progressPct}%`} sub={`${completedLessons}/${totalLessons || 0} done`} />
            <Metric icon={<ClockIcon className="h-3.5 w-3.5" />} label="Due soon" value={String(dueSoon.length)} sub={overdue.length > 0 ? `${overdue.length} overdue` : 'next 3 days'} tone={overdue.length > 0 ? 'warn' : 'neutral'} />
            <Metric icon={<AwardIcon className="h-3.5 w-3.5" />} label="Finished" value={String(finishedTracks.length)} sub="courses/classes" tone={finishedTracks.length > 0 ? 'good' : 'neutral'} />
          </div>

          <div className="mt-5">
            <ModeAnalyticsPanel
              title="Create/Learn intelligence"
              subtitle="Live generation, saved-course organization, learning progress, and deadline risk stay visible before you open any individual course."
              columns={modeAnalytics}
              insights={executiveInsights}
            />
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(280px,0.75fr)]">
            <div className="rounded-2xl border border-line bg-canvas p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-faint">Next best action</p>
                  <h3 className="mt-1 text-lg font-semibold text-ink">{next.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-muted">{next.body}</p>
                </div>
                {next.icon}
              </div>
              {activeBuild && (
                <div className="mt-4 rounded-xl border border-accent/20 bg-accent/5 px-3.5 py-3">
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="truncate font-semibold text-ink">{activeBuild.title}</span>
                    <span className={activeBuild.status === 'error' ? 'font-bold text-warn' : 'font-bold text-accent'}>
                      {activeBuild.completedModules}/{activeBuild.totalModules || 0} modules
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
                    <div
                      className="h-full rounded-full bg-accent-fill transition-all"
                      style={{ width: `${buildPct(activeBuild)}%` }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={onOpenBuild}
                    className="ring-focus mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-accent"
                  >
                    Open live build
                    <ArrowRightIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-line bg-canvas p-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-faint">Organization</p>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <MiniStat icon={<FolderIcon className="h-3.5 w-3.5" />} value={String(playlists.length)} label="playlists" />
                <MiniStat icon={<HeartIcon className="h-3.5 w-3.5" />} value={String(favoriteCount)} label="favorites" />
                <MiniStat icon={<BellIcon className="h-3.5 w-3.5" />} value={String(unreadCount)} label="unread" />
              </div>
              <div className="mt-4">
                <div className="flex items-center justify-between text-[11px] text-faint">
                  <span>Courses in playlists</span>
                  <span className="font-semibold text-accent">{organizedPct}%</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line">
                  <div className="h-full rounded-full bg-accent-fill" style={{ width: `${organizedPct}%` }} />
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {categories.length > 0 ? (
                  categories.map((category) => (
                    <span key={category.name} className="rounded-full bg-mint px-2.5 py-1 text-[11px] font-semibold text-accent">
                      {category.name} {category.count}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-muted">Saved courses will group by topic here.</span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <LearnerPulsePanel embedded />

          <div className="rounded-2xl border border-line bg-canvas p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-bold text-ink">Deadline radar</p>
              <span className="text-xs text-muted">{openDeadlines.length} open</span>
            </div>
            {openDeadlines.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {openDeadlines.slice(0, 3).map((deadline) => {
                  const info = dueInfo(deadline.dueAt, now, submissionOf(deadline));
                  return (
                    <li key={deadline.id}>
                      <button
                        type="button"
                        onClick={() => onOpenDeadline(deadline.classId, deadline.id)}
                        className="ring-focus flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-mint/50"
                      >
                        <span
                          className={[
                            'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                            info.tone === 'overdue' ? 'bg-warn-soft text-warn' : 'bg-mint text-accent',
                          ].join(' ')}
                        >
                          <ClockIcon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-ink">{deadline.title}</span>
                          <span className="block truncate text-xs text-muted">{deadline.classTitle}</span>
                        </span>
                        <span className="shrink-0 text-right text-[11px] font-semibold text-muted">
                          {info.label}
                          <span className="block font-normal text-faint">{formatDueDate(deadline.dueAt)}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-3 rounded-xl border border-dashed border-line px-3 py-4 text-center text-sm text-muted">
                No open dated assignments.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function submissionOf(deadline: UpcomingAssignment) {
  return deadline.submittedAt != null ? { submittedAt: deadline.submittedAt, graded: deadline.graded } : null;
}

function topCategories(courses: CourseSummary[]) {
  const counts = new Map<string, number>();
  courses.forEach((course) => counts.set(course.category || 'General', (counts.get(course.category || 'General') ?? 0) + 1));
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 4);
}

function buildPct(build: ActiveBuild): number {
  if (build.status === 'ready') return 100;
  if (build.totalModules <= 0) return build.status === 'error' ? 12 : 8;
  return Math.max(8, Math.round((build.completedModules / build.totalModules) * 100));
}

function nextAction({
  activeBuild,
  overdue,
  dueSoon,
  activeTracks,
  allTracks,
}: {
  activeBuild: ActiveBuild | null;
  overdue: UpcomingAssignment[];
  dueSoon: UpcomingAssignment[];
  activeTracks: Array<{ title: string; completedCount: number; lessonCount: number }>;
  allTracks: Array<{ title: string; completedCount: number; lessonCount: number }>;
}) {
  if (activeBuild?.status === 'error') {
    return {
      label: 'Build needs review',
      title: 'Course generation stopped',
      body: activeBuild.message || 'Open the live build to review what finished and what needs another run.',
      tone: 'warning' as const,
      icon: <AlertTriangleIcon className="h-5 w-5 shrink-0 text-warn" />,
    };
  }
  if (activeBuild) {
    return {
      label: 'Streaming now',
      title: 'Watch the course appear live',
      body: activeBuild.message || 'Modules are streaming in, and ready lessons can be opened immediately.',
      tone: 'info' as const,
      icon: <SparklesIcon className="h-5 w-5 shrink-0 text-accent" />,
    };
  }
  if (overdue.length > 0) {
    return {
      label: 'Attention',
      title: `${overdue.length} overdue assignment${overdue.length === 1 ? '' : 's'}`,
      body: `${overdue[0].title} is the first item to clear.`,
      tone: 'warning' as const,
      icon: <AlertTriangleIcon className="h-5 w-5 shrink-0 text-warn" />,
    };
  }
  if (dueSoon.length > 0) {
    return {
      label: 'Upcoming',
      title: dueSoon[0].title,
      body: `Due for ${dueSoon[0].classTitle}. Finish it before it turns into friction.`,
      tone: 'info' as const,
      icon: <ClockIcon className="h-5 w-5 shrink-0 text-accent" />,
    };
  }
  if (activeTracks.length > 0) {
    const track = activeTracks[0];
    return {
      label: 'In progress',
      title: `Continue ${track.title}`,
      body: `${track.completedCount}/${track.lessonCount} lessons are done. One more lesson keeps momentum visible.`,
      tone: 'info' as const,
      icon: <BookIcon className="h-5 w-5 shrink-0 text-accent" />,
    };
  }
  if (allTracks.length > 0) {
    return {
      label: 'Ready',
      title: `Start ${allTracks[0].title}`,
      body: 'Pick the first lesson and the dashboard will start showing real study patterns.',
      tone: 'info' as const,
      icon: <ArrowRightIcon className="h-5 w-5 shrink-0 text-accent" />,
    };
  }
  return {
    label: 'New learner',
    title: 'Create or unlock your first course',
    body: 'Once courses, classes, or assignments exist, this widget becomes your daily command center.',
    tone: 'success' as const,
    icon: <CheckIcon className="h-5 w-5 shrink-0 text-success" />,
  };
}

function Metric({
  icon,
  label,
  value,
  sub,
  tone = 'neutral',
}: {
  icon: ReactNode;
  label: string;
  value: string;
  sub: string;
  tone?: 'good' | 'warn' | 'neutral';
}) {
  return (
    <div
      className={[
        'rounded-2xl border px-4 py-3',
        tone === 'warn' ? 'border-warn/35 bg-warn-soft' : tone === 'good' ? 'border-success/30 bg-success-soft' : 'border-line bg-canvas',
      ].join(' ')}
    >
      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-faint">
        {icon}
        {label}
      </p>
      <p className={['mt-1 text-2xl font-black tabular-nums', tone === 'warn' ? 'text-warn' : tone === 'good' ? 'text-success' : 'text-ink'].join(' ')}>
        {value}
      </p>
      <p className="text-[11px] text-muted">{sub}</p>
    </div>
  );
}

function MiniStat({ icon, value, label }: { icon: ReactNode; value: string; label: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-2 py-2">
      <p className="mx-auto flex h-6 w-6 items-center justify-center rounded-full bg-mint text-accent">{icon}</p>
      <p className="mt-1 text-lg font-black text-ink">{value}</p>
      <p className="text-[10px] uppercase tracking-[0.12em] text-faint">{label}</p>
    </div>
  );
}
