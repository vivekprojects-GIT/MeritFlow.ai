'use client';

import { useEffect, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { EnrichedCourse, EnrichedLesson, Module } from '@/lib/course-schema';
import type { AppNotification, CoursePlaylist, CourseSummary, NotificationTone } from '@/lib/courses-store';
import { libraryCourses, type LibraryItem } from '@/lib/library';
import { CourseReader } from './course-reader';
import { CourseFrontMatter } from './course-front-matter';
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  AwardIcon,
  BellIcon,
  BookIcon,
  ChatIcon,
  CheckIcon,
  ClockIcon,
  DownloadIcon,
  FolderIcon,
  HeartIcon,
  LayersIcon,
  PlayIcon,
  PlusIcon,
  QuizIcon,
  SparklesIcon,
  TerminalIcon,
  TrashIcon,
} from './icons';
import { type Brand } from './brandmark';
import { CourseCover } from './course-card';
import { LearnerDashboardWidget } from './learner-dashboard-widget';
import { CareerPath } from './career-path';
import { CareerGoals } from './career-goals';
import { LearningRecord } from './learning-record';
import { Inbox } from './inbox';
import { ClassDiscussions } from './class-discussions';
import { ClassMaterials } from './class-materials';
import { Modal } from './modal';
import { AppShell, type NavGroup } from './app-shell';
import { JobPilot } from './job-pilot';
import { ProfileView } from './account-menu';
import type { StudentClass } from '@/lib/classes-store';
import type { UpcomingAssignment } from '@/lib/assignments-store';
import { dueInfo, formatDueDate, DUE_TONE_CLASS } from '@/lib/due';

const EXAMPLES = [
  { label: 'Python for beginners', prompt: 'Teach me Python for data analysis from scratch' },
  { label: 'Personal finance', prompt: 'A beginner course on personal finance and investing' },
  { label: 'UI/UX design', prompt: 'Master the fundamentals of UI/UX design' },
  { label: 'How LLMs work', prompt: 'How large language models actually work' },
];

/** Editorial per-subject identity for catalog cards — a cohesive, art-directed set of hues. */
const HUES = ['#125c4d', '#9c6b1f', '#8a2b2b', '#2a6f62', '#5b3a6b', '#3a4a52'];
const CARD_META: Record<string, { category: string; hue: string }> = {
  'python programming for beginners': { category: 'Programming', hue: '#125c4d' },
  'ui/ux design fundamentals': { category: 'Design', hue: '#8a2b2b' },
  'personal finance & investing': { category: 'Finance', hue: '#9c6b1f' },
  'public speaking & storytelling': { category: 'Communication', hue: '#2a6f62' },
  'foundations of machine learning': { category: 'AI & Data', hue: '#5b3a6b' },
  'the science of productivity': { category: 'Productivity', hue: '#3a4a52' },
  'digital photography': { category: 'Photography', hue: '#2a6f62' },
  'negotiation skills': { category: 'Business', hue: '#8a2b2b' },
  'web development: html & css': { category: 'Programming', hue: '#125c4d' },
};
function cardMeta(title: string, i: number): { category: string; hue: string } {
  return CARD_META[title.trim().toLowerCase()] ?? { category: 'Course', hue: HUES[i % HUES.length] };
}
function guessCourseCategory(title: string, subtitle = ''): string {
  const text = `${title} ${subtitle}`.toLowerCase();
  if (/\b(ai|agent|machine learning|ml|llm|data science)\b/.test(text)) return 'AI & ML';
  if (/\b(python|javascript|typescript|react|web|code|programming|sql)\b/.test(text)) return 'Programming';
  if (/\b(ui|ux|design|product|figma)\b/.test(text)) return 'Design';
  if (/\b(finance|invest|money|wealth|budget)\b/.test(text)) return 'Finance';
  if (/\b(speak|story|communication|writing)\b/.test(text)) return 'Communication';
  return 'General';
}
function monogram(s: string): string {
  return (s.trim().charAt(0) || 'L').toUpperCase();
}

/**
 * A stable hue for a course the catalogue has no art direction for.
 *
 * Keyed on the title rather than on position, so a course keeps its colour
 * when the shelf is filtered or re-sorted. A card that changes colour when you
 * click a filter reads as a different course.
 */
function hueIndex(title: string): number {
  let n = 0;
  for (const ch of title.trim().toLowerCase()) n = (n * 31 + ch.charCodeAt(0)) >>> 0;
  return n;
}

function readSessionPrompt(): string {
  if (typeof window === 'undefined') return '';
  try {
    const saved = sessionStorage.getItem('courseai_prompt') ?? '';
    if (saved) sessionStorage.removeItem('courseai_prompt');
    return saved;
  } catch {
    return '';
  }
}

function readInviteParams(): { email: string; code: string } {
  if (typeof window === 'undefined') return { email: '', code: '' };
  try {
    const params = new URLSearchParams(window.location.search);
    return {
      email: params.get('prof') ?? '',
      code: (params.get('join') ?? '').toUpperCase(),
    };
  } catch {
    return { email: '', code: '' };
  }
}

const LEARNER_VIEW_IDS = ['dashboard', 'create', 'classes', 'courses', 'library', 'goals', 'record', 'jobs', 'profile'] as const;
type LearnerView = (typeof LEARNER_VIEW_IDS)[number];
const LEARNER_NAV_ITEMS: Array<{ id: LearnerView; label: string }> = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'create', label: 'Create' },
  { id: 'classes', label: 'Classes' },
  { id: 'courses', label: 'Your courses' },
  { id: 'library', label: 'Course library' },
  /* Learners only. This whole component renders for students and personal
     accounts; professors and admins have their own dashboards and never reach
     it, and /api/jobs refuses their role regardless. */
  /* Where the learning is going, and what it has produced. Above Jobs
     because a learner decides what to become before they apply for it. */
  { id: 'goals', label: 'Goals' },
  { id: 'record', label: 'Learning record' },
  { id: 'jobs', label: 'Jobs' },
];

function readLearnerView(): LearnerView {
  if (typeof window === 'undefined') return 'dashboard';
  /* The first segment only. The hash is a path now -- `#jobs/settings/answer-book`
     -- so matching the whole string sent every deep link to the dashboard. */
  const first = window.location.hash.replace(/^#\/?/, '').split('/')[0] ?? '';
  return (LEARNER_VIEW_IDS as readonly string[]).includes(first) ? (first as LearnerView) : 'dashboard';
}

type Status = 'idle' | 'loading' | 'error';
type DraftOutline = {
  title: string;
  subtitle: string;
  description: string;
  level: EnrichedCourse['level'];
  estimatedHours: number;
  prerequisites?: string[];
  outcomes?: string[];
  modules: Array<{ title: string; summary: string; lessons?: Array<{ title: string; objective?: string }> }>;
};
type GenerationDeltaScope = 'outline' | 'module' | 'lesson' | 'system';
type GenerationDelta = {
  id: string;
  scope: GenerationDeltaScope;
  index?: number;
  text: string;
  at: number;
};
type GenerationDraft = {
  id: string;
  topic: string;
  level: EnrichedCourse['level'];
  language: string;
  playlistId: string;
  status: 'building' | 'ready' | 'error';
  stage: string;
  message: string;
  outline: DraftOutline | null;
  modules: Array<Module | null>;
  deltaLog: GenerationDelta[];
  moduleDeltas: Record<number, string>;
  finalCourseId?: string;
  error?: string;
};
type StreamEvent =
  | { type: 'status'; stage?: string; message?: string; totalModules?: number }
  | { type: 'delta'; scope?: GenerationDeltaScope; index?: number; text?: string }
  | { type: 'outline'; outline: DraftOutline }
  | { type: 'module'; index: number; totalModules?: number; module: Module }
  | { type: 'course'; course: EnrichedCourse; id?: string; videosPending?: boolean }
  | { type: 'error'; error?: string }
  | { type: 'done' };
type Active = {
  course: EnrichedCourse;
  courseId?: string;
  classId?: string;
  examLocked?: boolean;
  completed: string[];
  initialAssignmentId?: string;
};

function countLessons(course: EnrichedCourse): number {
  return course.modules.reduce((n, m) => n + m.lessons.length, 0);
}
function countVideos(course: EnrichedCourse): number {
  return course.modules.reduce((n, m) => n + m.lessons.filter((l) => l.video).length, 0);
}

function compactDeltaText(previous: string | undefined, next: string): string {
  const joined = previous ? `${previous}\n${next}` : next;
  return joined.length > 1100 ? joined.slice(-1100).trimStart() : joined;
}

function titleFromTopic(topic: string): string {
  const clean = topic.replace(/\s+/g, ' ').trim();
  if (!clean) return 'New Course';
  return clean
    .split(' ')
    .slice(0, 9)
    .map((word) => (word.length > 3 ? `${word.charAt(0).toUpperCase()}${word.slice(1)}` : word))
    .join(' ');
}

function makeOptimisticOutline(topic: string, level: EnrichedCourse['level']): DraftOutline {
  const title = titleFromTopic(topic);
  return {
    title,
    subtitle: 'Building your personalized course now',
    description: `Finding the strongest path through ${title} and preparing the first modules.`,
    level,
    estimatedHours: 0,
    modules: [
      {
        title: 'Learning map',
        summary: `Finding the best path through ${title}.`,
        lessons: [
          { title: 'What you will learn', objective: 'Frame the destination for this course.' },
          { title: 'What matters first', objective: 'Identify the first concepts to learn.' },
        ],
      },
      {
        title: 'Core ideas',
        summary: 'Drafting the main concepts and examples.',
        lessons: [
          { title: 'Key mental models', objective: 'Name the ideas that make the topic click.' },
          { title: 'Worked examples', objective: 'Turn the ideas into practical understanding.' },
        ],
      },
      {
        title: 'Practice path',
        summary: 'Preparing exercises, quizzes, and interactive activities.',
        lessons: [
          { title: 'Guided practice', objective: 'Apply the topic in small steps.' },
          { title: 'Common mistakes', objective: 'Avoid the traps that slow learners down.' },
        ],
      },
      {
        title: 'Finish strong',
        summary: 'Shaping the final project and review path.',
        lessons: [
          { title: 'Review and connect', objective: 'Tie the modules into one usable skill.' },
          { title: 'Final challenge', objective: 'Use the course knowledge in context.' },
        ],
      },
    ],
  };
}

function placeholderLesson(title: string, objective: string): EnrichedLesson {
  return {
    title,
    objective: objective || `Learn the core idea behind ${title}.`,
    intro: `This lesson is being written by the course agents. The outline is already visible so you can follow the shape of the course while the full lesson content streams in.`,
    sections: [
      {
        heading: 'What is being prepared',
        body: objective || `The course agents are turning ${title} into a focused lesson with examples, practice, and review checks.`,
      },
      {
        heading: 'How it fits',
        body: 'This lesson belongs in the course sequence shown on the left. When the module is ready, this placeholder is replaced with the full lesson.',
      },
    ],
    keyPoints: [
      'The outline is available immediately.',
      'Full lesson content appears as module writers finish.',
      'Practice labs and quizzes arrive with each completed module.',
    ],
    codeExamples: [],
    commonMistakes: [],
    practice: '',
    needsVideo: false,
    videoQuery: '',
    video: null,
  };
}

function previewCourseFromDraft(draft: GenerationDraft): EnrichedCourse {
  const outline = draft.outline ?? makeOptimisticOutline(draft.topic, draft.level);
  return {
    title: outline.title,
    subtitle: outline.subtitle,
    description: outline.description,
    level: outline.level,
    estimatedHours: outline.estimatedHours || Math.max(1, outline.modules.length * 1.5),
    prerequisites: outline.prerequisites ?? [],
    outcomes:
      outline.outcomes && outline.outcomes.length > 0
        ? outline.outcomes
        : [
            'Understand the course learning path before the build finishes.',
            'Follow module and lesson progress as each agent completes its work.',
            'Open the saved course once generation completes.',
          ],
    modules: outline.modules.map((outlineModule, index) => {
      const generated = draft.modules[index];
      if (generated) {
        return {
          ...generated,
          lessons: generated.lessons.map((lesson) => ({ ...lesson, video: null })),
        };
      }
      return {
        title: outlineModule.title,
        summary: outlineModule.summary,
        lessons: (outlineModule.lessons ?? []).map((lesson) =>
          placeholderLesson(lesson.title, lesson.objective ?? ''),
        ),
        quiz: [],
        activities: undefined,
      };
    }),
  };
}

/** Inline CSS custom property for staggered entrance delays. */
function delay(ms: number): CSSProperties {
  return { ['--d' as string]: `${ms}ms` } as CSSProperties;
}

async function readGenerationStream(body: ReadableStream<Uint8Array>, onEvent: (event: StreamEvent) => void) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      onEvent(JSON.parse(trimmed) as StreamEvent);
    }
  }

  const tail = buffer.trim();
  if (tail) onEvent(JSON.parse(tail) as StreamEvent);
}

