'use client';

import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  AnimatePresence,
  animate,
  domMax,
  LazyMotion,
  m,
  MotionConfig,
  useInView,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type Variants,
} from 'framer-motion';
import { catalogStats } from '@/lib/catalog-stats';
import { sampleCourses } from '@/lib/sample-courses';
import { PricingPlans } from './pricing-plans';
import { PublicDashboardWidget } from './public-dashboard-widget';
import { SiteNav } from './site-nav';
import { HeroVisual, PipelineDiagram } from './hero-visual';
import { SiteFooter } from './site-footer';
import {
  ArrowRightIcon,
  BookIcon,
  CheckIcon,
  ClockIcon,
  LayersIcon,
  MicIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  SparklesIcon,
  TargetIcon,
} from './icons';

/* ── Shared motion variants ─────────────────────────────────────────────── */
const EASE = [0.22, 0.7, 0.2, 1] as const;
const fadeUp: Variants = { hidden: { opacity: 0, y: 28 }, show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } } };
const stagger: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } } };
const heroContainer: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } } };
const heroItem: Variants = { hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 120, damping: 18 } } };
const VIEW = { once: true, amount: 0.2 } as const;

/* ── Content ─────────────────────────────────────────────────────────────── */
const TOPICS = ['Machine learning', 'Personal finance', 'UI/UX design', 'Python', 'Public speaking', 'Photography', 'Guitar', 'Negotiation', 'Statistics', 'Cooking', 'Spanish', 'Investing'];
const HERO_PROMPTS = ['Build a course on machine learning for beginners', 'Teach me personal finance from scratch', 'I want to learn fingerstyle guitar'];
const DEMO_TOPICS = ['Machine learning', 'Personal finance', 'Guitar', 'Negotiation', 'Photography'];
const PREVIEW_MODULES = [
  { title: 'Getting started', lessons: 3 },
  { title: 'Core concepts', lessons: 4 },
  { title: 'Hands-on practice', lessons: 3 },
  { title: 'Build a real project', lessons: 2 },
];

/* Counted from the real catalogue at build time. The previous figures here
   ("120k+ courses generated", "4.9 average rating") were invented and would be
   untrue to any visitor who checked, a claim nobody can verify is worse than a
   smaller one that is true. */
const STATS = [
  { to: catalogStats.courses, suffix: '', label: 'courses in the library' },
  { to: catalogStats.lessons, suffix: '', label: 'lessons written' },
  { to: catalogStats.hours, prefix: '~', suffix: 'h', label: 'of material' },
  { to: 90, prefix: '~', suffix: 's', label: 'to build your own' },
];

const STEPS = [
  { icon: PencilIcon, title: 'Tell us your goal', body: 'Type what you want to learn in one sentence, no outline, no blank page.' },
  { icon: SparklesIcon, title: 'Get a full course', body: 'AI builds the modules and writes every lesson with examples, pitfalls, and practice.' },
  { icon: PlayIcon, title: 'Learn & track', body: 'Each lesson gets the single best video, and your progress saves as you go.' },
];

const FEATURES = [
  { icon: PlayIcon, title: 'The best video, not the first', body: 'Every clip is ranked by relevance, length, and engagement, so each lesson gets the one that truly teaches it.', big: true },
  { icon: BookIcon, title: 'Genuinely deep lessons', body: 'Teaching sections, real code, common mistakes, and a hands-on practice task.' },
  { icon: TargetIcon, title: 'Progress that sticks', body: 'Check off lessons, watch the bar fill, and resume where you left off.' },
  { icon: SparklesIcon, title: 'A course in a sentence', body: 'Modules, lessons, and structure generated in one shot.' },
  { icon: LayersIcon, title: 'A growing library', body: 'Buy a single ready-made course, or unlock them all with Pro.' },
  { icon: ClockIcon, title: 'Minutes, not weeks', body: 'Skip the curation, go from idea to a structured course in ~90 seconds.' },
];

