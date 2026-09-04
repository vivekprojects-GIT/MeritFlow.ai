import { catalogStats } from '@/lib/catalog-stats';
import { libraryCourses } from '@/lib/library';
import { ArrowRightIcon, BookIcon, CheckIcon, ClockIcon, LayersIcon, PlayIcon, SparklesIcon, TargetIcon } from './icons';
import { ModeAnalyticsPanel, type ModeAnalyticsColumn, type ModeAnalyticsInsight } from './mode-analytics-panel';

type Domain = {
  name: string;
  courses: number;
  lessons: number;
  videos: number;
  hue: string;
};

const DOMAIN_MATCHERS: Array<{ name: string; hue: string; pattern: RegExp }> = [
  { name: 'Programming', hue: '#2563eb', pattern: /\b(python|web|html|css|programming|code)\b/i },
  { name: 'AI & Data', hue: '#7c3aed', pattern: /\b(machine learning|ai|data|statistics)\b/i },
  { name: 'Design', hue: '#db2777', pattern: /\b(ui|ux|design|figma|prototype)\b/i },
  { name: 'Business', hue: '#b45309', pattern: /\b(finance|investing|negotiation|productivity|business)\b/i },
  { name: 'Communication', hue: '#059669', pattern: /\b(public speaking|storytelling|communication)\b/i },
  { name: 'Creative', hue: '#dc2626', pattern: /\b(photography|guitar|cooking|creative)\b/i },
];

function summarizePublicCatalog() {
  const domains = new Map<string, Domain>();
  let videos = 0;
  let quizzes = 0;
  let practiceLessons = 0;
  let modulesWithQuiz = 0;

  for (const item of libraryCourses) {
    const course = item.course;
    const searchable = `${course.title} ${course.subtitle} ${course.description}`;
    const matched =
      DOMAIN_MATCHERS.find((domain) => domain.pattern.test(searchable)) ??
      ({ name: 'General', hue: '#475569', pattern: /./ } as const);
    const lessonCount = course.modules.reduce((total, mod) => total + mod.lessons.length, 0);
    const videoCount = course.modules.reduce((total, mod) => total + mod.lessons.filter((lesson) => lesson.video).length, 0);

    videos += videoCount;
    quizzes += course.modules.reduce((total, mod) => total + (mod.quiz?.length ?? 0), 0);
    modulesWithQuiz += course.modules.filter((mod) => (mod.quiz?.length ?? 0) > 0).length;
    practiceLessons += course.modules.reduce(
      (total, mod) => total + mod.lessons.filter((lesson) => lesson.practice?.trim()).length,
      0,
    );

    const current = domains.get(matched.name) ?? { name: matched.name, courses: 0, lessons: 0, videos: 0, hue: matched.hue };
    current.courses += 1;
    current.lessons += lessonCount;
    current.videos += videoCount;
    domains.set(matched.name, current);
  }

  const videoCoverage = catalogStats.lessons ? Math.round((videos / catalogStats.lessons) * 100) : 0;
  const practiceCoverage = catalogStats.lessons ? Math.round((practiceLessons / catalogStats.lessons) * 100) : 0;
  const quizCoverage = catalogStats.modules ? Math.round((modulesWithQuiz / catalogStats.modules) * 100) : 0;
  const createReadiness = Math.round((videoCoverage + practiceCoverage + quizCoverage) / 3);
  const domainsList = [...domains.values()].sort((a, b) => b.lessons - a.lessons);

  return { videos, quizzes, practiceLessons, modulesWithQuiz, videoCoverage, practiceCoverage, quizCoverage, createReadiness, domains: domainsList };
}