export function CourseBuilder({
  userEmail,
  initialCourses,
  billing,
  initialClasses = [],
  initialPlaylists = [],
  initialNotifications = [],
  brand = null,
  accountKind = 'institutional',
}: {
  userEmail: string;
  initialCourses: CourseSummary[];
  billing: { isPro: boolean; purchases: string[] };
  initialClasses?: StudentClass[];
  initialPlaylists?: CoursePlaylist[];
  initialNotifications?: AppNotification[];
  brand?: Brand;
  /* 'personal' hides everything that only exists inside an institution. */
  accountKind?: 'personal' | 'institutional';
}) {
  /* A personal learner has no classmates and no instructor, so Messages and
     Classes can only ever be empty for them. Showing an empty inbox is worse
     than not showing one: it implies something is missing. */
  const isPersonal = accountKind === 'personal';
  const router = useRouter();
  const [prompt, setPrompt] = useState(readSessionPrompt);
  const [level, setLevel] = useState<'Beginner' | 'Intermediate' | 'Advanced'>('Beginner');
  const [known, setKnown] = useState('');
  const [language, setLanguage] = useState('English');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [generationDraft, setGenerationDraft] = useState<GenerationDraft | null>(null);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [classDiscussion, setClassDiscussion] = useState<StudentClass | null>(null);
  const [classMaterials, setClassMaterials] = useState<StudentClass | null>(null);
  const [liveGenerationOpen, setLiveGenerationOpen] = useState(false);
  const [active, setActive] = useState<Active | null>(null);
  const [courses, setCourses] = useState<CourseSummary[]>(initialCourses);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [playlists, setPlaylists] = useState<CoursePlaylist[]>(initialPlaylists);
  const [targetPlaylistId, setTargetPlaylistId] = useState('');
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [creatingPlaylist, setCreatingPlaylist] = useState(false);
  const [shelfFilter, setShelfFilter] = useState('all');
  const [notifications, setNotifications] = useState<AppNotification[]>(initialNotifications);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [learnerView, setLearnerView] = useState<LearnerView>(readLearnerView);

  const [initialInvite] = useState(readInviteParams);
  const [classes, setClasses] = useState<StudentClass[]>(initialClasses);
  const [deadlines, setDeadlines] = useState<UpcomingAssignment[]>([]);
  const [profEmail, setProfEmail] = useState(initialInvite.email);
  const [joinCode, setJoinCode] = useState(initialInvite.code);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const isPro = billing.isPro;
  const [purchases, setPurchases] = useState<Set<string>>(() => new Set(billing.purchases));
  const [preview, setPreview] = useState<LibraryItem | null>(null);
  /* Library shelf filter: a category name, 'All', or 'Owned'. */
  const [shelf, setShelf] = useState('All');
  const [buying, setBuying] = useState(false);
  const unreadNotifications = notifications.filter((n) => n.readAt == null).length;

  function loadDeadlines() {
    fetch('/api/my-deadlines')
      .then((r) => r.json())
      .then((d: { deadlines?: UpcomingAssignment[] }) => setDeadlines(d.deadlines ?? []))
      .catch(() => {
        /* non-critical */
      });
  }
  useEffect(() => {
    loadDeadlines();
  }, []);

  useEffect(() => {
    const syncView = () => setLearnerView(readLearnerView());
    window.addEventListener('hashchange', syncView);
    window.addEventListener('popstate', syncView);
    return () => {
      window.removeEventListener('hashchange', syncView);
      window.removeEventListener('popstate', syncView);
    };
  }, []);

  /**
   * Backfill cover photos for courses created before covers existed. Runs once
   * on mount, a few at a time so a big shelf can't fire a burst of image
   * searches, and silently gives up on anything that fails.
   */
  useEffect(() => {
    const missing = courses.filter((c) => !c.coverUrl).slice(0, 4);
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      for (const course of missing) {
        try {
          const res = await fetch(`/api/courses/${course.id}/cover`, { method: 'POST' });
          if (!res.ok) continue;
          const data = (await res.json()) as { coverUrl?: string | null };
          if (cancelled || !data.coverUrl) continue;
          setCourses((prev) => prev.map((c) => (c.id === course.id ? { ...c, coverUrl: data.coverUrl ?? null } : c)));
        } catch {
          /* a missing cover is cosmetic — never surface it */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one backfill pass on mount, not on every list change
  }, []);

  // Auto-join when arriving via a professor's invite link (?prof=EMAIL&join=CODE).
  useEffect(() => {
    if (!initialInvite.email || !initialInvite.code) return;
    const id = window.setTimeout(() => void joinClass({ email: initialInvite.email, code: initialInvite.code }), 0);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function ownsLibrary(id: string): boolean {
    return isPro || purchases.has(id);
  }

  function showLearnerView(view: LearnerView) {
    setLearnerView(view);
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    /* Truncated to this segment: a sub-selection belongs to the tab it was made
       in, and carrying it across would restore a section of a different screen. */
    url.hash = view;
    if (readLearnerView() === view) {
      window.history.replaceState(null, '', url.toString());
    } else {
      window.history.pushState(null, '', url.toString());
    }
  }

  async function pushNotification(input: {
    tone?: NotificationTone;
    title: string;
    message?: string;
    href?: string;
  }) {
    const optimistic: AppNotification = {
      id: `local-${Date.now()}`,
      tone: input.tone ?? 'info',
      title: input.title,
      message: input.message ?? '',
      href: input.href ?? '',
      readAt: null,
      createdAt: Date.now(),
    };
    setNotifications((prev) => [optimistic, ...prev].slice(0, 20));
    try {
      const res = await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const data = (await res.json().catch(() => ({}))) as { notification?: AppNotification };
      if (res.ok && data.notification) {
        setNotifications((prev) => [data.notification!, ...prev.filter((n) => n.id !== optimistic.id)].slice(0, 20));
      }
    } catch {
      /* keep optimistic notification */
    }
  }

  async function markAllNotificationsRead() {
    const now = Date.now();
    setNotifications((prev) => prev.map((n) => (n.readAt == null ? { ...n, readAt: now } : n)));
    try {
      await fetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    } catch {
      /* best-effort */
    }
  }

  async function createCoursePlaylist(name = newPlaylistName) {
    const clean = name.trim();
    if (!clean || creatingPlaylist) return null;
    setCreatingPlaylist(true);
    try {
      const res = await fetch('/api/playlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: clean }),
      });
      if (res.status === 401) {
        router.replace('/login');
        return null;
      }
      const data = (await res.json()) as { playlist?: CoursePlaylist; error?: string };
      if (!res.ok || !data.playlist) throw new Error(data.error ?? 'Could not create playlist.');
      setPlaylists((prev) => [data.playlist!, ...prev]);
      setNewPlaylistName('');
      setTargetPlaylistId(data.playlist.id);
      void pushNotification({
        tone: 'success',
        title: 'Playlist created',
        message: `${data.playlist.name} is ready for courses.`,
      });
      return data.playlist;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create playlist.');
      return null;
    } finally {
      setCreatingPlaylist(false);
    }
  }

  async function addCourseToPlaylist(courseId: string, playlistId: string) {
    if (!playlistId) return;
    const playlist = playlists.find((p) => p.id === playlistId);
    const hadCourse = courses.some((c) => c.id === courseId && c.playlistIds.includes(playlistId));
    if (hadCourse) return;
    setCourses((prev) =>
      prev.map((c) =>
        c.id === courseId && !c.playlistIds.includes(playlistId)
          ? { ...c, playlistIds: [...c.playlistIds, playlistId] }
          : c,
      ),
    );
    setPlaylists((prev) => prev.map((p) => (p.id === playlistId ? { ...p, courseCount: p.courseCount + 1 } : p)));
    try {
      const res = await fetch(`/api/playlists/${playlistId}/courses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId }),
      });
      if (!res.ok) throw new Error('Could not add to playlist.');
      if (playlist) {
        void pushNotification({
          tone: 'success',
          title: 'Course added to playlist',
          message: `Saved inside ${playlist.name}.`,
        });
      }
    } catch (err) {
      setCourses((prev) =>
        prev.map((c) =>
          c.id === courseId ? { ...c, playlistIds: c.playlistIds.filter((id) => id !== playlistId) } : c,
        ),
      );
      setPlaylists((prev) =>
        prev.map((p) => (p.id === playlistId ? { ...p, courseCount: Math.max(0, p.courseCount - 1) } : p)),
      );
      setError(err instanceof Error ? err.message : 'Could not add to playlist.');
    }
  }

  async function toggleFavorite(courseId: string, favorite: boolean) {
    setCourses((prev) => prev.map((c) => (c.id === courseId ? { ...c, favorite } : c)));
    try {
      const res = await fetch(`/api/courses/${courseId}/favorite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ favorite }),
      });
      if (!res.ok) throw new Error('Could not update favorite.');
    } catch (err) {
      setCourses((prev) => prev.map((c) => (c.id === courseId ? { ...c, favorite: !favorite } : c)));
      setError(err instanceof Error ? err.message : 'Could not update favorite.');
    }
  }

  async function generate() {
    const topic = prompt.trim();
    if (!topic || status === 'loading') return;
    if (!isPro) {
      router.push('/pricing');
      return;
    }
    const draftId = `build-${Date.now()}`;
    const draftPlaylistId = targetPlaylistId;
    const draftLanguage = language.trim() || 'English';
    const optimisticOutline = makeOptimisticOutline(topic, level);
    setStatus('loading');
    setError(null);
    setGenerationDraft({
      id: draftId,
      topic,
      level,
      language: draftLanguage,
      playlistId: draftPlaylistId,
      status: 'building',
      stage: 'starting',
      message: 'Starting the course agents',
      outline: optimisticOutline,
      modules: Array.from({ length: optimisticOutline.modules.length }, () => null),
      deltaLog: [
        {
          id: `${draftId}-start`,
          scope: 'system',
          text: 'Starting the course agents',
          at: Date.now(),
        },
      ],
      moduleDeltas: {},
    });
    setLiveGenerationOpen(true);
    try {
      const res = await fetch('/api/generate/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: topic, level, known: known.trim(), language: draftLanguage }),
      });
      if (res.status === 401) {
        setStatus('idle');
        setGenerationDraft((draft) =>
          draft
            ? { ...draft, status: 'error', stage: 'auth', message: 'Please sign in again.', error: 'Please sign in again.' }
            : draft,
        );
        router.replace('/login');
        return;
      }
      if (res.status === 402) {
        setStatus('idle');
        setGenerationDraft((draft) =>
          draft
            ? { ...draft, status: 'error', stage: 'upgrade', message: 'Course generation requires Pro.', error: 'Course generation requires Pro.' }
            : draft,
        );
        router.push('/pricing');
        return;
      }

      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? 'Something went wrong while generating your course.');
      }

      const finalRef: { course: EnrichedCourse | null; id?: string } = { course: null };
      await readGenerationStream(res.body, (event) => {
        if (event.type === 'delta') {
          const text = (event.text ?? '').trim();
          if (!text) return;
          setGenerationDraft((draft) => {
            if (!draft) return draft;
            const scope = event.scope ?? 'system';
            const moduleDeltas = { ...(draft.moduleDeltas ?? {}) };
            if (typeof event.index === 'number') {
              moduleDeltas[event.index] = compactDeltaText(moduleDeltas[event.index], text);
            }
            return {
              ...draft,
              status: 'building',
              stage: scope === 'lesson' ? 'writing_lessons' : scope === 'module' ? 'writing_modules' : draft.stage,
              message: text.split('\n')[0]?.slice(0, 140) || draft.message,
              deltaLog: [
                ...(draft.deltaLog ?? []),
                {
                  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                  scope,
                  index: event.index,
                  text,
                  at: Date.now(),
                },
              ].slice(-28),
              moduleDeltas,
            };
          });
          return;
        }

        if (event.type === 'status') {
          setGenerationDraft((draft) =>
            draft
              ? {
                  ...draft,
                  status: 'building',
                  stage: event.stage ?? draft.stage,
                  message: event.message ?? draft.message,
                }
              : draft,
          );
          return;
        }

        if (event.type === 'outline') {
          setGenerationDraft((draft) =>
            draft
              ? {
                  ...draft,
                  status: 'building',
                  stage: 'outline',
                  message: 'Course outline ready',
                  outline: event.outline,
                  modules: Array.from({ length: event.outline.modules.length }, () => null),
                }
              : draft,
          );
          return;
        }

        if (event.type === 'module') {
          setGenerationDraft((draft) => {
            if (!draft) return draft;
            const total = event.totalModules ?? draft.modules.length;
            const modules = draft.modules.length > 0 ? [...draft.modules] : Array.from({ length: total }, () => null);
            modules[event.index] = event.module;
            const completed = modules.filter(Boolean).length;
            return {
              ...draft,
              status: 'building',
              stage: 'writing_modules',
              message: `Module ${completed}/${modules.length} ready`,
              modules,
            };
          });
          return;
        }

        if (event.type === 'course') {
          finalRef.course = event.course;
          finalRef.id = event.id;
          setGenerationDraft((draft) =>
            draft
              ? {
                  ...draft,
                  status: 'building',
                  stage: 'saved',
                  message: event.videosPending ? 'Course saved. Videos are being attached in the background.' : 'Course saved.',
                }
              : draft,
          );
          return;
        }

        if (event.type === 'error') {
          throw new Error(event.error ?? 'Something went wrong while generating your course.');
        }
      });

      if (!finalRef.course) throw new Error('Generation finished without a course.');
      const generated = finalRef.course;
      if (finalRef.id) {
        const id = finalRef.id;
        const playlistIds = draftPlaylistId ? [draftPlaylistId] : [];
        setCourses((prev) => [
          {
            id,
            title: generated.title,
            subtitle: generated.subtitle,
            level: generated.level,
            category: guessCourseCategory(generated.title, generated.subtitle),
            /* The cover is looked up server-side after the response; it appears
               on the next list refresh. */
            coverUrl: null,
            favorite: false,
            playlistIds,
            createdAt: Date.now(),
            lessonCount: countLessons(generated),
            completedCount: 0,
          },
          ...prev,
        ]);
        setGenerationDraft((draft) =>
          draft
            ? {
                ...draft,
                status: 'ready',
                stage: 'ready',
                message: generated.modules.length
                  ? 'Course is ready. Open the finished course when you want to start learning.'
                  : 'Course is ready.',
                finalCourseId: id,
              }
            : draft,
        );
        if (draftPlaylistId) {
          void addCourseToPlaylist(id, draftPlaylistId);
        }
        showLearnerView('courses');
        void pushNotification({
          tone: 'success',
          title: 'Course creation completed',
          message: `${generated.title} is ready to learn.`,
        });
      }
      setStatus('idle');
      setPrompt('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong.';
      setError(message);
      setStatus('error');
      setGenerationDraft((draft) =>
        draft ? { ...draft, status: 'error', stage: 'failed', message, error: message } : draft,
      );
      void pushNotification({
        tone: 'error',
        title: 'Course creation failed',
        message,
      });
    }
  }

  async function openCourse(id: string) {
    if (openingId) return;
    setOpeningId(id);
    setError(null);
    try {
      const res = await fetch(`/api/courses/${id}`);
      if (res.status === 401) {
        router.replace('/login');
        return;
      }
      const data = (await res.json()) as { course?: EnrichedCourse; completed?: string[]; error?: string };
      if (!res.ok || !data.course) throw new Error(data.error ?? 'Could not open course.');
      setActive({ course: data.course, courseId: id, completed: data.completed ?? [] });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open course.');
    } finally {
      setOpeningId(null);
    }
  }

  async function openFinishedDraftCourse(id: string) {
    setLiveGenerationOpen(false);
    await openCourse(id);
  }

  function openLibrary(item: LibraryItem) {
    if (ownsLibrary(item.id)) {
      setActive({ course: item.course, completed: [] });
    } else {
      setPreview(item);
    }
  }

  async function buy(item: LibraryItem) {
    setBuying(true);
    try {
      const res = await fetch(`/api/library/${item.id}/purchase`, { method: 'POST' });
      if (res.status === 401) {
        router.replace('/login');
        return;
      }
      if (!res.ok) throw new Error('Purchase failed.');
      const next = new Set(purchases);
      next.add(item.id);
      setPurchases(next);
      setPreview(null);
      setActive({ course: item.course, completed: [] });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Purchase failed.');
    } finally {
      setBuying(false);
    }
  }

  async function removeCourse(id: string, e: MouseEvent) {
    e.stopPropagation();
    const removed = courses.find((c) => c.id === id);
    setCourses((prev) => prev.filter((c) => c.id !== id));
    if (removed) {
      setPlaylists((prev) =>
        prev.map((p) =>
          removed.playlistIds.includes(p.id) ? { ...p, courseCount: Math.max(0, p.courseCount - 1) } : p,
        ),
      );
    }
    try {
      await fetch(`/api/courses/${id}`, { method: 'DELETE' });
    } catch {
      /* best-effort */
    }
  }

  async function openClass(klass: StudentClass, assignmentId?: string) {
    if (openingId) return;
    setOpeningId(klass.id);
    setError(null);
    try {
      const res = await fetch(`/api/classes/${klass.id}/learn`);
      if (res.status === 401) {
        router.replace('/login');
        return;
      }
      const data = (await res.json()) as {
        course?: EnrichedCourse;
        examOpen?: boolean;
        completed?: string[];
        error?: string;
      };
      if (!res.ok || !data.course) throw new Error(data.error ?? 'Could not open class.');
      setActive({
        course: data.course,
        classId: klass.id,
        examLocked: !data.examOpen,
        completed: data.completed ?? [],
        initialAssignmentId: assignmentId,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open class.');
    } finally {
      setOpeningId(null);
    }
  }

  async function joinClass(opts?: { email?: string; code?: string }) {
    const email = (opts?.email ?? profEmail).trim();
    const code = (opts?.code ?? joinCode).trim();
    if (!email || !code || joining) return;
    setJoining(true);
    setJoinError(null);
    try {
      const res = await fetch('/api/enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });
      if (res.status === 401) {
        router.replace('/login');
        return;
      }
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !data.id) throw new Error(data.error ?? 'No class matches that professor email and code.');
      setJoinCode('');
      setProfEmail('');
      const list = (await fetch('/api/my-classes')
        .then((r) => r.json())
        .catch(() => ({ classes: [] }))) as { classes?: StudentClass[] };
      setClasses(list.classes ?? []);
      loadDeadlines();
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Could not join the class.');
    } finally {
      setJoining(false);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      generate();
    }
  }

  const courseCategories = Array.from(new Set(courses.map((c) => c.category || 'General'))).sort((a, b) =>
    a.localeCompare(b),
  );
  const visibleCourses = courses.filter((c) => {
    if (shelfFilter === 'favorites') return c.favorite;
    if (shelfFilter.startsWith('category:')) return c.category === shelfFilter.slice('category:'.length);
    if (shelfFilter.startsWith('playlist:')) return c.playlistIds.includes(shelfFilter.slice('playlist:'.length));
    return true;
  });
  const showLiveDraftCard = generationDraft != null && generationDraft.status !== 'ready';
  const activeBuild =
    showLiveDraftCard && generationDraft
      ? {
          title: generationDraft.outline?.title ?? generationDraft.topic,
          status: generationDraft.status === 'error' ? ('error' as const) : ('building' as const),
          stage: generationDraft.stage,
          message: generationDraft.error ?? generationDraft.message,
          completedModules: generationDraft.modules.filter(Boolean).length,
          totalModules: generationDraft.outline?.modules.length ?? generationDraft.modules.length,
        }
      : null;

  function playlistName(id: string): string {
    return playlists.find((p) => p.id === id)?.name ?? 'Playlist';
  }

  if (liveGenerationOpen && generationDraft) {
    return (
      <LiveGenerationWorkspace
        draft={generationDraft}
        playlistName={generationDraft.playlistId ? playlistName(generationDraft.playlistId) : ''}
        onBack={() => setLiveGenerationOpen(false)}
        onOpenCourse={
          generationDraft.finalCourseId ? () => void openFinishedDraftCourse(generationDraft.finalCourseId!) : undefined
        }
      />
    );
  }

  if (active) {
    return (
      <CourseReader
        /* Remount when a different course opens, so the reader's own copy of the
           course (which the assistant can edit) is rebuilt from the new one. */
        key={active.courseId ?? active.classId ?? active.course.title}
        course={active.course}
        courseId={active.courseId}
        classId={active.classId}
        examLocked={active.examLocked}
        initialCompleted={active.completed}
        initialAssignmentId={active.initialAssignmentId}
        onReset={() => {
          setActive(null);
          loadDeadlines();
        }}
        onCourseUpdated={(course) => {
          setActive((prev) => (prev ? { ...prev, course } : prev));
          if (active.courseId) {
            const id = active.courseId;
            setCourses((prev) =>
              prev.map((c) =>
                c.id === id
                  ? {
                      ...c,
                      title: course.title,
                      subtitle: course.subtitle,
                      level: course.level,
                      category: guessCourseCategory(course.title, course.subtitle),
                      lessonCount: course.modules.reduce((n, m) => n + m.lessons.length, 0),
                    }
                  : c,
              ),
            );
          }
        }}
        onProgress={(count) => {
          if (active.courseId) {
            const id = active.courseId;
            setCourses((prev) => prev.map((c) => (c.id === id ? { ...c, completedCount: count } : c)));
          }
          if (active.classId) {
            const id = active.classId;
            setClasses((prev) => prev.map((c) => (c.id === id ? { ...c, completedCount: count } : c)));
          }
        }}
      />
    );
  }

  const NAV: NavGroup[] = [
    {
      items: LEARNER_NAV_ITEMS.filter((i) => i.id !== 'jobs')
        .filter((i) => !(isPersonal && i.id === 'classes'))
        .map((i) => ({ id: i.id, label: i.label })),
    },
    {
      heading: 'Career',
      /* Learners only. Professors and admins render different dashboards and
         never reach this component; /api/jobs refuses their role regardless. */
      items: [{ id: 'jobs', label: 'Jobs' }],
    },
    {
      heading: 'You',
      /* Profile was reachable only through an unlabelled avatar in the header —
         a bare initial circle on mobile with nothing to suggest it opened
         anything. Since a missing name silently blocks every job application,
         the one screen that fixes it needs to be visible rather than guessed. */
      items: [{ id: 'profile', label: 'Profile' }],
    },
  ];

  return (
    <AppShell
      brand={brand}
      roleLabel={isPro ? 'Pro' : undefined}
      groups={NAV}
      activeId={learnerView}
      onNavigate={(id) => showLearnerView(id as LearnerView)}
      userEmail={userEmail}
      title={LEARNER_NAV_ITEMS.find((i) => i.id === learnerView)?.label ?? 'Dashboard'}
      actions={
        <>
          <a
            href="/playground"
            title="Playground"
            className="ring-focus hidden items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium text-muted transition-colors hover:bg-mint hover:text-ink md:inline-flex"
          >
            <TerminalIcon className="h-4 w-4" />
            <span className="hidden lg:inline">Playground</span>
          </a>
          {!isPersonal && (
            <button
              onClick={() => setInboxOpen(true)}
              className="ring-focus inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium text-muted transition-colors hover:bg-mint hover:text-ink"
              title="Messages"
            >
              <ChatIcon className="h-4 w-4" />
              <span className="hidden lg:inline">Messages</span>
            </button>
          )}

          {/* Notifications survived the move to the shell, dropping the bell
              would have silently removed the only place deadlines surface. */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setNotificationsOpen((v) => !v);
                if (!notificationsOpen && unreadNotifications > 0) void markAllNotificationsRead();
              }}
              className="ring-focus relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface text-muted transition-colors hover:border-accent/40 hover:text-accent"
              aria-label="Notifications"
            >
              <BellIcon className="h-4 w-4" />
              {unreadNotifications > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-black text-canvas">
                  {unreadNotifications > 9 ? '9+' : unreadNotifications}
                </span>
              )}
            </button>
            {notificationsOpen && <NotificationsPopover notifications={notifications} />}
          </div>

          {!isPro && (
            <a
              href="/pricing"
              className="press ring-focus hidden items-center gap-1.5 rounded-full bg-accent-fill px-3.5 py-2 text-sm font-semibold text-canvas sm:inline-flex"
            >
              <SparklesIcon className="h-3.5 w-3.5" />
              Go Pro
            </a>
          )}
        </>
      }
    >

      {/* ── Composer (the thesis) ── */}
      {learnerView === 'create' && (
      <section className="relative overflow-hidden px-4 pb-10 pt-16 sm:px-6">
        <div className="hero-glow pointer-events-none absolute inset-x-0 top-0 -z-10 h-80" />
        <div className="mx-auto max-w-3xl">
          <div className="text-center">
            <span className="rise eyebrow justify-center" style={delay(0)}>
              {isPro ? 'Create with AI' : 'AI course builder'}
            </span>
            <h1
              className="rise display mt-6 text-[clamp(2.6rem,6vw,4.5rem)] text-ink"
              style={delay(70)}
            >
              What do you want to{' '}
              <span className="marker">
                <span>learn</span>
              </span>
              ?
            </h1>
            <p className="rise mx-auto mt-5 max-w-md font-serif text-[17px] leading-relaxed text-muted" style={delay(140)}>
              One sentence in, a full course out, structured lessons, worked examples, quizzes, and the single best
              video for every topic.
            </p>
          </div>

          <div className="rise mt-10" style={delay(210)}>
            <div className="elev-3 group rounded-[26px] border border-line bg-surface p-3.5 text-left transition-shadow focus-within:border-accent/40">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={onKeyDown}
                rows={3}
                placeholder="A beginner course on personal finance and investing…"
                className="w-full resize-none bg-transparent px-3 pt-2 text-[17px] leading-relaxed text-ink caret-accent placeholder:text-faint focus:outline-none"
              />
              <div className="flex items-center justify-between gap-3 px-1.5 pb-0.5 pt-1.5">
                <span className="text-xs text-faint">
                  {isPro ? 'Press ⌘ / Ctrl + Enter to build' : 'Generating is a Pro feature'}
                </span>
                <button
                  onClick={generate}
                  disabled={status === 'loading' || !prompt.trim()}
                  aria-label={isPro ? 'Generate course' : 'Go Pro to generate'}
                  className="press ring-focus flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-accent-fill text-canvas elev-2 disabled:cursor-not-allowed disabled:opacity-35"
                >
                  <ArrowRightIcon className="h-5 w-5 -rotate-90" />
                </button>
              </div>
            </div>

            {isPro && (
              <div className="mt-4 rounded-2xl border border-line bg-surface/70 p-4 text-left">
                <p className="eyebrow">Tailor it to you</p>
                <div className="mt-3 flex flex-col gap-3">
                  <div className="flex items-center gap-1.5">
                    {(['Beginner', 'Intermediate', 'Advanced'] as const).map((lv) => (
                      <button
                        key={lv}
                        type="button"
                        onClick={() => setLevel(lv)}
                        aria-pressed={level === lv}
                        className={[
                          'press ring-focus cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors',
                          level === lv
                            ? 'bg-accent text-canvas'
                            : 'border border-line bg-surface text-muted hover:border-accent/40 hover:text-ink',
                        ].join(' ')}
                      >
                        {lv}
                      </button>
                    ))}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,0.45fr)_minmax(0,1fr)]">
                    <input
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                      placeholder="Course language"
                      aria-label="Course language"
                      className="ring-focus rounded-full border border-line bg-surface px-4 py-2 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none"
                    />
                    <input
                      value={known}
                      onChange={(e) => setKnown(e.target.value)}
                      placeholder="Optional: what you already know (we'll skip it)"
                      className="ring-focus rounded-full border border-line bg-surface px-4 py-2 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none"
                    />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,0.55fr)_minmax(0,1fr)_auto]">
                    <label className="sr-only" htmlFor="course-playlist-target">
                      Save course to playlist
                    </label>
                    <select
                      id="course-playlist-target"
                      value={targetPlaylistId}
                      onChange={(e) => setTargetPlaylistId(e.target.value)}
                      className="ring-focus rounded-full border border-line bg-surface px-4 py-2 text-sm text-ink focus:border-accent focus:outline-none"
                    >
                      <option value="">Outside playlists</option>
                      {playlists.map((playlist) => (
                        <option key={playlist.id} value={playlist.id}>
                          {playlist.name}
                        </option>
                      ))}
                    </select>
                    <input
                      value={newPlaylistName}
                      onChange={(e) => setNewPlaylistName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          void createCoursePlaylist();
                        }
                      }}
                      placeholder="New playlist or folder"
                      aria-label="New playlist name"
                      className="ring-focus rounded-full border border-line bg-surface px-4 py-2 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => void createCoursePlaylist()}
                      disabled={!newPlaylistName.trim() || creatingPlaylist}
                      className="press ring-focus inline-flex items-center justify-center gap-1.5 rounded-full border border-accent/25 bg-mint px-4 py-2 text-sm font-semibold text-accent disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <PlusIcon className="h-3.5 w-3.5" />
                      {creatingPlaylist ? 'Creating' : 'Create'}
                    </button>
                  </div>
                  <p className="text-xs text-faint">
                    {targetPlaylistId
                      ? `New courses will save into ${playlistName(targetPlaylistId)}.`
                      : 'New courses stay on your main shelf until you add them to a playlist.'}
                  </p>
                </div>
              </div>
            )}

            {!isPro && (
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-sm">
                <span className="text-muted">Generate unlimited courses with Pro.</span>
                <a href="/pricing" className="u-link inline-flex cursor-pointer items-center gap-1 font-semibold text-accent">
                  See plans
                  <ArrowRightIcon className="h-3.5 w-3.5" />
                </a>
              </div>
            )}

            <div className="mt-6 flex flex-wrap justify-center gap-2.5">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex.label}
                  onClick={() => setPrompt(ex.prompt)}
                  className="press ring-focus cursor-pointer rounded-full border border-line bg-surface px-3.5 py-1.5 text-xs font-medium text-muted transition-colors hover:border-accent/40 hover:bg-mint hover:text-accent"
                >
                  {ex.label}
                </button>
              ))}
            </div>

            {error && (
              <div
                role="alert"
                className="mx-auto mt-6 max-w-xl rounded-xl border border-accent/30 bg-accent/5 px-4 py-3 text-sm text-accent"
              >
                {error}
              </div>
            )}

          </div>
        </div>
      </section>
      )}

      <main className="mx-auto max-w-6xl px-4 pb-24 pt-6 sm:px-6">
        {learnerView === 'dashboard' && (
          <div className="space-y-12">
            {/* Where the finished courses are leading. Above the course list
                because "what am I becoming" is the question a student carries
                between courses, and the list answers "what have I got". */}
            <CareerPath />
            <LearnerDashboardWidget
          courses={courses}
          classes={classes}
          playlists={playlists}
          deadlines={deadlines}
          notifications={notifications}
          activeBuild={activeBuild}
          onCreateCourse={() => showLearnerView('create')}
          onOpenBuild={activeBuild ? () => setLiveGenerationOpen(true) : undefined}
          onOpenDeadline={(classId, assignmentId) => {
            const k = classes.find((c) => c.id === classId);
            if (k) openClass(k, assignmentId);
          }}
        />

        {/* ── Upcoming deadlines (across all classes) ── */}
        <div>
          <DeadlinesPanel
            deadlines={deadlines}
            onOpen={(classId, assignmentId) => {
              const k = classes.find((c) => c.id === classId);
              if (k) openClass(k, assignmentId);
            }}
          />
        </div>
          </div>
        )}

        {/* ── Goals: careers the learner is working toward ──
             Opening a course goes through the reader the rest of the app uses,
             not a location hash the router does not read — that only landed
             the learner back on the course list. */}
        {learnerView === 'goals' && (
          <CareerGoals onOpenCourse={(courseId) => void openCourse(courseId)} />
        )}

        {learnerView === 'record' && <LearningRecord />}

        {learnerView === 'classes' && (
        <section>
          <div className="flex flex-col gap-3 border-b border-line pb-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <span className="eyebrow">Classroom</span>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">My classes</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={profEmail}
                onChange={(e) => setProfEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') joinClass();
                }}
                type="email"
                placeholder="Professor email"
                aria-label="Professor email"
                className="ring-focus w-48 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none"
              />
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') joinClass();
                }}
                placeholder="Class code"
                aria-label="Class join code"
                className="ring-focus w-32 rounded-lg border border-line bg-surface px-3 py-2 font-mono text-sm uppercase tracking-widest text-ink placeholder:font-sans placeholder:tracking-normal placeholder:text-faint focus:border-accent focus:outline-none"
              />
              <button
                onClick={() => joinClass()}
                disabled={joining || !profEmail.trim() || !joinCode.trim()}
                className="press ring-focus inline-flex items-center gap-1.5 rounded-lg bg-accent-fill px-4 py-2 text-sm font-semibold text-canvas disabled:opacity-50"
              >
                {joining ? 'Joining…' : 'Join class'}
              </button>
            </div>
          </div>
          {joinError && (
            <p role="alert" className="mt-3 text-sm text-accent">
              {joinError}
            </p>
          )}
          {classes.length > 0 ? (
            <div className="mt-6 space-y-8">
              {Object.entries(
                classes.reduce<Record<string, StudentClass[]>>((acc, c) => {
                  (acc[c.professorEmail] ||= []).push(c);
                  return acc;
                }, {}),
              ).map(([prof, profClasses]) => (
                <div key={prof}>
                  <div className="flex items-center gap-2.5 border-b border-line pb-2.5">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-fill font-serif text-xs font-semibold text-canvas">
                      {prof.charAt(0).toUpperCase()}
                    </span>
                    <span className="text-sm font-semibold text-ink">{prof}</span>
                    <span className="text-xs text-faint">
                      · {profClasses.length} course{profClasses.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {profClasses.map((c, i) => {
                      const cpct = c.lessonCount ? Math.round((c.completedCount / c.lessonCount) * 100) : 0;
                      return (
                        <div key={c.id} style={delay(i * 55)} className="rise flex flex-col">
                        <button
                          onClick={() => openClass(c)}
                          className="card-edit ring-focus group rounded-2xl p-5 text-left"
                        >
                    <div className="flex items-start justify-between">
                      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-mint text-accent ring-1 ring-inset ring-accent/15">
                        <AwardIcon className="h-5 w-5" />
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="rounded-full bg-mint px-2.5 py-1 text-[11px] font-semibold text-accent">
                          {c.level || 'Class'}
                        </span>
                        {c.completedAt ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-1 text-[11px] font-bold text-accent">
                            <CheckIcon className="h-3 w-3" />
                            Done
                          </span>
                        ) : c.examOpen ? (
                          <span className="rounded-full border border-accent/30 px-2 py-1 text-[11px] font-semibold text-accent">
                            Exam open
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <p className="mt-4 line-clamp-2 text-lg font-semibold leading-snug text-ink">{c.title}</p>
                    <p className="mt-1 line-clamp-1 text-sm text-muted">{c.subtitle}</p>
                    <div className="mt-5">
                      <div className="flex items-center justify-between text-[11px] text-faint">
                        <span>{openingId === c.id ? 'Opening…' : `${c.completedCount} / ${c.lessonCount} lessons`}</span>
                        <span className="font-semibold text-accent">{cpct}%</span>
                      </div>
                      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-line">
                        <div className="h-full rounded-full bg-accent-fill transition-all duration-500" style={{ width: `${cpct}%` }} />
                      </div>
                    </div>
                        </button>

                        {/* Class extras live outside the card button, a button
                            cannot legally contain other buttons. */}
                        <div className="mt-2 flex gap-2">
                          <button
                            onClick={() => setClassDiscussion(c)}
                            className="ring-focus inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-accent/40 hover:text-accent"
                          >
                            <ChatIcon className="h-3.5 w-3.5" />
                            Discussion
                          </button>
                          <button
                            onClick={() => setClassMaterials(c)}
                            className="ring-focus inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-accent/40 hover:text-accent"
                          >
                            <DownloadIcon className="h-3.5 w-3.5" />
                            Materials
                          </button>
                        </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-5 text-sm text-muted">
              Got a class from your professor? Enter their email and class code above to enroll and track your progress.
            </p>
          )}
        </section>
        )}

        <Inbox open={inboxOpen} onClose={() => setInboxOpen(false)} />

        {classDiscussion && (
          <Modal
            open
            onClose={() => setClassDiscussion(null)}
            title={`Discussion, ${classDiscussion.title}`}
            subtitle="Ask your class, questions here help everyone"
            size="lg"
          >
            <ClassDiscussions classId={classDiscussion.id} />
          </Modal>
        )}

        {classMaterials && (
          <Modal
            open
            onClose={() => setClassMaterials(null)}
            title={`Materials, ${classMaterials.title}`}
            subtitle="Files your professor shared"
            size="lg"
          >
            <ClassMaterials classId={classMaterials.id} />
          </Modal>
        )}

        {/* How your studying is actually going, real events, no scores. */}
        {/* Your courses */}
        {learnerView === 'courses' && (
          <section>
            <div className="flex flex-col gap-3 border-b border-line pb-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <span className="eyebrow">Your shelf</span>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">Your courses</h2>
              </div>
              <p className="text-sm text-muted">
                {courses.length} saved courses{showLiveDraftCard ? ' plus 1 building now' : ''}, grouped by topic and playlist.
              </p>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <ShelfFilterButton active={shelfFilter === 'all'} onClick={() => setShelfFilter('all')}>
                All
              </ShelfFilterButton>
              <ShelfFilterButton active={shelfFilter === 'favorites'} onClick={() => setShelfFilter('favorites')}>
                <HeartIcon className="h-3.5 w-3.5" />
                Favorites
              </ShelfFilterButton>
              {courseCategories.map((category) => (
                <ShelfFilterButton
                  key={category}
                  active={shelfFilter === `category:${category}`}
                  onClick={() => setShelfFilter(`category:${category}`)}
                >
                  {category}
                </ShelfFilterButton>
              ))}
              {playlists.map((playlist) => (
                <ShelfFilterButton
                  key={playlist.id}
                  active={shelfFilter === `playlist:${playlist.id}`}
                  onClick={() => setShelfFilter(`playlist:${playlist.id}`)}
                >
                  <FolderIcon className="h-3.5 w-3.5" />
                  {playlist.name}
                  <span className="text-faint">{playlist.courseCount}</span>
                </ShelfFilterButton>
              ))}
            </div>

            {visibleCourses.length > 0 || showLiveDraftCard ? (
              /* The same three-column grid the library uses. A shelf of two
                 courses laid out as full-width rows read as a list of records;
                 the library reads as a shelf, and this is the same shelf. */
              <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {showLiveDraftCard && (
                  <div className="sm:col-span-2 lg:col-span-3">
                    <LiveCourseBuildCard
                      draft={generationDraft}
                      playlistName={generationDraft.playlistId ? playlistName(generationDraft.playlistId) : ''}
                      onOpen={() => setLiveGenerationOpen(true)}
                    />
                  </div>
                )}
                {visibleCourses.map((c, i) => {
                  const cpct = c.lessonCount ? Math.round((c.completedCount / c.lessonCount) * 100) : 0;
                  const availablePlaylists = playlists.filter((playlist) => !c.playlistIds.includes(playlist.id));
                  const category = c.category || guessCourseCategory(c.title, c.subtitle);
                  const hue = HUES[hueIndex(c.title) % HUES.length];

                  return (
                    /*
                     * An <article>, not the library's single <button>.
                     *
                     * The shelf card carries controls the catalogue card does
                     * not — favourite, delete, add to playlist — and nesting
                     * those inside one big button is invalid markup that also
                     * breaks keyboard order. So the plate is the click target
                     * and the controls sit above it, which keeps the library's
                     * shape without pretending the two cards do the same job.
                     */
                    <article
                      key={c.id}
                      style={delay(i * 45)}
                      className="rise card-edit group flex flex-col overflow-hidden rounded-2xl border border-line bg-surface transition-all hover:-translate-y-0.5 hover:border-accent/30 hover:shadow-soft"
                    >
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => openCourse(c.id)}
                          aria-label={'Open ' + c.title}
                          className="ring-focus block w-full cursor-pointer text-left"
                        >
                          {/* A photo when one was found, the subject's hue as a
                              plate when not — the library's treatment, with the
                              cover art this shelf already had. */}
                          {c.coverUrl ? (
                            <CourseCover title={c.title} coverUrl={c.coverUrl} className="h-24 w-full" />
                          ) : (
                            <div
                              className="relative flex h-24 items-end overflow-hidden px-5 pb-3"
                              style={{
                                background: `linear-gradient(130deg, ${hue}, color-mix(in srgb, ${hue} 72%, #ffffff))`,
                              }}
                            >
                              <span
                                aria-hidden
                                className="absolute -right-2 -top-7 select-none font-serif text-[110px] font-medium leading-none text-white/15"
                              >
                                {monogram(category)}
                              </span>
                              <span className="relative rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-white backdrop-blur-sm">
                                {category}
                              </span>
                            </div>
                          )}
                        </button>

                        {/* Progress where the catalogue puts its price, because
                            on a course you own that is the equivalent fact. */}
                        <span className="pointer-events-none absolute bottom-3 right-4 inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-bold text-accent">
                          {cpct === 100 ? (
                            <>
                              <CheckIcon className="h-3 w-3" />
                              Complete
                            </>
                          ) : (
                            `${cpct}%`
                          )}
                        </span>

                        <div className="absolute right-3 top-3 flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => void toggleFavorite(c.id, !c.favorite)}
                            className={[
                              'ring-focus flex h-8 w-8 items-center justify-center rounded-full backdrop-blur-sm transition-colors',
                              c.favorite
                                ? 'bg-white/90 text-accent'
                                : 'bg-black/20 text-white hover:bg-white/90 hover:text-accent',
                            ].join(' ')}
                            aria-label={c.favorite ? 'Remove from favorites' : 'Add to favorites'}
                          >
                            <HeartIcon fill={c.favorite ? 'currentColor' : 'none'} className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => removeCourse(c.id, e)}
                            className="ring-focus flex h-8 w-8 items-center justify-center rounded-full bg-black/20 text-white backdrop-blur-sm transition-colors hover:bg-white/90 hover:text-accent"
                            aria-label="Delete course"
                          >
                            <TrashIcon className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-1 flex-col p-5">
                        <h3 className="font-serif text-xl font-medium leading-snug text-ink">{c.title}</h3>
                        {c.subtitle && <p className="mt-1.5 line-clamp-2 text-sm text-muted">{c.subtitle}</p>}

                        <div className="mt-auto pt-4">
                          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-faint">
                            <span className="inline-flex items-center gap-1">
                              <BookIcon className="h-3.5 w-3.5" />
                              {c.completedCount} / {c.lessonCount} lessons
                            </span>
                            <span>{new Date(c.createdAt).toLocaleDateString()}</span>
                          </p>

                          <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-black/[0.06]">
                            <div
                              className="h-full rounded-full bg-accent-fill transition-all duration-500"
                              style={{ width: cpct + '%' }}
                            />
                          </div>

                          {c.playlistIds.length > 0 && (
                            <div className="mt-3 flex flex-wrap items-center gap-1.5">
                              {c.playlistIds.slice(0, 2).map((id) => (
                                <span
                                  key={id}
                                  className="inline-flex max-w-[9rem] items-center gap-1 rounded-full bg-canvas px-2 py-0.5 text-[11px] font-medium text-muted ring-1 ring-inset ring-line"
                                >
                                  <FolderIcon className="h-3 w-3 shrink-0 text-accent" />
                                  <span className="truncate">{playlistName(id)}</span>
                                </span>
                              ))}
                              {c.playlistIds.length > 2 && (
                                <span className="rounded-full bg-canvas px-2 py-0.5 text-[11px] text-faint ring-1 ring-inset ring-line">
                                  +{c.playlistIds.length - 2}
                                </span>
                              )}
                            </div>
                          )}

                          <div className="mt-3 flex items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => openCourse(c.id)}
                              className="ring-focus inline-flex items-center gap-1 text-sm font-semibold text-accent"
                            >
                              {openingId === c.id ? 'Opening…' : cpct === 100 ? 'Review course' : 'Open course'}
                              <ArrowRightIcon className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                            </button>

                            {availablePlaylists.length > 0 && (
                              <label className="ring-focus inline-flex items-center rounded-full border border-line bg-canvas px-2.5 py-1.5 text-muted transition-colors hover:border-accent/40">
                                <span className="sr-only">Add to playlist</span>
                                <FolderIcon className="mr-1 h-3.5 w-3.5 text-accent" />
                                <select
                                  defaultValue=""
                                  onChange={(e) => {
                                    const playlistId = e.currentTarget.value;
                                    e.currentTarget.value = '';
                                    if (playlistId) void addCourseToPlaylist(c.id, playlistId);
                                  }}
                                  className="max-w-[6rem] bg-transparent text-xs font-semibold text-muted focus:outline-none"
                                  aria-label={'Add ' + c.title + ' to playlist'}
                                >
                                  <option value="">Add to…</option>
                                  {availablePlaylists.map((playlist) => (
                                    <option key={playlist.id} value={playlist.id}>
                                      {playlist.name}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            )}
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="mt-6 rounded-2xl border border-dashed border-line bg-surface/60 px-5 py-8 text-center">
                <p className="font-medium text-ink">Nothing in this view yet.</p>
                <p className="mt-1 text-sm text-muted">Switch filters or add a course to this playlist.</p>
              </div>
            )}
          </section>
        )}

        {/* ── Course library ── */}
        {learnerView === 'jobs' && (
          <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
            <JobPilot />
          </section>
        )}

        {learnerView === 'profile' && (
          <section className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
            <ProfileView email={userEmail} onClose={() => showLearnerView('dashboard')} />
          </section>
        )}

        {learnerView === 'library' &&
          (() => {
            /* The catalog with its art direction attached, once. */
            const rows = libraryCourses.map((item, i) => ({
              item,
              meta: cardMeta(item.course.title, i),
              owned: ownsLibrary(item.id),
            }));
            const categories = ['All', ...Array.from(new Set(rows.map((r) => r.meta.category))).sort(), 'Owned'];
            const visible = rows.filter((r) =>
              shelf === 'All' ? true : shelf === 'Owned' ? r.owned : r.meta.category === shelf,
            );
            return (
              <section>
                <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-4">
                  <div>
                    <span className="eyebrow">Curated catalog</span>
                    <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">Course library</h2>
                    <p className="mt-1 text-sm text-muted">
                      {rows.length} courses, taught the MeritFlow way — every one previewable before you buy.
                    </p>
                  </div>
                  {!isPro && (
                    <a href="/pricing" className="u-link shrink-0 cursor-pointer text-sm font-semibold text-accent">
                      Unlock all with Pro →
                    </a>
                  )}
                </div>

                {/* Shelves. 'Owned' sits at the end — it is a state, not a
                    subject, and mixing it into the middle of subjects reads
                    like a ninth category. */}
                <div className="mt-5 flex flex-wrap gap-2">
                  {categories.map((c) => {
                    const n =
                      c === 'All'
                        ? rows.length
                        : c === 'Owned'
                          ? rows.filter((r) => r.owned).length
                          : rows.filter((r) => r.meta.category === c).length;
                    if (c === 'Owned' && n === 0) return null;
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setShelf(c)}
                        aria-pressed={shelf === c}
                        className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition ${
                          shelf === c ? 'border-accent bg-mint text-accent' : 'border-line bg-canvas text-muted hover:bg-elevated'
                        }`}
                      >
                        {c}
                        <span
                          className={`rounded-full px-1.5 text-[11px] font-semibold tabular-nums leading-4 ${shelf === c ? 'bg-accent/15' : 'bg-elevated'}`}
                        >
                          {n}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {visible.map(({ item, meta, owned }, i) => {
                    const lessons = countLessons(item.course);
                    const videos = countVideos(item.course);
                    return (
                      <button
                        key={item.id}
                        onClick={() => openLibrary(item)}
                        style={delay(i * 55)}
                        className="rise card-edit ring-focus group flex cursor-pointer flex-col overflow-hidden rounded-2xl text-left transition-transform hover:-translate-y-0.5"
                      >
                        {/* The cover: each subject's hue as a plate, with the
                            initial as a watermark — identity without images. */}
                        <div
                          className="relative flex h-24 items-end overflow-hidden px-5 pb-3"
                          style={{
                            background: `linear-gradient(130deg, ${meta.hue}, color-mix(in srgb, ${meta.hue} 72%, #ffffff))`,
                          }}
                        >
                          <span
                            aria-hidden
                            className="absolute -right-2 -top-7 select-none font-serif text-[110px] font-medium leading-none text-white/15"
                          >
                            {monogram(meta.category)}
                          </span>
                          <span className="relative rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-white backdrop-blur-sm">
                            {meta.category}
                          </span>
                          <span className="relative ml-auto">
                            {owned ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-bold text-accent">
                                <CheckIcon className="h-3 w-3" />
                                {isPro ? 'Pro' : 'Owned'}
                              </span>
                            ) : (
                              <span className="rounded-full bg-white/90 px-2.5 py-1 text-[13px] font-bold text-ink">${item.price}</span>
                            )}
                          </span>
                        </div>

                        <div className="flex flex-1 flex-col p-5">
                          <h3 className="font-serif text-xl font-medium leading-snug text-ink">{item.course.title}</h3>
                          <p className="mt-1.5 line-clamp-2 text-sm text-muted">{item.course.subtitle}</p>

                          <div className="mt-auto pt-4">
                            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-faint">
                              {item.course.level && <span className="font-semibold text-muted">{item.course.level}</span>}
                              {item.course.estimatedHours > 0 && <span>~{item.course.estimatedHours}h</span>}
                              <span className="inline-flex items-center gap-1">
                                <LayersIcon className="h-3.5 w-3.5" />
                                {item.course.modules.length} modules
                              </span>
                              <span>{lessons} lessons</span>
                              {videos > 0 && (
                                <span className="inline-flex items-center gap-1 text-accent">
                                  <PlayIcon className="h-3 w-3" />
                                  {videos} videos
                                </span>
                              )}
                            </p>
                            <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-accent">
                              {owned ? 'Open course' : 'Preview'}
                              <ArrowRightIcon className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                  {visible.length === 0 && (
                    <p className="col-span-full rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-muted">
                      Nothing on this shelf yet.
                    </p>
                  )}
                </div>
              </section>
            );
          })()}
      </main>

      {/* Preview / purchase modal */}
      {preview && (
        <Modal
          open
          onClose={() => setPreview(null)}
          size="sm"
          eyebrow={preview.course.level}
          title={preview.course.title}
          subtitle={preview.course.subtitle}
          footer={
            <div className="space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  onClick={() => buy(preview)}
                  disabled={buying}
                  className="press ring-focus inline-flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-full bg-accent-fill px-5 py-3 text-sm font-semibold text-canvas elev-1 disabled:opacity-60"
                >
                  {buying ? 'Purchasing…' : `Buy this course, $${preview.price}`}
                </button>
                <a
                  href="/pricing"
                  className="ring-focus inline-flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-full border border-line px-5 py-3 text-sm font-semibold text-ink transition-colors hover:border-accent/40"
                >
                  <SparklesIcon className="h-4 w-4 text-accent" />
                  Go Pro instead
                </a>
              </div>
              <p className="text-center text-xs text-faint">One-time purchase · yours forever · demo checkout</p>
            </div>
          }
        >
          <p className="text-[15px] leading-relaxed text-ink/80">{preview.course.description}</p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted">
            <span className="rounded-full bg-mint px-2.5 py-1">{preview.course.modules.length} modules</span>
            <span className="rounded-full bg-mint px-2.5 py-1">{countLessons(preview.course)} lessons</span>
            {countVideos(preview.course) > 0 && (
              <span className="rounded-full bg-mint px-2.5 py-1">{countVideos(preview.course)} videos</span>
            )}
            <span className="rounded-full bg-mint px-2.5 py-1">~{preview.course.estimatedHours}h</span>
          </div>
          <p className="eyebrow mt-5">What you’ll learn</p>
          <ul className="mt-3 space-y-1.5">
            {preview.course.outcomes.slice(0, 4).map((o, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-ink/80">
                <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                {o}
              </li>
            ))}
          </ul>
        </Modal>
      )}

    </AppShell>
  );
}

function ShelfFilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'ring-focus inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
        active ? 'border-accent/35 bg-accent text-canvas' : 'border-line bg-surface text-muted hover:border-accent/40 hover:text-ink',
      ].join(' ')}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}

const NOTIFICATION_TONE_CLASS: Record<NotificationTone, string> = {
  success: 'bg-accent/10 text-accent',
  error: 'bg-red-500/10 text-red-500',
  warning: 'bg-amber-500/10 text-amber-600',
  info: 'bg-mint text-accent',
};

function notificationAge(createdAt: number): string {
  const minutes = Math.max(0, Math.floor((Date.now() - createdAt) / 60000));
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function NotificationsPopover({ notifications }: { notifications: AppNotification[] }) {
  const items = notifications.slice(0, 8);

  return (
    <div className="absolute right-0 top-12 z-50 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <p className="text-sm font-semibold text-ink">Notifications</p>
        <span className="text-[11px] font-medium text-faint">{items.length ? `${items.length} recent` : 'Clear'}</span>
      </div>
      {items.length > 0 ? (
        <ul className="thin-scroll max-h-96 overflow-auto p-2">
          {items.map((notification) => {
            const content = (
              <>
                <div className="flex items-start justify-between gap-3">
                  <span
                    className={[
                      'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase',
                      NOTIFICATION_TONE_CLASS[notification.tone],
                    ].join(' ')}
                  >
                    {notification.tone}
                  </span>
                  <span className="shrink-0 text-[11px] text-faint">{notificationAge(notification.createdAt)}</span>
                </div>
                <p className="mt-2 text-sm font-semibold text-ink">{notification.title}</p>
                {notification.message && <p className="mt-0.5 text-xs leading-5 text-muted">{notification.message}</p>}
              </>
            );
            return (
              <li key={notification.id}>
                {notification.href ? (
                  <a
                    href={notification.href}
                    className="block rounded-xl px-3 py-2.5 transition-colors hover:bg-mint/50"
                  >
                    {content}
                  </a>
                ) : (
                  <div className="rounded-xl px-3 py-2.5">{content}</div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="px-4 py-8 text-center">
          <p className="text-sm font-medium text-ink">No updates yet.</p>
          <p className="mt-1 text-xs text-muted">Course generation, failures, and playlist changes will appear here.</p>
        </div>
      )}
    </div>
  );
}

function draftProgress(draft: GenerationDraft) {
  const total = draft.outline?.modules.length ?? draft.modules.length;
  const completed = draft.modules.filter(Boolean).length;
  const pct =
    draft.status === 'ready'
      ? 100
      : total > 0
        ? Math.max(8, Math.round((completed / total) * 100))
        : 8;
  return { total, completed, pct };
}

function liveLessonDuration(lesson: EnrichedLesson): string {
  if (lesson.video && lesson.video.durationSeconds > 0) return formatLiveDuration(lesson.video.durationSeconds);
  const text = `${lesson.intro} ${lesson.sections.map((s) => s.body).join(' ')} ${lesson.keyPoints.join(' ')}`;
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return `${Math.max(2, Math.round(words / 180))} min`;
}

function formatLiveDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function LiveCourseBuildCard({
  draft,
  playlistName,
  onOpen,
}: {
  draft: GenerationDraft;
  playlistName: string;
  onOpen: () => void;
}) {
  /* Which finished module the learner is currently reading, if any. */
  const { total, completed, pct } = draftProgress(draft);
  const isError = draft.status === 'error';

  return (
    <article className="rise card-edit relative flex min-h-[230px] flex-col overflow-hidden rounded-2xl border-accent/35 p-4 text-left">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-accent via-accent-2 to-accent" />
      <div className="flex items-start justify-between gap-3">
        <span
          className={[
            'flex h-10 w-10 items-center justify-center rounded-xl text-canvas',
            isError ? 'bg-red-500' : 'bg-accent-fill',
          ].join(' ')}
        >
          {isError ? <AlertTriangleIcon className="h-5 w-5" /> : <SparklesIcon className="h-5 w-5 animate-pulse" />}
        </span>
        <span
          className={[
            'rounded-full px-2.5 py-1 text-[11px] font-bold uppercase',
            isError ? 'bg-red-500/10 text-red-500' : 'bg-accent/10 text-accent',
          ].join(' ')}
        >
          {isError ? 'Failed' : 'Building'}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <span className="rounded-full bg-mint px-2.5 py-1 text-[11px] font-semibold text-accent">
          {guessCourseCategory(draft.outline?.title ?? draft.topic, draft.outline?.subtitle)}
        </span>
        <span className="rounded-full border border-line px-2.5 py-1 text-[11px] font-semibold text-muted">
          {draft.level}
        </span>
        {playlistName && (
          <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-canvas px-2.5 py-1 text-[11px] font-medium text-muted ring-1 ring-inset ring-line">
            <FolderIcon className="h-3 w-3 text-accent" />
            <span className="truncate">{playlistName}</span>
          </span>
        )}
      </div>

      <h3 className="mt-3 line-clamp-2 font-serif text-lg font-medium leading-snug text-ink">
        {draft.outline?.title ?? draft.topic}
      </h3>
      <p className="mt-1 line-clamp-2 text-sm leading-5 text-muted">{draft.outline?.subtitle ?? draft.message}</p>

      <div className="mt-auto pt-4">
        <div className="flex items-center justify-between text-[11px] text-faint">
          <span>{total > 0 ? `${completed} / ${total} modules streamed` : draft.stage.replace(/_/g, ' ')}</span>
          <span className="font-semibold text-accent">{pct}%</span>
        </div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-black/[0.06]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-accent to-accent-2 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <button
          type="button"
          onClick={onOpen}
          className="press ring-focus mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-accent-fill px-3 py-2 text-sm font-semibold text-canvas"
        >
          {isError ? 'Open build log' : 'Open live build'}
          <ArrowRightIcon className="h-3.5 w-3.5" />
        </button>
      </div>
    </article>
  );
}

function LiveGenerationWorkspace({
  draft,
  playlistName,
  onBack,
  onOpenCourse,
}: {
  draft: GenerationDraft;
  playlistName: string;
  onBack: () => void;
  onOpenCourse?: () => void;
}) {
  /* Which finished module the learner is currently reading, if any. */
  const [openModule, setOpenModule] = useState<number | null>(null);
  const { total, completed, pct } = draftProgress(draft);
  const previewCourse = previewCourseFromDraft(draft);
  const modules = previewCourse.modules;
  const completedKeys = new Set<string>();
  draft.modules.forEach((module, moduleIndex) => {
    module?.lessons.forEach((_, lessonIndex) => completedKeys.add(`${moduleIndex}:${lessonIndex}`));
  });
  const isReady = draft.status === 'ready';
  const isError = draft.status === 'error';
  const totalLessons = modules.reduce((sum, mod) => sum + mod.lessons.length, 0);
  const streamedLessons = completedKeys.size;
  const activityModules = draft.modules.filter((mod) => mod?.activities).length;
  const recentDeltas = (draft.deltaLog ?? []).slice(-7).reverse();
  const primaryLabel = isReady && onOpenCourse ? 'Open course' : isError ? 'Review build' : 'Watch modules';
  const handlePrimary = () => {
    if (isReady && onOpenCourse) {
      onOpenCourse();
      return;
    }
    if (typeof document !== 'undefined') {
      document.getElementById('live-module-progress')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/80 backdrop-blur">
        <nav className="mx-auto flex max-w-[1680px] items-center gap-3 px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={onBack}
            className="ring-focus inline-flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-surface text-muted transition-colors hover:border-accent/40 hover:text-accent"
            aria-label="Back to course shelf"
          >
            <ArrowRightIcon className="h-4 w-4 rotate-180" />
          </button>
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-accent/30 bg-accent/15 text-accent">
            <SparklesIcon className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-semibold text-ink">{previewCourse.title}</h1>
            <p className="hidden truncate text-xs text-muted sm:block">{draft.message}</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span
              className={[
                'hidden rounded-full px-3 py-1 text-xs font-bold uppercase sm:inline-flex',
                isError ? 'bg-red-500/10 text-red-500' : isReady ? 'bg-accent/10 text-accent' : 'bg-mint text-accent',
              ].join(' ')}
            >
              {isError ? 'failed' : isReady ? 'ready' : draft.stage.replace(/_/g, ' ')}
            </span>
            <BuildProgressRing pct={pct} />
            {onOpenCourse && (
              <button
                type="button"
                onClick={onOpenCourse}
                className="press ring-focus inline-flex items-center gap-1.5 rounded-full bg-accent-fill px-4 py-2 text-sm font-semibold text-canvas"
              >
                Open course
                <ArrowRightIcon className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </nav>
      </header>

      <div className="mx-auto grid max-w-[1680px] grid-cols-1 lg:grid-cols-[360px_1fr] xl:grid-cols-[420px_1fr]">
        <aside className="hidden border-r border-line lg:block">
          <div className="thin-scroll sticky top-[57px] max-h-[calc(100vh-57px)] overflow-y-auto px-4 py-6">
            <LiveBuildSidebar
              draft={draft}
              course={previewCourse}
              playlistName={playlistName}
              completedKeys={completedKeys}
              pct={pct}
              openModule={openModule}
              onOpenModule={setOpenModule}
            />
          </div>
        </aside>

        <main className="min-w-0 px-4 py-7 sm:px-8">
          <div className="mb-5 rounded-xl border border-line bg-surface/65 px-3.5 py-3 lg:hidden">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted">
                {completed} / {total} modules ready
              </span>
              <span className="font-medium text-accent">{pct}%</span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-black/[0.08]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-accent to-accent-2 transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          {isError && (
            <div className="mx-auto mb-5 max-w-3xl rounded-xl border border-red-500/25 bg-red-500/5 px-4 py-3 text-sm text-red-500">
              {draft.error ?? 'The course build stopped before completing.'}
            </div>
          )}

          <CourseFrontMatter
            course={previewCourse}
            totalLessons={totalLessons}
            totalVideos={0}
            completedCount={streamedLessons}
            pct={totalLessons > 0 ? Math.round((streamedLessons / totalLessons) * 100) : pct}
            startLabel={primaryLabel}
            onStart={handlePrimary}
            /* A course still being written has no lesson to resume at. */
            upNext={null}
            hasExam={false}
            examCount={0}
            certId={null}
            onExam={() => undefined}
            completed={completedKeys}
            onSelectLesson={(m) => {
              if (typeof document !== 'undefined') {
                document.getElementById(`live-module-${m}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }
            }}
            onLab={(m) => {
              if (typeof document !== 'undefined') {
                document.getElementById(`live-module-${m}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }
            }}
            onQuiz={(m) => {
              if (typeof document !== 'undefined') {
                document.getElementById(`live-module-${m}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }
            }}
            keyOf={(m, l) => `${m}:${l}`}
          />

          <section id="live-module-progress" className="mx-auto mt-8 max-w-3xl pb-12">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="eyebrow">Live build stream</p>
                <h2 className="text-lg font-semibold text-ink">Module progress</h2>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <GenerationBadge label={`${completed}/${total} modules`} />
                <GenerationBadge label={`${streamedLessons}/${totalLessons} lessons`} />
                <GenerationBadge label={`${activityModules} activity labs`} />
              </div>
            </div>

            <div className="space-y-3">
              {modules.map((module, index) => {
                const generatedModule = draft.modules[index];
                const moduleDelta = (draft.moduleDeltas ?? {})[index];
                const moduleState = generatedModule ? 'ready' : moduleDelta ? 'writing' : 'waiting';
                return (
                  <article
                    id={`live-module-${index}`}
                    key={`${module.title}-${index}`}
                    className="rounded-xl border border-line bg-surface/75 p-4"
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={[
                          'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-bold',
                          generatedModule
                            ? 'border-accent bg-accent text-canvas'
                            : moduleDelta
                              ? 'border-accent/30 bg-accent/10 text-accent'
                              : 'border-faint/50 text-faint',
                        ].join(' ')}
                      >
                        {generatedModule ? <CheckIcon className="h-4 w-4" /> : index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="min-w-0 flex-1 text-base font-semibold text-ink">{module.title}</h3>
                          <GenerationBadge label={moduleState} />
                          {generatedModule && (
                            <button
                              type="button"
                              onClick={() => setOpenModule(openModule === index ? null : index)}
                              className="press ring-focus inline-flex shrink-0 items-center gap-1.5 rounded-full bg-accent-fill px-3 py-1 text-xs font-bold text-canvas"
                            >
                              {openModule === index ? 'Close' : 'Read now'}
                              <ArrowRightIcon
                                className={['h-3 w-3 transition-transform', openModule === index ? 'rotate-90' : ''].join(' ')}
                              />
                            </button>
                          )}
                        </div>
                        <p className="mt-1 text-sm leading-6 text-muted">{module.summary}</p>
                        {moduleDelta && !generatedModule && (
                          <p className="mt-2 line-clamp-3 whitespace-pre-line rounded-lg border border-accent/20 bg-accent/5 px-3 py-2 text-xs leading-5 text-muted">
                            {moduleDelta}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* A finished module is readable immediately, the text has
                        already arrived, so there is no reason to make the
                        learner wait for the rest of the course. */}
                    {generatedModule && openModule === index && (
                      <div className="animate-fade-in-up mt-4 space-y-6 border-t border-line pt-4">
                        {generatedModule.lessons.map((lesson, lessonIndex) => (
                          <article
                            id={`live-lesson-${index}-${lessonIndex}`}
                            key={lessonIndex}
                            className="book-page rounded-lg px-5 py-5 sm:px-7"
                          >
                            <p className="chapter-num">
                              Lesson {index + 1}.{lessonIndex + 1}
                            </p>
                            <h4 className="chapter-title mt-1.5 text-left text-[1.35rem]">{lesson.title}</h4>
                            {lesson.objective && <p className="epigraph book-measure mt-3">{lesson.objective}</p>}

                            <div className="book-body book-measure book-flow mt-4">
                              {(lesson.intro ?? '')
                                .split(/\n{2,}/)
                                .filter(Boolean)
                                .map((para, i) => (
                                  <p key={i} className={i === 0 ? 'drop-cap' : undefined}>
                                    {para}
                                  </p>
                                ))}
                            </div>

                            {lesson.sections.map((section, sectionIndex) => (
                              <section key={sectionIndex} className="mt-6">
                                <h5 className="book-h2 book-measure border-b border-paper-edge pb-1.5 text-[1.15rem]">
                                  <span className="book-h2-num">
                                    {index + 1}.{lessonIndex + 1}.{sectionIndex + 1}{' '}
                                  </span>
                                  {section.heading}
                                </h5>
                                <div className="book-body book-measure book-flow mt-3">
                                  {section.body
                                    .split(/\n{2,}/)
                                    .filter(Boolean)
                                    .map((para, i) => (
                                      <p key={i}>{para}</p>
                                    ))}
                                </div>
                              </section>
                            ))}
                          </article>
                        ))}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>

            {recentDeltas.length > 0 && (
              <div className="mt-6 rounded-xl border border-line bg-surface/75 p-4">
                <h2 className="text-sm font-semibold text-ink">Recent agent events</h2>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {recentDeltas.map((delta) => (
                    <div key={delta.id} className="rounded-lg border border-line bg-canvas px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-accent">
                          {delta.scope}
                        </span>
                        {typeof delta.index === 'number' && (
                          <span className="rounded-full bg-mint px-2 py-0.5 text-[10px] font-bold text-accent">
                            M{delta.index + 1}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 line-clamp-3 whitespace-pre-line text-xs leading-5 text-muted">
                        {delta.text}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}

function LiveBuildSidebar({
  draft,
  course,
  playlistName,
  completedKeys,
  pct,
  openModule,
  onOpenModule,
}: {
  draft: GenerationDraft;
  course: EnrichedCourse;
  playlistName: string;
  completedKeys: Set<string>;
  pct: number;
  openModule: number | null;
  onOpenModule: (moduleIndex: number | null) => void;
}) {
  const totalLessons = course.modules.reduce((sum, module) => sum + module.lessons.length, 0);
  const readyLessons = completedKeys.size;
  const lessonPct = totalLessons > 0 ? Math.round((readyLessons / totalLessons) * 100) : pct;

  function jumpTo(moduleIndex: number, lessonIndex?: number) {
    const generated = Boolean(draft.modules[moduleIndex]);
    if (generated) onOpenModule(moduleIndex);
    const targetId = generated && typeof lessonIndex === 'number' ? `live-lesson-${moduleIndex}-${lessonIndex}` : `live-module-${moduleIndex}`;
    window.setTimeout(() => {
      document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, generated ? 80 : 0);
  }

  return (
    <nav className="space-y-6">
      <div className="rounded-xl border border-line bg-surface/50 px-4 py-4">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted">
            {readyLessons} / {totalLessons} generated
          </span>
          <span className="font-medium text-accent">{lessonPct}%</span>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-black/[0.08]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-accent to-accent-2 transition-all duration-300"
            style={{ width: `${lessonPct}%` }}
          />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] text-faint">
          <span className="truncate">
            <span className="block font-semibold text-ink">{draft.language}</span>
            Language
          </span>
          <span className="truncate">
            <span className="block font-semibold text-ink">{draft.level}</span>
            Level
          </span>
          <span className="truncate">
            <span className="block truncate font-semibold text-ink">{playlistName || 'Shelf'}</span>
            Playlist
          </span>
        </div>
      </div>

      <button
        type="button"
        className="ring-focus flex w-full items-center gap-2 rounded-lg bg-accent/12 px-3 py-2 text-left text-sm font-medium text-accent"
        onClick={(event) => {
          event.preventDefault();
          if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      >
        <BookIcon className="h-4 w-4" />
        Course overview
      </button>

      {course.modules.map((module, moduleIndex) => {
        const generated = draft.modules[moduleIndex];
        const writing = !generated && Boolean((draft.moduleDeltas ?? {})[moduleIndex]);
        const active = openModule === moduleIndex;
        return (
          <div key={`${module.title}-${moduleIndex}`} className="border-t border-line/70 pt-5 first:border-t-0 first:pt-0">
            <div className="flex items-start justify-between gap-3 px-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-faint">Module {moduleIndex + 1}</p>
                <button
                  type="button"
                  onClick={() => jumpTo(moduleIndex)}
                  className={[
                    'mt-1 block max-w-full truncate text-left text-sm font-semibold transition-colors hover:text-accent',
                    active ? 'text-accent' : 'text-ink/90',
                  ].join(' ')}
                >
                  {module.title}
                </button>
              </div>
              <span
                className={[
                  'mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase',
                  generated ? 'bg-accent/10 text-accent' : writing ? 'bg-mint text-accent' : 'bg-surface text-faint',
                ].join(' ')}
              >
                {generated ? `${generated.lessons.length}/${module.lessons.length}` : writing ? 'live' : 'waiting'}
              </span>
            </div>
            <ul className="mt-2 space-y-0.5">
              {module.lessons.map((lesson, lessonIndex) => {
                const done = completedKeys.has(`${moduleIndex}:${lessonIndex}`);
                return (
                  <li
                    key={`${lesson.title}-${lessonIndex}`}
                    className={[
                      'flex items-center rounded-lg transition-colors',
                      done && active ? 'bg-accent/12' : 'hover:bg-surface',
                    ].join(' ')}
                  >
                    <span className="shrink-0 py-2 pl-3">
                      <span
                        className={[
                          'flex h-6 w-6 items-center justify-center rounded-full border transition-colors',
                          done
                            ? 'border-accent bg-accent text-canvas'
                            : writing
                              ? 'border-accent/60 text-accent'
                              : 'border-faint/50 text-transparent',
                        ].join(' ')}
                      >
                        {done ? <CheckIcon className="h-3 w-3" /> : writing ? <SparklesIcon className="h-3 w-3" /> : null}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => jumpTo(moduleIndex, lessonIndex)}
                      className={[
                        'ring-focus flex min-w-0 flex-1 items-center gap-2 rounded-lg py-2 pl-2 pr-3 text-left text-sm leading-snug',
                        done && active ? 'font-medium text-accent' : done ? 'text-muted' : writing ? 'font-medium text-accent' : 'text-muted',
                      ].join(' ')}
                    >
                      <span className="flex-1">{lesson.title}</span>
                      <span className="flex shrink-0 items-center gap-1 text-[11px] text-faint">
                        {lesson.video && <PlayIcon className="h-2.5 w-2.5" />}
                        {done ? liveLessonDuration(lesson) : writing ? 'live' : 'queued'}
                      </span>
                    </button>
                  </li>
                );
              })}
              <li className="flex items-center gap-2 rounded-lg py-2 pl-3 pr-3 text-sm text-muted">
                <span
                  className={[
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border',
                    generated ? 'border-accent/60 text-accent' : 'border-faint/50 text-faint',
                  ].join(' ')}
                >
                  <SparklesIcon className="h-3 w-3" />
                </span>
                <span className="flex-1">Practice lab</span>
                <span className="text-[11px] text-faint">{generated ? 'ready' : 'queued'}</span>
              </li>
              <li className="flex items-center gap-2 rounded-lg py-2 pl-3 pr-3 text-sm text-muted">
                <span
                  className={[
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border',
                    generated ? 'border-accent/60 text-accent' : 'border-faint/50 text-faint',
                  ].join(' ')}
                >
                  <QuizIcon className="h-3 w-3" />
                </span>
                <span className="flex-1">Module quiz</span>
                <span className="text-[11px] text-faint">{generated ? 'ready' : 'queued'}</span>
              </li>
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

function BuildProgressRing({ pct }: { pct: number }) {
  const r = 15;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.min(100, Math.max(0, pct)) / 100);
  return (
    <div className="relative h-9 w-9">
      <svg width="36" height="36" viewBox="0 0 36 36" className="-rotate-90">
        <circle cx="18" cy="18" r={r} fill="none" stroke="currentColor" strokeWidth="3.5" className="text-black/[0.08]" />
        <circle
          cx="18"
          cy="18"
          r={r}
          fill="none"
          stroke="url(#build-ring-grad)"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={off}
          style={{ transition: 'stroke-dashoffset 0.4s ease' }}
        />
        <defs>
          <linearGradient id="build-ring-grad" x1="0" y1="0" x2="36" y2="36">
            <stop offset="0" stopColor="#125c4d" />
            <stop offset="1" stopColor="#c08a2e" />
          </linearGradient>
        </defs>
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-ink">{pct}%</span>
    </div>
  );
}

function GenerationBadge({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-line bg-surface px-2 py-0.5 text-[11px] font-medium text-muted">
      {label}
    </span>
  );
}

function DeadlinesPanel({
  deadlines,
  onOpen,
}: {
  deadlines: UpcomingAssignment[];
  onOpen: (classId: string, assignmentId?: string) => void;
}) {
  const [now] = useState(() => Date.now());
  // Drop graded items (done); show the soonest handful.
  const items = deadlines.filter((d) => !d.graded);
  if (items.length === 0) return null;
  const shown = items.slice(0, 6);
  const overdue = items.filter(
    (d) => d.submittedAt == null && dueInfo(d.dueAt, now, null).tone === 'overdue',
  ).length;

  return (
    <section className="mb-12 rounded-2xl border border-line bg-surface/60 p-5">
      <div className="flex items-center justify-between gap-3 border-b border-line pb-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-mint text-accent">
            <ClockIcon className="h-4 w-4" />
          </span>
          <h2 className="text-lg font-semibold tracking-tight text-ink">Upcoming deadlines</h2>
        </div>
        {overdue > 0 && (
          <span className="rounded-full bg-red-500/15 px-2.5 py-1 text-[11px] font-bold text-red-400">
            {overdue} overdue
          </span>
        )}
      </div>
      <ul className="mt-3 divide-y divide-line">
        {shown.map((d) => {
          const info = dueInfo(d.dueAt, now, d.submittedAt != null ? { submittedAt: d.submittedAt, graded: false } : null);
          return (
            <li key={d.id}>
              <button
                onClick={() => onOpen(d.classId, d.id)}
                className="ring-focus group flex w-full items-center gap-3 rounded-lg px-1.5 py-2.5 text-left transition-colors hover:bg-mint/40"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-ink">{d.title}</span>
                  <span className="block truncate text-xs text-faint">
                    {d.classTitle} · {d.points} pts · {formatDueDate(d.dueAt)}
                  </span>
                </span>
                <span className={['shrink-0 text-xs font-semibold', DUE_TONE_CLASS[info.tone]].join(' ')}>
                  {info.label}
                </span>
                <ArrowRightIcon className="h-4 w-4 shrink-0 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
              </button>
            </li>
          );
        })}
      </ul>
      {items.length > shown.length && (
        <p className="mt-2 text-xs text-faint">+ {items.length - shown.length} more in your classes</p>
      )}
    </section>
  );
}