const WORKSPACE = [
  'Video, written notes, and progress, all on one screen',
  'No tab-hopping: the best video sits right beside the lesson',
  'Key takeaways, code, and common mistakes for every topic',
  'Pick up exactly where you left off, on any device',
];

const TESTIMONIALS = [
  { quote: 'I went from zero to shipping a Python script in a weekend.', name: 'Self-taught dev', initials: 'SD' },
  { quote: 'Finally understood personal finance without 12 open tabs.', name: 'New grad', initials: 'NG' },
  { quote: 'The video it picked was better than anything I’d have found myself.', name: 'Design lead', initials: 'DL' },
  { quote: 'A full course on negotiation, ready before my coffee was.', name: 'Founder', initials: 'FB' },
];

const FAQS = [
  { q: 'How does MeritFlow work?', a: 'Describe a topic in one sentence. The AI designs a full curriculum, writes each lesson with examples and practice, and finds the single best YouTube video for the lessons that need one.' },
  { q: 'Is it free to start?', a: 'Yes, you can browse the library and preview courses for free. Generating your own courses is a Pro feature, and you can also buy individual library courses one at a time.' },
  { q: 'Where do the videos come from?', a: 'Public YouTube videos, ranked by relevance, length, and engagement so each lesson gets the one best match, not just the first result.' },
  { q: 'What do I get with Pro?', a: 'Unlimited AI course generation plus full access to every course in the library, with progress tracking across all of them.' },
  { q: 'Can I buy just one course?', a: 'Absolutely. Any library course is a one-time purchase and yours forever, no subscription required.' },
  { q: 'Do I need to install anything?', a: 'No. MeritFlow runs entirely in your browser. Create an account and start in seconds.' },
];

/* ── Small motion helpers ───────────────────────────────────────────────── */
function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <m.div variants={fadeUp} initial="hidden" whileInView="show" viewport={VIEW} className={className}>
      {children}
    </m.div>
  );
}

function Counter({ to, decimals = 0, prefix = '', suffix = '' }: { to: number; decimals?: number; prefix?: string; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const reduce = useReducedMotion();
  const mv = useMotionValue(0);
  const fmt = (v: number) => (decimals ? v.toFixed(decimals) : Math.round(v).toLocaleString());
  const [val, setVal] = useState(fmt(0));
  const displayValue = reduce && inView ? fmt(to) : val;
  useEffect(() => {
    if (!inView || reduce) return;
    const controls = animate(mv, to, { duration: 1.4, ease: EASE, onUpdate: (v) => setVal(fmt(v)) });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, to, reduce]);
  return (
    <span ref={ref}>
      {prefix}
      {displayValue}
      {suffix}
    </span>
  );
}

/** The "watch it build" course-preview card — replays its assembly whenever its key changes. */
function CoursePreview({ topic }: { topic: string }) {
  return (
    <m.div
      variants={stagger}
      initial="hidden"
      animate="show"
      className="shadow-3d w-full rounded-3xl border border-line bg-surface p-4"
    >
      <m.div variants={fadeUp} className="flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-accent">Generating…</p>
          <p className="truncate text-sm font-bold text-ink">{topic}</p>
        </div>
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent">
          <SparklesIcon className="h-4 w-4" />
        </span>
      </m.div>

      <div className="mt-3 space-y-2">
        {PREVIEW_MODULES.map((mod, i) => (
          <m.div key={i} variants={fadeUp} className="flex items-center gap-2.5 rounded-xl border border-line bg-canvas/60 px-3 py-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-accent/12 text-[11px] font-bold text-accent">{i + 1}</span>
            <span className="flex-1 truncate text-[13px] font-medium text-ink/85">{mod.title}</span>
            <span className="text-[11px] text-faint">{mod.lessons} lessons</span>
          </m.div>
        ))}
      </div>

      <m.div variants={fadeUp} className="mt-3 flex items-center gap-2 rounded-xl border border-accent/20 bg-mint/60 px-3 py-2">
        <PlayIcon className="h-3.5 w-3.5 text-accent" />
        <span className="text-[12px] font-medium text-accent">Best video found for every lesson</span>
      </m.div>

      <m.div variants={fadeUp} className="mt-3">
        <div className="flex items-center justify-between text-[11px] text-faint">
          <span>Building course</span>
          <span className="font-medium text-accent">64%</span>
        </div>
        <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-line">
          <m.div initial={{ width: '0%' }} animate={{ width: '64%' }} transition={{ duration: 1.1, ease: 'easeOut', delay: 0.5 }} className="h-full rounded-full bg-gradient-to-r from-accent to-accent-2" />
        </div>
      </m.div>
    </m.div>
  );
}

function FaqAccordion() {
  const [open, setOpen] = useState(0);
  return (
    <div className="space-y-3">
      {FAQS.map((f, i) => {
        const isOpen = open === i;
        return (
          <Reveal key={i}>
            <div className={['overflow-hidden rounded-2xl border bg-elevated shadow-soft transition-colors', isOpen ? 'border-accent/30' : 'border-line'].join(' ')}>
              <button
                onClick={() => setOpen(isOpen ? -1 : i)}
                aria-expanded={isOpen}
                className="flex w-full cursor-pointer items-center justify-between gap-3 px-5 py-4 text-left text-[15px] font-semibold text-ink"
              >
                {f.q}
                <m.span animate={{ rotate: isOpen ? 45 : 0 }} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
                  +
                </m.span>
              </button>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <m.div key="a" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: 'easeOut' }} style={{ overflow: 'hidden' }}>
                    <p className="px-5 pb-4 text-[15px] leading-relaxed text-muted">{f.a}</p>
                  </m.div>
                )}
              </AnimatePresence>
            </div>
          </Reveal>
        );
      })}
    </div>
  );
}

