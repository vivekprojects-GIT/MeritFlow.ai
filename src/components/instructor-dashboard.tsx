'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { libraryCourses } from '@/lib/library';
import type { ClassSummary, RosterEntry } from '@/lib/classes-store';
import { makeBlankCourse, type EnrichedCourse } from '@/lib/course-schema';
import {
  ArrowRightIcon,
  BookIcon,
  AwardIcon,
  ChatIcon,
  CheckIcon,
  ClockIcon,
  DownloadIcon,
  LayersIcon,
  PencilIcon,
  PlusIcon,
  QuizIcon,
  SparklesIcon,
  TableIcon,
  TargetIcon,
  TrashIcon,
  UserIcon,
} from './icons';
import { Button } from './button';
import { AppShell, type NavGroup } from './app-shell';
import { type Brand } from './brandmark';
import { ManageAssignments } from './manage-assignments';
import { CourseEditor } from './course-editor';
import { GradebookModal } from './gradebook-modal';
import { ClassInsights } from './class-insights';
import { ClassAssessmentPanel } from './class-assessment-panel';
import { AssessmentGatesPanel } from './assessment-gates-panel';
import { Inbox } from './inbox';
import { ClassDiscussions } from './class-discussions';
import { ClassMaterials } from './class-materials';
import { CreateWithAI, type GeneratedClass } from './create-with-ai';
import { Modal } from './modal';
import { ModeAnalyticsPanel, type ModeAnalyticsColumn, type ModeAnalyticsInsight } from './mode-analytics-panel';

function delay(ms: number): CSSProperties {
  return { ['--d' as string]: `${ms}ms` } as CSSProperties;
}

function completionRate(completed: number, enrolled: number): number {
  return enrolled > 0 ? Math.round((completed / enrolled) * 100) : 0;
}