export function PublicDashboardWidget() {
  const summary = summarizePublicCatalog();
  const topDomain = summary.domains[0];
  const signals = [
    {
      label: 'Video coverage',
      value: `${summary.videoCoverage}%`,
      detail: `${summary.videos}/${catalogStats.lessons} lessons with video`,
      icon: PlayIcon,
    },
    {
      label: 'Practice coverage',
      value: `${summary.practiceCoverage}%`,
      detail: `${summary.practiceLessons} hands-on prompts`,
      icon: TargetIcon,
    },
    {
      label: 'Checks written',
      value: summary.quizzes.toLocaleString(),
      detail: 'quiz questions across modules',
      icon: CheckIcon,
    },
    {
      label: 'Interactive labs',
      value: '4',
      detail: 'mind maps, cards, memory, challenge',
      icon: SparklesIcon,
    },
  ];
  const modeAnalytics: ModeAnalyticsColumn[] = [
    {
      eyebrow: 'Create mode',
      title: 'Course production readiness',
      value: `${summary.createReadiness}%`,
      detail: 'media, quiz, and practice coverage',
      icon: <SparklesIcon className="h-4 w-4" />,
      rows: [
        { label: 'Video-backed lessons', value: `${summary.videoCoverage}%`, pct: summary.videoCoverage },
        { label: 'Quiz-ready modules', value: `${summary.quizCoverage}%`, pct: summary.quizCoverage },
        { label: 'Practice prompts', value: `${summary.practiceCoverage}%`, pct: summary.practiceCoverage },
      ],
      signals: ['AI video pipeline', 'Quiz generator', 'Mind map registry', 'Game activity catalog'],
    },
    {
      eyebrow: 'Learn mode',
      title: 'Learner workspace depth',
      value: catalogStats.lessons.toLocaleString(),
      detail: 'structured lessons ready to open',
      icon: <BookIcon className="h-4 w-4" />,
      rows: [
        { label: 'Module map', value: catalogStats.modules.toLocaleString(), pct: Math.min(100, catalogStats.modules * 3) },
        { label: 'Subject clusters', value: summary.domains.length.toLocaleString(), pct: Math.min(100, summary.domains.length * 14) },
        { label: 'Interactive component types', value: '4', pct: 100 },
      ],
      signals: ['AI tutor surface', 'Flash cards', 'Memory games', 'Challenge labs'],
      tone: 'good',
    },
  ];
  const executiveInsights: ModeAnalyticsInsight[] = [
    {
      label: 'Benchmark score',
      value: `${summary.createReadiness}%`,
      detail: 'Course production readiness combines media, quiz, and practice coverage.',
      tone: summary.createReadiness >= 90 ? 'good' : 'neutral',
    },
    {
      label: 'Differentiator',
      value: '4 labs',
      detail: 'Mind maps, flash cards, memory games, and challenge labs are available as learning formats.',
      tone: 'good',
    },
    {
      label: 'Catalog signal',
      value: topDomain?.name ?? 'Ready',
      detail: topDomain ? `${topDomain.lessons} lessons in the strongest subject cluster.` : 'Add courses to reveal topic momentum.',
    },
  ];

  return (
    <section className="border-y border-line bg-canvas py-12">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.08fr)_minmax(340px,0.92fr)]">
          <div>
            <span className="eyebrow">Public dashboard</span>
            <h2 className="mt-3 text-2xl font-bold tracking-tight text-ink sm:text-3xl">Course intelligence before you sign in</h2>
            <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted">
              A live snapshot of the library's learning depth, media coverage, practice density, and subject spread.
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {signals.map((signal) => {
                const Icon = signal.icon;
                return (
                  <div key={signal.label} className="rounded-2xl border border-line bg-surface p-4 shadow-soft">
                    <div className="flex items-start justify-between gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-mint text-accent">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="text-2xl font-black tracking-tight text-ink">{signal.value}</span>
                    </div>
                    <p className="mt-3 text-xs font-bold uppercase tracking-[0.14em] text-faint">{signal.label}</p>
                    <p className="mt-1 text-sm text-muted">{signal.detail}</p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-[28px] border border-line bg-surface p-4 shadow-3d">
            <div className="grid grid-cols-2 gap-3">
              <Metric icon={<BookIcon className="h-4 w-4" />} label="Courses" value={catalogStats.courses.toLocaleString()} />
              <Metric icon={<LayersIcon className="h-4 w-4" />} label="Modules" value={catalogStats.modules.toLocaleString()} />
              <Metric icon={<ClockIcon className="h-4 w-4" />} label="Hours" value={`~${catalogStats.hours}`} />
              <Metric icon={<PlayIcon className="h-3.5 w-3.5" />} label="Videos" value={summary.videos.toLocaleString()} />
            </div>

            <div className="mt-5 rounded-2xl border border-line bg-canvas p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-faint">Catalog breadth</p>
                  <p className="mt-1 text-sm text-muted">{summary.domains.length} active subject clusters</p>
                </div>
                {topDomain && <span className="rounded-full bg-mint px-2.5 py-1 text-xs font-bold text-accent">Top: {topDomain.name}</span>}
              </div>
              <div className="mt-4 space-y-3">
                {summary.domains.map((domain) => {
                  const width = catalogStats.lessons ? Math.max(8, Math.round((domain.lessons / catalogStats.lessons) * 100)) : 8;
                  return (
                    <div key={domain.name}>
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <span className="font-semibold text-ink">{domain.name}</span>
                        <span className="text-faint">
                          {domain.courses} course{domain.courses === 1 ? '' : 's'} / {domain.lessons} lessons
                        </span>
                      </div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-line">
                        <div className="h-full rounded-full" style={{ width: `${width}%`, backgroundColor: domain.hue }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <a
              href="/login"
              className="ring-focus mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-accent-fill px-4 py-3 text-sm font-bold text-canvas"
            >
              Open your dashboard
              <ArrowRightIcon className="h-4 w-4" />
            </a>
          </div>
        </div>

        <div className="mt-6">
          <ModeAnalyticsPanel
            title="Create/Learn benchmark"
            subtitle="The public view exposes the same operating model evaluators look for: how fast courses can be produced, and how rich the learner workspace becomes after publication."
            columns={modeAnalytics}
            insights={executiveInsights}
          />
        </div>
      </div>
    </section>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-canvas p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent">{icon}</span>
        <span className="text-xl font-black tracking-tight text-ink">{value}</span>
      </div>
      <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.14em] text-faint">{label}</p>
    </div>
  );
}