/* ── Page ───────────────────────────────────────────────────────────────── */
export function Landing() {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [prompt, setPrompt] = useState('');
  const [focused, setFocused] = useState(false);

  // Hero scroll-linked parallax
  const heroRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const bgY = useTransform(scrollYProgress, [0, 1], ['0%', '28%']);
  const bgOpacity = useTransform(scrollYProgress, [0, 0.85], [1, 0]);

  // Magnetic submit button
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 200, damping: 15 });
  const sy = useSpring(my, { stiffness: 200, damping: 15 });

  // Auto-typing placeholder
  const typingActive = !focused && prompt === '';
  const [typed, setTyped] = useState('');
  useEffect(() => {
    if (reduce || !typingActive) return;
    let li = 0;
    let ch = 0;
    let dir = 1;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const full = HERO_PROMPTS[li];
      ch += dir;
      setTyped(full.slice(0, ch));
      let delay = dir > 0 ? 45 : 22;
      if (ch >= full.length) {
        dir = -1;
        delay = 1600;
      } else if (ch <= 0) {
        dir = 1;
        li = (li + 1) % HERO_PROMPTS.length;
        delay = 420;
      }
      timer = setTimeout(tick, delay);
    };
    timer = setTimeout(tick, 600);
    return () => clearTimeout(timer);
  }, [reduce, typingActive]);

  const placeholder = typingActive
    ? reduce
      ? 'Ask MeritFlow to build a course on machine learning…'
      : `${typed}▍`
    : 'Ask MeritFlow to build a course on…';

  // Interactive demo
  const [demoTopic, setDemoTopic] = useState('Machine learning');
  const [demoKey, setDemoKey] = useState(0);

  function start() {
    const t = prompt.trim();
    if (t) {
      try {
        sessionStorage.setItem('courseai_prompt', t);
      } catch {
        /* ignore */
      }
    }
    router.push('/login');
  }
  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      start();
    }
  }
  function magnetMove(e: MouseEvent<HTMLButtonElement>) {
    if (reduce) return;
    const r = e.currentTarget.getBoundingClientRect();
    mx.set((e.clientX - (r.left + r.width / 2)) * 0.35);
    my.set((e.clientY - (r.top + r.height / 2)) * 0.35);
  }
  function magnetLeave() {
    mx.set(0);
    my.set(0);
  }

  return (
    <LazyMotion features={domMax} strict>
      <MotionConfig reducedMotion="user">
        <div className="min-h-screen overflow-x-hidden">
          <SiteNav />

          {/* ── Hero. Lovable-style full-screen animated mesh ── */}
          <m.section ref={heroRef} id="top" className="relative flex min-h-[94vh] flex-col items-center justify-center overflow-hidden px-4 pb-20 pt-10 text-center">
            <m.div style={{ y: bgY, opacity: bgOpacity }} aria-hidden className="lovable-hero pointer-events-none absolute inset-0 -z-10">
              <div className="absolute inset-0 overflow-hidden">
                <div className="drift-a absolute -left-[12%] -top-[6%] h-[48vw] w-[48vw] rounded-full bg-[#2563eb] opacity-[0.12] blur-[58px]" />
                <div className="drift-b absolute -right-[10%] -top-[8%] h-[46vw] w-[46vw] rounded-full bg-[#6366f1] opacity-[0.12] blur-[58px]" />
                <div className="drift-c absolute left-[18%] top-[26%] h-[42vw] w-[42vw] rounded-full bg-[#3b82f6] opacity-[0.10] blur-[62px]" />
                <div className="drift-a absolute -bottom-[14%] -left-[8%] h-[48vw] w-[48vw] rounded-full bg-[#818cf8] opacity-[0.12] blur-[58px]" style={{ animationDelay: '-6s' }} />
                <div className="drift-b absolute -bottom-[18%] left-1/2 h-[52vw] w-[52vw] -translate-x-1/2 rounded-full bg-[#1d4ed8] opacity-[0.11] blur-[58px]" style={{ animationDelay: '-9s' }} />
                <div className="drift-c absolute -bottom-[12%] -right-[10%] h-[46vw] w-[46vw] rounded-full bg-[#2563eb] opacity-[0.10] blur-[62px]" style={{ animationDelay: '-4s' }} />
                <div className="absolute left-1/2 top-[20%] h-[40vw] w-[60vw] -translate-x-1/2 rounded-full bg-[#dbeafe] opacity-[0.6] blur-[80px]" />
              </div>
            </m.div>

            {/* Two columns on desktop: the words and the box that converts on
                the left, the visual carrying the idea on the right. Stacked on
                mobile, where a side-by-side would shrink both to nothing. */}
            <div className="relative mx-auto grid w-full max-w-6xl items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)] lg:gap-14">
            <m.div variants={heroContainer} initial="hidden" animate="show" className="relative mx-auto w-full max-w-3xl lg:mx-0 lg:text-left">
              <m.h1 variants={heroItem} className="text-[2.75rem] font-extrabold leading-[1.04] tracking-tight text-ink sm:text-6xl">
                Turn any document into a course you can teach from
              </m.h1>
              <m.p variants={heroItem} className="mx-auto mt-5 max-w-lg text-lg text-ink/55 sm:text-xl lg:mx-0">
                Upload a PDF or name a topic. MeritFlow writes the lessons, builds the quizzes and flashcards, and hands
                you a gradebook, a roster and the analytics to run the class.
              </m.p>

              <m.div variants={heroItem} className="mx-auto mt-9 w-full max-w-2xl">
                <div className="elev-3 rounded-[28px] border border-line bg-elevated p-3 text-left">
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    onKeyDown={onKeyDown}
                    rows={3}
                    placeholder={placeholder}
                    className="w-full resize-none bg-transparent px-3 pt-2 text-[16px] text-ink placeholder:text-ink/40 focus:outline-none"
                  />
                  <div className="flex items-center justify-between gap-3 px-1.5 pb-0.5 pt-1">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full border border-line text-ink/50">
                      <PlusIcon className="h-4 w-4" />
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center gap-1 text-sm font-medium text-ink/55">
                        Build <span className="text-[10px]">▾</span>
                      </span>
                      <MicIcon className="h-5 w-5 text-ink/50" />
                      <m.button
                        onClick={start}
                        onMouseMove={magnetMove}
                        onMouseLeave={magnetLeave}
                        whileTap={{ scale: 0.94 }}
                        style={{ x: sx, y: sy }}
                        aria-label="Build course"
                        className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-fill text-canvas transition-all hover:brightness-110"
                      >
                        <ArrowRightIcon className="h-4 w-4 -rotate-90" />
                      </m.button>
                    </div>
                  </div>
                </div>
                <p className="mt-4 text-xs text-ink/45">Free to start · No credit card · ~90 seconds to your first course</p>
              </m.div>
            </m.div>

              <m.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.25, ease: EASE }}
                className="hidden lg:block"
              >
                <HeroVisual />
              </m.div>
            </div>
          </m.section>

          {/* ── What this actually is ── */}
          <section className="border-t border-line px-4 py-16 sm:px-6">
            <div className="mx-auto max-w-5xl">
              <Reveal className="text-center">
                <span className="eyebrow">How it works</span>
                <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
                  From a file to a running class
                </h2>
                <p className="mx-auto mt-3 max-w-2xl text-ink/55">
                  Not a chatbot bolted onto a course player. A pipeline that plans, writes and assesses, then keeps
                  running once real students are in it.
                </p>
              </Reveal>
              <Reveal className="mt-10 overflow-x-auto">
                <div className="min-w-[680px]">
                  <PipelineDiagram />
                </div>
              </Reveal>
            </div>
          </section>

          {/* ── Trust / stats band ── */}
          <section className="border-y border-line bg-surface/60 py-12">
            <div className="mx-auto max-w-5xl px-4 sm:px-6">
              <Reveal className="text-center">
                <p className="text-xs font-semibold uppercase tracking-wider text-faint">Trusted by curious people everywhere</p>
              </Reveal>
              <div className="mx-auto mt-4 h-px max-w-xs origin-left bg-line draw-line" />
              <m.div variants={stagger} initial="hidden" whileInView="show" viewport={VIEW} className="mt-8 grid grid-cols-2 gap-6 sm:grid-cols-4">
                {STATS.map((s) => (
                  <m.div key={s.label} variants={fadeUp} className="text-center">
                    <p className="text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
                      <Counter to={s.to} prefix={s.prefix} suffix={s.suffix} />
                    </p>
                    <p className="mt-1 text-sm text-muted">{s.label}</p>
                  </m.div>
                ))}
              </m.div>
              <Reveal className="mx-auto mt-7 max-w-lg text-center text-sm text-muted">
                From Python to public speaking, if you can name it, MeritFlow can teach it.
              </Reveal>
            </div>
          </section>

          {/* ── How it works ── */}
          <section id="how" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-20 sm:px-6">
            <Reveal className="text-center">
              <h2 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">From idea to course in three steps</h2>
              <p className="mx-auto mt-3 max-w-lg text-muted">Describe it once and start learning, no outlines, no busywork.</p>
            </Reveal>
            <m.div variants={stagger} initial="hidden" whileInView="show" viewport={VIEW} className="mt-12 grid gap-5 md:grid-cols-3">
              {STEPS.map((step, i) => {
                const Icon = step.icon;
                return (
                  <m.div key={step.title} variants={fadeUp} whileHover={reduce ? undefined : { y: -6, transition: { type: 'spring', stiffness: 300, damping: 22 } }} className="lift relative rounded-3xl border border-line bg-elevated p-7 shadow-soft">
                    <span className="absolute right-6 top-5 text-5xl font-extrabold text-accent/[0.08]">{i + 1}</span>
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10 text-accent">
                      <Icon className="h-6 w-6" />
                    </span>
                    <h3 className="mt-5 text-lg font-semibold text-ink">{step.title}</h3>
                    <p className="mt-2 text-[15px] leading-relaxed text-muted">{step.body}</p>
                  </m.div>
                );
              })}
            </m.div>
          </section>

          {/* ── Interactive demo ── */}
          <section className="bg-surface/60 py-20">
            <div className="mx-auto max-w-6xl px-4 sm:px-6">
              <div className="grid items-center gap-10 lg:grid-cols-2">
                <Reveal>
                  <span className="inline-flex items-center rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">See it think</span>
                  <h2 className="mt-4 text-3xl font-bold tracking-tight text-ink sm:text-4xl">Watch a course build, line by line.</h2>
                  <p className="mt-3 text-muted">Pick a topic and watch MeritFlow assemble a real curriculum in seconds, modules, lessons, and the right video in every place.</p>
                  <div className="mt-6 flex flex-wrap gap-2">
                    {DEMO_TOPICS.map((t) => (
                      <button
                        key={t}
                        onClick={() => {
                          setDemoTopic(t);
                          setDemoKey((k) => k + 1);
                        }}
                        className={[
                          'cursor-pointer rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors',
                          demoTopic === t ? 'border-accent bg-accent text-canvas' : 'border-line bg-elevated text-muted hover:border-accent/40 hover:text-ink',
                        ].join(' ')}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </Reveal>
                <Reveal className="mx-auto w-full max-w-md">
                  <AnimatePresence mode="wait">
                    <m.div key={`${demoTopic}-${demoKey}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                      <CoursePreview topic={demoTopic} />
                    </m.div>
                  </AnimatePresence>
                </Reveal>
              </div>
            </div>
          </section>

          {/* ── Topics marquee ── */}
          <section className="overflow-hidden py-14">
            <p className="mb-6 text-center text-xs font-semibold uppercase tracking-wider text-faint">Build a course on anything</p>
            <div className="relative flex overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_12%,#000_88%,transparent)]">
              <div className="marquee flex shrink-0 items-center gap-3 pr-3">
                {[...TOPICS, ...TOPICS].map((t, i) => (
                  <span key={i} className="rounded-full border border-line bg-elevated px-4 py-2 text-sm text-muted shadow-soft transition-colors hover:bg-mint hover:text-accent">{t}</span>
                ))}
              </div>
            </div>
            <div className="relative mt-3 flex overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_12%,#000_88%,transparent)]">
              <div className="marquee-rev flex shrink-0 items-center gap-3 pr-3">
                {[...TOPICS.slice().reverse(), ...TOPICS.slice().reverse()].map((t, i) => (
                  <span key={i} className="rounded-full border border-line bg-elevated px-4 py-2 text-sm text-muted shadow-soft transition-colors hover:bg-mint hover:text-accent">{t}</span>
                ))}
              </div>
            </div>
          </section>

          {/* ── Proof: the live intelligence panel ──
              Moved down from above the hero. It is 1,280px of dashboard, and
              sitting first it meant a visitor's whole first screen was metrics
              for a product they had not yet been told about. It reads as proof
              once the claim has been made, and as noise before. */}
          <PublicDashboardWidget />

          {/* ── Bento features ── */}
          <section id="features" className="scroll-mt-24 bg-surface/60 py-20">
            <div className="mx-auto max-w-6xl px-4 sm:px-6">
              <Reveal className="max-w-2xl">
                <h2 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">Built like a course should be</h2>
                <p className="mt-3 text-muted">Depth, the right video in the right place, and progress that actually sticks.</p>
              </Reveal>
              <m.div variants={stagger} initial="hidden" whileInView="show" viewport={VIEW} className="mt-12 grid gap-4 md:grid-cols-3">
                {FEATURES.map((f) => {
                  const Icon = f.icon;
                  return (
                    <m.div key={f.title} variants={fadeUp} whileHover={reduce ? undefined : { y: -6, transition: { type: 'spring', stiffness: 300, damping: 22 } }} className={['sheen lift rounded-3xl border border-line bg-elevated p-7 shadow-soft', f.big ? 'md:col-span-2' : ''].join(' ')}>
                      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10 text-accent">
                        <Icon className="h-6 w-6" />
                      </span>
                      <h3 className="mt-5 text-lg font-semibold text-ink">{f.title}</h3>
                      <p className="mt-2 text-[15px] leading-relaxed text-muted">{f.body}</p>
                    </m.div>
                  );
                })}
              </m.div>
            </div>
          </section>

          {/* ── Learner workspace ── */}
          <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <div className="grid items-center gap-10 lg:grid-cols-2">
              <Reveal>
                <span className="inline-flex items-center rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">For learners</span>
                <h2 className="mt-4 text-3xl font-bold tracking-tight text-ink sm:text-4xl">An experience you actually love</h2>
                <p className="mt-3 text-muted">Everything you need to learn a topic lives on one focused screen, no tab-hopping, no distractions.</p>
                <ul className="mt-6 space-y-3">
                  {WORKSPACE.map((w) => (
                    <li key={w} className="flex items-start gap-2.5 text-[15px] text-ink/80">
                      <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-accent" /> {w}
                    </li>
                  ))}
                </ul>
              </Reveal>
              <Reveal>
                <div className="grid grid-cols-3 gap-3 rounded-3xl border border-line bg-elevated p-4 shadow-3d">
                  <div className="col-span-2 rounded-2xl border border-line bg-surface p-3">
                    <div className="relative aspect-video w-full overflow-hidden rounded-xl">
                      <div className="aurora absolute inset-0" />
                      <span className="absolute left-1/2 top-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-elevated text-accent shadow"><PlayIcon className="h-4 w-4" /></span>
                    </div>
                    <p className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-faint">Video</p>
                  </div>
                  <div className="rounded-2xl border border-line bg-surface p-3">
                    <div className="space-y-1.5">
                      <div className="h-2 w-full rounded bg-line" />
                      <div className="h-2 w-5/6 rounded bg-line" />
                      <div className="h-2 w-2/3 rounded bg-line" />
                      <div className="h-2 w-4/5 rounded bg-line" />
                    </div>
                    <p className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-faint">Notes</p>
                  </div>
                  <div className="col-span-3 rounded-2xl border border-line bg-surface p-3">
                    <div className="flex items-center justify-between text-[11px] text-faint">
                      <span>Progress</span>
                      <span className="text-accent">62%</span>
                    </div>
                    <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-line">
                      <m.div initial={{ width: '0%' }} whileInView={{ width: '62%' }} viewport={{ once: true }} transition={{ duration: 1, ease: 'easeOut', delay: 0.2 }} className="h-full rounded-full bg-gradient-to-r from-accent to-accent-2" />
                    </div>
                  </div>
                </div>
              </Reveal>
            </div>
          </section>

          {/* ── Showcase ── */}
          <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
            <Reveal>
              <h2 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">See what it makes</h2>
              <p className="mt-3 max-w-lg text-muted">Real courses MeritFlow generated, a focused video in every lesson.</p>
            </Reveal>
            <m.div variants={stagger} initial="hidden" whileInView="show" viewport={VIEW} className="mt-10 grid gap-5 sm:grid-cols-2">
              {sampleCourses.map((c, i) => {
                const lessons = c.modules.reduce((n, mod) => n + mod.lessons.length, 0);
                const videos = c.modules.reduce((n, mod) => n + mod.lessons.filter((l) => l.video).length, 0);
                return (
                  <m.a key={i} href="/login" variants={fadeUp} whileHover={reduce ? undefined : { y: -6, transition: { type: 'spring', stiffness: 300, damping: 22 } }} className="sheen lift group rounded-3xl border border-line bg-elevated p-6 shadow-soft">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center rounded-full bg-mint px-2.5 py-1 text-[11px] font-semibold text-accent">{c.level}</span>
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface text-faint transition-colors group-hover:bg-accent-fill group-hover:text-canvas">
                        <ArrowRightIcon className="h-4 w-4" />
                      </span>
                    </div>
                    <h3 className="mt-4 text-xl font-bold text-ink">{c.title}</h3>
                    <p className="mt-1 text-sm text-muted">{c.subtitle}</p>
                    <p className="mt-5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-faint">
                      <span>{c.modules.length} modules</span>
                      <span>·</span>
                      <span>{lessons} lessons</span>
                      <span>·</span>
                      <span className="inline-flex items-center gap-1 text-accent"><PlayIcon className="h-3 w-3" /> {videos} videos</span>
                    </p>
                  </m.a>
                );
              })}
            </m.div>
          </section>

          {/* ── Testimonials ── */}
          <section className="bg-surface/60 py-20">
            <div className="mx-auto max-w-6xl px-4 sm:px-6">
              <Reveal className="text-center">
                <h2 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">Loved by people learning everything</h2>
              </Reveal>
              <m.div variants={stagger} initial="hidden" whileInView="show" viewport={VIEW} className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {TESTIMONIALS.map((t) => (
                  <m.div key={t.name} variants={fadeUp} className="flex flex-col rounded-3xl border border-line bg-elevated p-6 shadow-soft">
                    <div className="flex gap-0.5 text-accent">{'★★★★★'.split('').map((s, i) => <span key={i}>{s}</span>)}</div>
                    <p className="mt-3 flex-1 text-[15px] leading-relaxed text-ink/85">“{t.quote}”</p>
                    <div className="mt-4 flex items-center gap-2.5">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-mint text-xs font-bold text-accent">{t.initials}</span>
                      <span className="text-sm font-medium text-muted">{t.name}</span>
                    </div>
                  </m.div>
                ))}
              </m.div>
            </div>
          </section>

          {/* ── Pricing ── */}
          <section id="pricing" className="scroll-mt-24 py-20">
            <div className="mx-auto max-w-5xl px-4 sm:px-6">
              <Reveal className="text-center">
                <h2 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">Start free. Scale when ready.</h2>
                <p className="mx-auto mt-3 max-w-lg text-muted">Buy a single course, or go Pro to generate unlimited courses and unlock the whole library.</p>
              </Reveal>
              <Reveal className="mt-12">
                <PricingPlans loggedIn={false} isPro={false} plan={null} />
              </Reveal>
            </div>
          </section>

          {/* ── FAQ ── */}
          <section id="faq" className="mx-auto max-w-3xl scroll-mt-24 px-4 py-20 sm:px-6">
            <Reveal className="text-center">
              <h2 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">Got questions? We&rsquo;ve got answers.</h2>
            </Reveal>
            <div className="mt-10">
              <FaqAccordion />
            </div>
          </section>

          {/* ── Final CTA ── */}
          <section className="px-4 pb-24 sm:px-6">
            <Reveal className="relative mx-auto max-w-5xl overflow-hidden rounded-[32px] border border-line px-8 py-16 text-center shadow-3d">
              <div className="aurora absolute inset-0 -z-10" />
              <h2 className="text-3xl font-extrabold tracking-tight text-ink sm:text-5xl">
                Learn anything. <span className="text-aurora">Starting now.</span>
              </h2>
              <p className="mx-auto mt-4 max-w-md text-muted">Free to start. Describe what you want to learn and watch the full course appear.</p>
              <m.a
                href="/login"
                whileHover={reduce ? undefined : { scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                className="glow-accent mt-8 inline-flex items-center gap-2 rounded-xl bg-accent-fill px-7 py-3.5 text-sm font-bold text-canvas"
              >
                Get started, it&rsquo;s free <ArrowRightIcon className="h-4 w-4" />
              </m.a>
            </Reveal>
          </section>

          <SiteFooter />
        </div>
      </MotionConfig>
    </LazyMotion>
  );
}