function InstructorCommandCenter({
  classes,
  totalStudents,
  totalCompleted,
  now,
  creatingBlank,
  onCreateAi,
  onTemplate,
  onBlank,
}: {
  classes: ClassSummary[];
  totalStudents: number;
  totalCompleted: number;
  now: number;
  creatingBlank: boolean;
  onCreateAi: () => void;
  onTemplate: () => void;
  onBlank: () => void;
}) {
  const openExams = classes.filter((klass) => klass.examOpen).length;
  const activeCodes = classes.filter((klass) => klass.joinCodeExpiresAt != null && klass.joinCodeExpiresAt > now).length;
  const expiringCodes = classes.filter(
    (klass) => klass.joinCodeExpiresAt != null && klass.joinCodeExpiresAt > now && klass.joinCodeExpiresAt - now < 20_000,
  ).length;
  const totalLessons = classes.reduce((total, klass) => total + klass.lessonCount, 0);
  const avgClassSize = classes.length ? Math.round(totalStudents / classes.length) : 0;
  const classesWithStudents = classes.filter((klass) => klass.enrolledCount > 0).length;
  const classActivationPct = classes.length ? Math.round((classesWithStudents / classes.length) * 100) : 0;
  const overallCompletion = completionRate(totalCompleted, totalStudents);
  const avgLessonsPerClass = classes.length ? Math.round((totalLessons / classes.length) * 10) / 10 : 0;
  const examGatePct = classes.length ? Math.round((openExams / classes.length) * 100) : 0;
  const largestClass = [...classes].sort((a, b) => b.enrolledCount - a.enrolledCount)[0];
  const needsAttention = classes
    .filter((klass) => klass.enrolledCount === 0 || (klass.enrolledCount > 0 && klass.completedCount === 0) || !klass.joinCodeExpiresAt)
    .slice(0, 3);
  const riskPct = classes.length ? Math.round((needsAttention.length / classes.length) * 100) : 0;
  const ranked = [...classes]
    .sort((a, b) => completionRate(b.completedCount, b.enrolledCount) - completionRate(a.completedCount, a.enrolledCount))
    .slice(0, 4);

  const metrics = [
    { label: 'Classes', value: classes.length.toLocaleString(), detail: `${totalLessons.toLocaleString()} lessons live`, icon: LayersIcon },
    { label: 'Students', value: totalStudents.toLocaleString(), detail: `Avg ${avgClassSize} per class`, icon: UserIcon },
    { label: 'Completions', value: `${overallCompletion}%`, detail: `${totalCompleted}/${Math.max(totalStudents, 1)} learners finished`, icon: CheckIcon },
    { label: 'Exam gates', value: openExams.toLocaleString(), detail: `${classes.length - openExams} locked`, icon: AwardIcon },
  ];
  const modeAnalytics: ModeAnalyticsColumn[] = [
    {
      eyebrow: 'Create mode',
      title: 'Course factory health',
      value: classes.length.toLocaleString(),
      detail: `${avgLessonsPerClass} lessons per class on average`,
      icon: <SparklesIcon className="h-4 w-4" />,
      rows: [
        { label: 'Published class count', value: classes.length.toLocaleString(), pct: Math.min(100, classes.length * 16) },
        { label: 'Content depth', value: `${avgLessonsPerClass}`, pct: Math.min(100, avgLessonsPerClass * 6) },
        { label: 'Exam gates open', value: `${examGatePct}%`, pct: examGatePct },
      ],
      signals: ['AI class builder', 'Template publishing', 'Blank editor', 'Assignment tools'],
    },
    {
      eyebrow: 'Learn mode',
      title: 'Classroom adoption',
      value: `${classActivationPct}%`,
      detail: `${classesWithStudents}/${classes.length || 0} classes have learners`,
      icon: <TargetIcon className="h-4 w-4" />,
      rows: [
        { label: 'Roster activation', value: `${classActivationPct}%`, pct: classActivationPct },
        { label: 'Learner completion', value: `${overallCompletion}%`, pct: overallCompletion, tone: overallCompletion > 0 ? 'good' : 'neutral' },
        { label: 'Attention load', value: `${riskPct}%`, pct: riskPct, tone: riskPct > 0 ? 'warn' : 'good' },
      ],
      signals: ['Gradebook', 'Class insights', 'Roster health', 'Join-code readiness'],
      tone: riskPct > 0 ? 'warn' : undefined,
    },
  ];
  const executiveInsights: ModeAnalyticsInsight[] = [
    {
      label: 'Teaching priority',
      value: classes.length === 0 ? 'Create' : needsAttention.length > 0 ? 'Nudge' : 'Review',
      detail:
        classes.length === 0
          ? 'Publish a first class so learner and gradebook analytics can activate.'
          : needsAttention.length > 0
            ? `${needsAttention.length} class${needsAttention.length === 1 ? '' : 'es'} need roster, progress, or code follow-up.`
            : 'Classroom operations are stable; review gradebook trends next.',
      tone: needsAttention.length > 0 || classes.length === 0 ? 'warn' : 'good',
    },
    {
      label: 'Production depth',
      value: `${avgLessonsPerClass}`,
      detail: `${totalLessons.toLocaleString()} lessons across ${classes.length.toLocaleString()} class${classes.length === 1 ? '' : 'es'}.`,
    },
    {
      label: 'Learner conversion',
      value: `${overallCompletion}%`,
      detail: totalStudents > 0 ? `${totalCompleted}/${totalStudents} learners completed.` : 'Enroll learners to unlock completion analytics.',
      tone: overallCompletion > 0 ? 'good' : 'neutral',
    },
  ];

  return (
    <section className="rounded-[28px] border border-line bg-surface p-5 shadow-3d">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <div>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <span className="eyebrow">Dashboard</span>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">Teaching command center</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
                Class health, join-code readiness, exam gates, and learner momentum in one operating view.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button variant="primary" size="sm" onClick={onCreateAi}>
                <SparklesIcon className="h-3.5 w-3.5" />
                AI class
              </Button>
              <Button variant="secondary" size="sm" onClick={onTemplate}>
                <PlusIcon className="h-3.5 w-3.5" />
                Template
              </Button>
              <Button variant="secondary" size="sm" onClick={onBlank} disabled={creatingBlank}>
                <PencilIcon className="h-3.5 w-3.5" />
                {creatingBlank ? 'Creating' : 'Blank'}
              </Button>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {metrics.map((metric) => {
              const Icon = metric.icon;
              return (
                <div key={metric.label} className="rounded-2xl border border-line bg-canvas p-4">
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-mint text-accent">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="text-2xl font-black tracking-tight text-ink">{metric.value}</span>
                  </div>
                  <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.14em] text-faint">{metric.label}</p>
                  <p className="mt-1 text-sm text-muted">{metric.detail}</p>
                </div>
              );
            })}
          </div>

          <div className="mt-4">
            <ModeAnalyticsPanel
              title="Create/Learn operating lanes"
              subtitle="A single instructor view separates course production quality from learner adoption, then shows which lane needs action first."
              columns={modeAnalytics}
              insights={executiveInsights}
            />
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-line bg-canvas p-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-faint">Invite readiness</p>
              <p className="mt-2 text-2xl font-black text-ink">{activeCodes}</p>
              <p className="text-sm text-muted">{expiringCodes > 0 ? `${expiringCodes} expiring soon` : 'No urgent code expiry'}</p>
            </div>
            <div className="rounded-2xl border border-line bg-canvas p-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-faint">Largest room</p>
              <p className="mt-2 truncate text-lg font-black text-ink">{largestClass?.title ?? 'No classes yet'}</p>
              <p className="text-sm text-muted">{largestClass ? `${largestClass.enrolledCount} enrolled` : 'Create a class to start'}</p>
            </div>
            <div className="rounded-2xl border border-line bg-canvas p-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-faint">Next action</p>
              <p className="mt-2 text-lg font-black text-ink">
                {classes.length === 0 ? 'Publish first class' : needsAttention.length > 0 ? 'Refresh weak spots' : 'Review gradebook'}
              </p>
              <p className="text-sm text-muted">
                {classes.length === 0
                  ? 'Use AI, template, or blank course.'
                  : needsAttention.length > 0
                    ? `${needsAttention.length} class${needsAttention.length === 1 ? '' : 'es'} need attention.`
                    : 'Momentum is healthy.'}
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-4">
          <div className="rounded-2xl border border-line bg-canvas p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-faint">Class momentum</p>
                <p className="mt-1 text-sm text-muted">Completion rate by class</p>
              </div>
              <span className="rounded-full bg-mint px-2.5 py-1 text-xs font-bold text-accent">{overallCompletion}% overall</span>
            </div>
            <div className="mt-4 space-y-3">
              {(ranked.length ? ranked : [{ id: 'empty', title: 'No classes yet', enrolledCount: 0, completedCount: 0 } as ClassSummary]).map((klass) => {
                const pct = completionRate(klass.completedCount, klass.enrolledCount);
                return (
                  <div key={klass.id}>
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="truncate font-semibold text-ink">{klass.title}</span>
                      <span className="shrink-0 text-faint">{pct}%</span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-line">
                      <div className="h-full rounded-full bg-accent-fill" style={{ width: `${Math.max(klass.enrolledCount ? pct : 4, 4)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-line bg-canvas p-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-faint">Attention queue</p>
            <div className="mt-3 space-y-2">
              {needsAttention.length > 0 ? (
                needsAttention.map((klass) => (
                  <div key={klass.id} className="flex items-start gap-2 rounded-xl bg-surface px-3 py-2">
                    <TargetIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">{klass.title}</p>
                      <p className="text-xs text-muted">
                        {klass.enrolledCount === 0
                          ? 'No students enrolled yet.'
                          : klass.completedCount === 0
                            ? 'Learners have not completed yet.'
                            : 'No active join code.'}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="rounded-xl bg-surface px-3 py-2 text-sm text-muted">No immediate teaching risks detected.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function InstructorDashboard({
  userEmail,
  initialClasses,
  brand = null,
}: {
  userEmail: string;
  initialClasses: ClassSummary[];
  brand?: Brand;
}) {
  const router = useRouter();
  const [classes, setClasses] = useState<ClassSummary[]>(initialClasses);
  const [picking, setPicking] = useState(false);
  const [publishing, setPublishing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rosterFor, setRosterFor] = useState<ClassSummary | null>(null);
  const [manageFor, setManageFor] = useState<ClassSummary | null>(null);
  const [gradebookFor, setGradebookFor] = useState<ClassSummary | null>(null);
  const [insightsFor, setInsightsFor] = useState<ClassSummary | null>(null);
  const [section, setSection] = useState('sec-overview');
  /* Roster for the assessment-gate picker, loaded when a class is opened. */
  const [gateRoster, setGateRoster] = useState<{ studentId: string; email: string }[]>([]);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [discussionsFor, setDiscussionsFor] = useState<ClassSummary | null>(null);
  const [materialsFor, setMaterialsFor] = useState<ClassSummary | null>(null);
  const [messageTarget, setMessageTarget] = useState<{ userId: string; email: string } | null>(null);
  const [editing, setEditing] = useState<{ klass: ClassSummary; course: EnrichedCourse } | null>(null);
  const [loadingEditId, setLoadingEditId] = useState<string | null>(null);
  const [creatingBlank, setCreatingBlank] = useState(false);
  const [creatingAi, setCreatingAi] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [regenId, setRegenId] = useState<string | null>(null);
  // A 1-second tick so join-code countdowns update live.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  async function regenCode(c: ClassSummary) {
    if (regenId) return;
    setRegenId(c.id);
    setError(null);
    try {
      const res = await fetch(`/api/classes/${c.id}/code`, { method: 'POST' });
      if (res.status === 401) return router.replace('/login');
      const data = (await res.json()) as { joinCode?: string; expiresAt?: number; error?: string };
      if (!res.ok || !data.joinCode) throw new Error(data.error ?? 'Could not generate a code.');
      setClasses((prev) =>
        prev.map((x) =>
          x.id === c.id ? { ...x, joinCode: data.joinCode!, joinCodeExpiresAt: data.expiresAt ?? null } : x,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate a code.');
    } finally {
      setRegenId(null);
    }
  }

  async function onAiCreated(c: GeneratedClass) {
    setCreatingAi(false);
    setPicking(false);
    try {
      const list = (await fetch('/api/classes').then((r) => r.json())) as { classes?: ClassSummary[] };
      const next = list.classes ?? classes;
      setClasses(next);
      const klass = next.find((x) => x.id === c.id);
      if (klass) void openEditor(klass); // land in the editor to review / lock before students see it
    } catch {
      /* the class is created; a refresh will show it */
    }
  }

  const totalStudents = classes.reduce((n, c) => n + c.enrolledCount, 0);
  const totalCompleted = classes.reduce((n, c) => n + c.completedCount, 0);

  async function publish(libraryId: string) {
    if (publishing) return;
    setPublishing(libraryId);
    setError(null);
    try {
      const res = await fetch('/api/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ libraryId }),
      });
      if (res.status === 401) return router.replace('/login');
      const data = (await res.json()) as { id?: string; joinCode?: string; expiresAt?: number; error?: string };
      if (!res.ok || !data.id) throw new Error(data.error ?? 'Could not publish the class.');
      const src = libraryCourses.find((l) => l.id === libraryId)!;
      setClasses((prev) => [
        {
          id: data.id!,
          joinCode: data.joinCode ?? '',
          joinCodeExpiresAt: data.expiresAt ?? null,
          title: src.course.title,
          subtitle: src.course.subtitle,
          level: src.course.level,
          lessonCount: src.course.modules.reduce((n, m) => n + m.lessons.length, 0),
          examOpen: false,
          createdAt: Date.now(),
          enrolledCount: 0,
          completedCount: 0,
        },
        ...prev,
      ]);
      setPicking(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not publish the class.');
    } finally {
      setPublishing(null);
    }
  }

  async function createBlank() {
    if (creatingBlank) return;
    setCreatingBlank(true);
    setError(null);
    try {
      const res = await fetch('/api/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blank: true }),
      });
      if (res.status === 401) return router.replace('/login');
      const data = (await res.json()) as { id?: string; joinCode?: string; expiresAt?: number; error?: string };
      if (!res.ok || !data.id) throw new Error(data.error ?? 'Could not create the course.');
      const course = makeBlankCourse();
      const klass: ClassSummary = {
        id: data.id,
        joinCode: data.joinCode ?? '',
        joinCodeExpiresAt: data.expiresAt ?? null,
        title: course.title,
        subtitle: course.subtitle,
        level: course.level,
        lessonCount: course.modules.reduce((n, m) => n + m.lessons.length, 0),
        examOpen: false,
        createdAt: Date.now(),
        enrolledCount: 0,
        completedCount: 0,
      };
      setClasses((prev) => [klass, ...prev]);
      setPicking(false);
      setEditing({ klass, course });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the course.');
    } finally {
      setCreatingBlank(false);
    }
  }

  async function openEditor(c: ClassSummary) {
    if (loadingEditId) return;
    setLoadingEditId(c.id);
    setError(null);
    try {
      const res = await fetch(`/api/classes/${c.id}/course`);
      if (res.status === 401) return router.replace('/login');
      const data = (await res.json()) as { course?: EnrichedCourse; error?: string };
      if (!res.ok || !data.course) throw new Error(data.error ?? 'Could not open the editor.');
      setEditing({ klass: c, course: data.course });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open the editor.');
    } finally {
      setLoadingEditId(null);
    }
  }

  function onCourseSaved(klass: ClassSummary, course: EnrichedCourse) {
    setClasses((prev) =>
      prev.map((x) =>
        x.id === klass.id
          ? {
              ...x,
              title: course.title,
              subtitle: course.subtitle,
              level: course.level,
              lessonCount: course.modules.reduce((n, m) => n + m.lessons.length, 0),
            }
          : x,
      ),
    );
  }

  async function removeClass(c: ClassSummary) {
    if (!window.confirm(`Delete "${c.title}"? Students, progress, and assignments for this class are removed. This cannot be undone.`)) return;
    const prev = classes;
    setClasses((cur) => cur.filter((x) => x.id !== c.id));
    setError(null);
    try {
      const res = await fetch(`/api/classes/${c.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Could not delete the class.');
    } catch (err) {
      setClasses(prev); // roll back on failure
      setError(err instanceof Error ? err.message : 'Could not delete the class.');
    }
  }

  useEffect(() => {
    if (!insightsFor) return;
    let alive = true;
    fetch(`/api/classes/${insightsFor.id}`)
      .then((r) => r.json())
      .then((d: { roster?: { studentId: string; email: string }[] }) => {
        if (alive) setGateRoster(d.roster ?? []);
      })
      .catch(() => {
        if (alive) setGateRoster([]);
      });
    return () => {
      alive = false;
    };
  }, [insightsFor]);

  async function toggleExam(c: ClassSummary) {
    const next = !c.examOpen;
    setClasses((prev) => prev.map((x) => (x.id === c.id ? { ...x, examOpen: next } : x)));
    try {
      await fetch(`/api/classes/${c.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ examOpen: next }),
      });
    } catch {
      setClasses((prev) => prev.map((x) => (x.id === c.id ? { ...x, examOpen: !next } : x)));
    }
  }

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((k) => (k === key ? null : k)), 1600);
    } catch {
      /* ignore */
    }
  }

  const NAV: NavGroup[] = [
    {
      items: [
        { id: 'sec-overview', label: 'Dashboard', icon: <LayersIcon className="h-4 w-4" /> },
        { id: 'sec-classes', label: 'Your classes', icon: <BookIcon className="h-4 w-4" /> },
      ],
    },
    {
      heading: 'Teaching',
      items: [
        { id: 'action-create', label: 'Create a class', icon: <PlusIcon className="h-4 w-4" /> },
        { id: 'action-messages', label: 'Messages', icon: <ChatIcon className="h-4 w-4" /> },
      ],
    },
  ];

  return (
    <AppShell
      brand={brand}
      roleLabel="Teach"
      groups={NAV}
      activeId={section}
      onNavigate={(id) => {
        /* Two kinds of nav item: anchors scroll, actions open something. */
        if (id === 'action-messages') {
          setInboxOpen(true);
          return;
        }
        if (id === 'action-create') {
          setCreatingAi(true);
          return;
        }
        setSection(id);
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }}
      userEmail={userEmail}
      title="Teaching"
    >

      {/* Hero */}
      <section className="hidden">
        <div className="hero-glow pointer-events-none absolute inset-x-0 top-0 -z-10 h-72" />
        <div className="mx-auto max-w-6xl">
          <span className="rise eyebrow" style={delay(0)}>
            Instructor
          </span>
          <h1 className="rise display mt-5 text-[clamp(2.4rem,5.5vw,3.8rem)] text-ink" style={delay(70)}>
            Teach a course you{' '}
            <span className="marker">
              <span>control</span>
            </span>
            .
          </h1>
          <p className="rise mt-5 max-w-xl text-[17px] leading-relaxed text-muted" style={delay(140)}>
            Publish a course, share one join code with your class, hold the final exam until you open it, and watch
            completions roll in, all from here.
          </p>

          <div className="rise mt-7 flex flex-wrap items-center gap-3" style={delay(210)}>
            <button
              onClick={() => setCreatingAi(true)}
              className="press ring-focus inline-flex items-center gap-2 rounded-full bg-accent-fill px-5 py-3 text-sm font-semibold text-canvas elev-2"
            >
              <SparklesIcon className="h-4 w-4" />
              Create with AI
            </button>
            <button
              onClick={() => setPicking(true)}
              className="press ring-focus inline-flex items-center gap-2 rounded-full border border-line px-5 py-3 text-sm font-semibold text-ink transition-colors hover:border-accent/40 hover:text-accent"
            >
              <PlusIcon className="h-4 w-4" />
              From a template
            </button>
            <button
              onClick={createBlank}
              disabled={creatingBlank}
              className="press ring-focus inline-flex items-center gap-2 rounded-full border border-line px-5 py-3 text-sm font-semibold text-ink transition-colors hover:border-accent/40 hover:text-accent disabled:opacity-60"
            >
              <PencilIcon className="h-4 w-4" />
              {creatingBlank ? 'Creating…' : 'Build from scratch'}
            </button>
            <div className="flex items-center gap-5 text-sm text-muted">
              <span>
                <span className="font-semibold text-ink">{classes.length}</span> classes
              </span>
              <span>
                <span className="font-semibold text-ink">{totalStudents}</span> students
              </span>
              <span>
                <span className="font-semibold text-ink">{totalCompleted}</span> completed
              </span>
            </div>
          </div>
          {error && (
            <div role="alert" className="mt-5 max-w-xl rounded-xl border border-accent/30 bg-accent/5 px-4 py-3 text-sm text-accent">
              {error}
            </div>
          )}
        </div>
      </section>

      <main className="mx-auto max-w-6xl px-4 pb-24 pt-8 sm:px-6">
        {error && (
          <div role="alert" className="mb-5 rounded-xl border border-accent/30 bg-accent/5 px-4 py-3 text-sm text-accent">
            {error}
          </div>
        )}
        <InstructorCommandCenter
          classes={classes}
          totalStudents={totalStudents}
          totalCompleted={totalCompleted}
          now={now}
          creatingBlank={creatingBlank}
          onCreateAi={() => setCreatingAi(true)}
          onTemplate={() => setPicking(true)}
          onBlank={createBlank}
        />

        <div className="mt-10 flex items-end justify-between gap-3 border-b border-line pb-4">
          <div>
            <span className="eyebrow">Your classroom</span>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">Classes</h2>
          </div>
        </div>

        {classes.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-line-strong bg-surface/50 p-10 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-mint text-accent">
              <SparklesIcon className="h-6 w-6" />
            </span>
            <p className="mt-4 font-semibold text-ink">No classes yet</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
              Publish a course to get a join code you can share with your students.
            </p>
            <button
              onClick={() => setPicking(true)}
              className="press ring-focus mt-5 inline-flex items-center gap-2 rounded-full bg-accent-fill px-5 py-2.5 text-sm font-semibold text-canvas"
            >
              <PlusIcon className="h-4 w-4" />
              Publish a class
            </button>
          </div>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {classes.map((c, i) => {
              const completionPct = c.enrolledCount ? Math.round((c.completedCount / c.enrolledCount) * 100) : 0;
              return (
                <div key={c.id} style={delay(i * 55)} className="rise card-edit rounded-2xl p-5">
                  <div className="flex items-start justify-between gap-2">
                    <span className="rounded-full bg-mint px-2.5 py-1 text-[11px] font-semibold text-accent">{c.level || 'Course'}</span>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={[
                          'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold',
                          c.examOpen ? 'bg-accent/15 text-accent' : 'border border-line text-faint',
                        ].join(' ')}
                      >
                        <AwardIcon className="h-3 w-3" />
                        {c.examOpen ? 'Exam open' : 'Exam locked'}
                      </span>
                      <button
                        onClick={() => removeClass(c)}
                        aria-label="Delete class"
                        className="ring-focus rounded-lg p-1.5 text-faint transition-colors hover:bg-red-500/[0.06] hover:text-red-500"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <h3 className="mt-4 line-clamp-2 text-lg font-semibold leading-snug text-ink">{c.title}</h3>
                  <p className="mt-1 line-clamp-1 text-sm text-muted">{c.subtitle}</p>

                  {/* Join code, short-lived (1 min), regenerated on demand so a shared code can't be reused */}
                  {(() => {
                    const active = c.joinCodeExpiresAt != null && c.joinCodeExpiresAt > now;
                    const secs = active ? Math.max(0, Math.round((c.joinCodeExpiresAt! - now) / 1000)) : 0;
                    const mmss = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
                    return active ? (
                      <div className="mt-4 rounded-xl border border-line bg-canvas p-3">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-faint">Code</span>
                          <span className="font-mono text-base font-bold tracking-[0.2em] text-ink">{c.joinCode}</span>
                          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-mint px-2 py-0.5 text-[11px] font-bold tabular-nums text-accent">
                            <ClockIcon className="h-3 w-3" />
                            {mmss}
                          </span>
                        </div>
                        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-line">
                          <div
                            className="h-full rounded-full bg-accent-fill transition-[width] duration-1000 ease-linear"
                            style={{ width: `${(secs / 60) * 100}%` }}
                          />
                        </div>
                        <div className="mt-2.5 flex items-center gap-2">
                          <Button variant="secondary" size="sm" onClick={() => copy(c.joinCode, `code-${c.id}`)} className="flex-1">
                            {copied === `code-${c.id}` ? 'Copied' : 'Copy code'}
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => regenCode(c)} disabled={regenId === c.id}>
                            {regenId === c.id ? '…' : 'New code'}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-4 rounded-xl border border-dashed border-line-strong bg-canvas p-3 text-center">
                        <p className="text-xs text-muted">{c.joinCodeExpiresAt ? 'Join code expired.' : 'No active join code.'}</p>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => regenCode(c)}
                          disabled={regenId === c.id}
                          className="mt-2 w-full"
                        >
                          {regenId === c.id ? 'Generating…' : 'Generate 1-min code'}
                        </Button>
                      </div>
                    );
                  })()}
                  <p className="mt-1.5 text-[11px] text-faint">
                    Students enroll with your email <span className="text-muted">{userEmail}</span> + this code while it&apos;s
                    live (1&nbsp;min).
                  </p>

                  {/* Counts */}
                  <div className="mt-4 grid grid-cols-2 gap-2 text-center">
                    <div className="rounded-xl border border-line bg-surface py-2.5">
                      <p className="text-xl font-bold text-ink">{c.enrolledCount}</p>
                      <p className="text-[11px] uppercase tracking-wider text-faint">Enrolled</p>
                    </div>
                    <div className="rounded-xl border border-line bg-surface py-2.5">
                      <p className="text-xl font-bold text-accent">{c.completedCount}</p>
                      <p className="text-[11px] uppercase tracking-wider text-faint">Completed</p>
                    </div>
                  </div>
                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-line">
                    <div className="h-full rounded-full bg-accent-fill transition-all duration-500" style={{ width: `${completionPct}%` }} />
                  </div>

                  {/* Actions */}
                  <div className="mt-4 space-y-2">
                    <Button
                      variant={c.examOpen ? 'secondary' : 'primary'}
                      size="sm"
                      onClick={() => toggleExam(c)}
                      className="w-full"
                    >
                      <AwardIcon className="h-3.5 w-3.5" />
                      {c.examOpen ? 'Close exam' : 'Open exam'}
                    </Button>
                    <div className="grid grid-cols-2 gap-2">
                      <Button variant="secondary" size="sm" onClick={() => openEditor(c)} disabled={loadingEditId === c.id}>
                        <PencilIcon className="h-3.5 w-3.5" />
                        {loadingEditId === c.id ? 'Opening…' : 'Edit'}
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => setInsightsFor(c)}>
                        <TargetIcon className="h-3.5 w-3.5" />
                        Insights
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => setDiscussionsFor(c)}>
                        <ChatIcon className="h-3.5 w-3.5" />
                        Discussion
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => setMaterialsFor(c)}>
                        <DownloadIcon className="h-3.5 w-3.5" />
                        Materials
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => setGradebookFor(c)}>
                        <TableIcon className="h-3.5 w-3.5" />
                        Gradebook
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => setRosterFor(c)}>
                        <UserIcon className="h-3.5 w-3.5" />
                        Students
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => setManageFor(c)}>
                        <QuizIcon className="h-3.5 w-3.5" />
                        Assignments
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {picking && (
        <LibraryPicker
          onPick={publish}
          publishing={publishing}
          onBlank={createBlank}
          creatingBlank={creatingBlank}
          onClose={() => setPicking(false)}
        />
      )}
      {rosterFor && <RosterModal klass={rosterFor} onClose={() => setRosterFor(null)} />}
      {manageFor && (
        <ManageAssignments classId={manageFor.id} className={manageFor.title} onClose={() => setManageFor(null)} />
      )}
      <Inbox
        open={inboxOpen}
        onClose={() => {
          setInboxOpen(false);
          setMessageTarget(null);
        }}
        startWith={messageTarget}
      />

      {discussionsFor && (
        <Modal
          open
          onClose={() => setDiscussionsFor(null)}
          title={`Discussion, ${discussionsFor.title}`}
          subtitle="Questions and answers your whole class can see"
          size="lg"
        >
          <ClassDiscussions classId={discussionsFor.id} canPin />
        </Modal>
      )}

      {materialsFor && (
        <Modal
          open
          onClose={() => setMaterialsFor(null)}
          title={`Materials, ${materialsFor.title}`}
          subtitle="Slides, readings and files your students can download"
          size="lg"
        >
          <ClassMaterials classId={materialsFor.id} canManage />
        </Modal>
      )}

      {insightsFor && (
        <Modal
          open
          onClose={() => setInsightsFor(null)}
          title={`Insights, ${insightsFor.title}`}
          subtitle="Who needs a nudge, and where the class is stuck"
          size="lg"
        >
          <ClassInsights
            classId={insightsFor.id}
            className={insightsFor.title}
            onMessage={(learner) => {
              setMessageTarget(learner);
              setInsightsFor(null);
              setInboxOpen(true);
            }}
          />
          {/* Assessment quality and pacing sit under the engagement view: they
              answer "is the test any good" and "are we behind the schedule",
              which the peer-relative numbers above cannot. */}
          <div className="mt-4">
            <ClassAssessmentPanel classId={insightsFor.id} />
          </div>
          {/* Access controls sit with the assessment analytics: deciding to
              reopen a quiz is usually the reaction to reading how it went. */}
          <div className="mt-4">
            <AssessmentGatesPanel classId={insightsFor.id} roster={gateRoster} />
          </div>
        </Modal>
      )}

      {gradebookFor && (
        <GradebookModal classId={gradebookFor.id} className={gradebookFor.title} onClose={() => setGradebookFor(null)} />
      )}
      {creatingAi && <CreateWithAI onClose={() => setCreatingAi(false)} onCreated={onAiCreated} />}
      {editing && (
        <CourseEditor
          classId={editing.klass.id}
          initialCourse={editing.course}
          onClose={() => setEditing(null)}
          onSaved={(course) => onCourseSaved(editing.klass, course)}
        />
      )}
    </AppShell>
  );
}

function LibraryPicker({
  onPick,
  publishing,
  onBlank,
  creatingBlank,
  onClose,
}: {
  onPick: (libraryId: string) => void;
  publishing: string | null;
  onBlank: () => void;
  creatingBlank: boolean;
  onClose: () => void;
}) {
  const anyBusy = !!publishing || creatingBlank;
  return (
    <Modal open onClose={onClose} size="lg" eyebrow="Publish a class" title="Choose a course to teach">
        {/* Start from scratch */}
        <button
          onClick={onBlank}
          disabled={anyBusy}
          className="card-edit ring-focus flex w-full items-center gap-3 rounded-2xl border-accent/30 p-4 text-left disabled:opacity-60"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-mint text-accent">
            <PencilIcon className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-ink">Build from scratch</span>
            <span className="block text-sm text-muted">Start with an empty course and write your own modules, lessons, and quizzes.</span>
          </span>
          <span className="shrink-0 text-sm font-semibold text-accent">{creatingBlank ? 'Creating…' : 'New'}</span>
        </button>

        <div className="mt-5 flex items-center gap-3">
          <span className="h-px flex-1 bg-line" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-faint">or start from a template</span>
          <span className="h-px flex-1 bg-line" />
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {libraryCourses.map((item) => {
            const lessons = item.course.modules.reduce((n, m) => n + m.lessons.length, 0);
            const busy = publishing === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onPick(item.id)}
                disabled={anyBusy}
                className="card-edit ring-focus rounded-2xl p-4 text-left disabled:opacity-60"
              >
                <h4 className="font-semibold leading-snug text-ink">{item.course.title}</h4>
                <p className="mt-1 line-clamp-1 text-sm text-muted">{item.course.subtitle}</p>
                <p className="mt-3 flex items-center gap-x-3 text-xs text-faint">
                  <span className="inline-flex items-center gap-1">
                    <LayersIcon className="h-3.5 w-3.5" />
                    {item.course.modules.length} modules
                  </span>
                  <span>{lessons} lessons</span>
                </p>
                <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-accent">
                  {busy ? 'Publishing…' : 'Publish'}
                  {!busy && <ArrowRightIcon className="h-3.5 w-3.5" />}
                </span>
              </button>
            );
          })}
        </div>
    </Modal>
  );
}

type RosterImportSummary = {
  matched: number;
  createdUsers: number;
  enrolled: number;
  unenrolled: number;
  skipped: { line: number; reason: string }[];
};

/**
 * SIS rostering and grade passback.
 *
 * The registrar's system of record is the SIS, so the two directions here are
 * "pull the roster in" and "push grades back out". Both are CSV because every
 * SIS exports and ingests CSV, while their write APIs are all vendor-specific.
 */
function SisPanel({ klass, onImported }: { klass: ClassSummary; onImported: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [reconcile, setReconcile] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RosterImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const body = new FormData();
      body.append('file', file);
      if (reconcile) body.append('reconcile', 'true');
      const res = await fetch(`/api/classes/${klass.id}/roster`, { method: 'POST', body });
      const data = (await res.json()) as RosterImportSummary & { error?: string };
      if (!res.ok) {
        setError(data.error ?? 'That import did not go through.');
        return;
      }
      setResult(data);
      onImported();
    } catch {
      setError('That import did not go through.');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div className="mb-5 rounded-2xl border border-line bg-canvas p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink">Student information system</p>
          <p className="mt-0.5 text-xs text-muted">
            Import a roster export (any CSV with an email column), or send grades back to the registrar.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()} disabled={busy}>
            <UserIcon className="h-3.5 w-3.5" />
            {busy ? 'Importing…' : 'Import roster'}
          </Button>
          <a
            href={`/api/classes/${klass.id}/grades`}
            download
            className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-elevated"
          >
            <DownloadIcon className="h-3.5 w-3.5" />
            Export grades
          </a>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
      />

      <label className="mt-3 flex items-center gap-2 text-xs text-muted">
        <input
          type="checkbox"
          checked={reconcile}
          onChange={(e) => setReconcile(e.target.checked)}
          className="h-3.5 w-3.5 accent-[var(--color-accent)]"
        />
        {/* Off by default: one mis-exported file would otherwise empty the class. */}
        Also unenrol students who are missing from the file
      </label>

      {error && (
        <p role="alert" className="mt-3 text-xs font-semibold text-danger">
          {error}
        </p>
      )}

      {result && (
        <div role="status" aria-live="polite" className="mt-3 text-xs text-muted">
          <p className="font-semibold text-ink">
            {result.enrolled} enrolled · {result.matched} already had accounts · {result.createdUsers} new
            {result.unenrolled > 0 ? ` · ${result.unenrolled} unenrolled` : ''}
          </p>
          {result.skipped.length > 0 && (
            <ul className="mt-1.5 space-y-0.5">
              {result.skipped.slice(0, 5).map((s) => (
                <li key={s.line}>
                  Line {s.line}: {s.reason}
                </li>
              ))}
              {result.skipped.length > 5 && <li>…and {result.skipped.length - 5} more skipped rows.</li>}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function RosterModal({ klass, onClose }: { klass: ClassSummary; onClose: () => void }) {
  const [roster, setRoster] = useState<RosterEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  /* Bumped after a SIS import so the table below reflects the new enrolments. */
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    fetch(`/api/classes/${klass.id}`)
      .then((r) => r.json())
      .then((d: { roster?: RosterEntry[] }) => {
        if (alive) setRoster(d.roster ?? []);
      })
      .catch(() => {
        if (alive) setRoster([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [klass.id, reloadKey]);

  return (
    <Modal open onClose={onClose} size="md" eyebrow={`Roster · code ${klass.joinCode}`} title={klass.title}>
        <SisPanel klass={klass} onImported={() => setReloadKey((k) => k + 1)} />
        {loading ? (
          <p role="status" aria-live="polite" className="text-sm text-muted">Loading students…</p>
        ) : roster && roster.length > 0 ? (
          <div className="overflow-hidden rounded-2xl border border-line">
            <table className="w-full text-left text-sm">
              <thead className="bg-elevated text-[11px] uppercase tracking-wider text-faint">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Student</th>
                  <th className="px-4 py-2.5 font-semibold">Lessons</th>
                  <th className="px-4 py-2.5 font-semibold">Exam</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {roster.map((s) => {
                  const pct = klass.lessonCount ? Math.round((s.completedLessons / klass.lessonCount) * 100) : 0;
                  return (
                    <tr key={s.studentId}>
                      <td className="max-w-[180px] truncate px-4 py-2.5 text-ink">{s.email}</td>
                      <td className="px-4 py-2.5 text-muted">
                        {s.completedLessons}/{klass.lessonCount} · {pct}%
                      </td>
                      <td className="px-4 py-2.5 text-muted">
                        {s.examScore == null ? '--' : `${s.examScore}/${s.examTotal}`}
                      </td>
                      <td className="px-4 py-2.5">
                        {s.completedAt ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-bold text-accent">
                            <CheckIcon className="h-3 w-3" /> Completed
                          </span>
                        ) : (
                          <span className="text-[11px] text-faint">In progress</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-line-strong bg-canvas p-8 text-center">
            <p className="font-semibold text-ink">No students yet</p>
            <p className="mx-auto mt-1 max-w-xs text-sm text-muted">
              Share your email and code <span className="font-mono font-bold text-accent">{klass.joinCode}</span> so
              students can enroll.
            </p>
          </div>
        )}
    </Modal>
  );
}
