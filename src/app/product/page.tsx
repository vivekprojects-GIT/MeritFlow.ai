import Link from 'next/link';
import { MarketingShell } from '@/components/marketing-shell';
import { ArrowRightIcon, BookIcon, CheckIcon, ClockIcon, LayersIcon, PlayIcon, SparklesIcon, TargetIcon } from '@/components/icons';

export const metadata = { title: 'Product. MeritFlow' };

const FEATURES = [
  { icon: SparklesIcon, title: 'One-sentence generation', body: 'Describe a topic and get a complete, well-ordered course, modules and lessons, in one shot.' },
  { icon: PlayIcon, title: 'Best-match video per lesson', body: 'We search and rank YouTube by relevance, length, and engagement to embed the single best video where it helps.' },
  { icon: BookIcon, title: 'Lessons with real depth', body: 'Teaching sections, worked examples, real code, common mistakes, and a hands-on practice task.' },
  { icon: TargetIcon, title: 'Progress tracking', body: 'Mark lessons complete, watch your progress bar fill, and resume exactly where you left off.' },
  { icon: LayersIcon, title: 'A growing library', body: 'Buy a single ready-made course, or unlock the whole library with Pro.' },
  { icon: ClockIcon, title: 'Minutes, not weeks', body: 'Skip the curation, go from idea to a structured course in a couple of minutes.' },
];

export default function ProductPage() {
  return (
    <MarketingShell>
      <section className="relative overflow-hidden px-4 pb-12 pt-16 sm:px-6 sm:pt-24">
        <div className="dot-grid pointer-events-none absolute inset-0 -z-10" />
        <div className="reveal mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">Product</span>
          <h1 className="mt-4 text-4xl font-extrabold leading-[1.05] tracking-tight text-ink sm:text-6xl">
            The AI that builds your <span className="text-aurora">course</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-muted">
            MeritFlow turns a single sentence into a full, structured course, written lessons, the best video for each topic, and progress that follows you.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/login" className="glow-accent inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-canvas transition-all hover:brightness-110">
              Get started free <ArrowRightIcon className="h-4 w-4" />
            </Link>
            <Link href="/pricing" className="inline-flex items-center gap-2 rounded-full border border-line bg-elevated px-6 py-3 text-sm font-semibold text-ink shadow-soft transition-colors hover:border-accent/40">
              See pricing
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="grid gap-4 md:grid-cols-3">
          {FEATURES.map((f, i) => {
            const Icon = f.icon;
            return (
              <div key={f.title} className="reveal lift glass rounded-3xl p-7" style={{ transitionDelay: `${i * 60}ms` }}>
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10 text-accent">
                  <Icon className="h-6 w-6" />
                </span>
                <h3 className="mt-5 text-lg font-semibold text-ink">{f.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-muted">{f.body}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <div className="reveal glass grid items-center gap-8 rounded-3xl p-8 shadow-soft lg:grid-cols-2 lg:p-12">
          <div>
            <span className="inline-flex items-center rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">Why it&rsquo;s different</span>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-ink">Not the first video, the best one</h2>
            <p className="mt-3 text-muted">
              Most tools paste in the top search result. MeritFlow pulls the strongest candidates and ranks them on relevance, length, and engagement, then embeds the single best fit for that exact lesson.
            </p>
            <ul className="mt-5 space-y-2.5">
              {['Ranked, not random', 'Right length for one lesson', 'Only where a video actually helps'].map((t) => (
                <li key={t} className="flex items-start gap-2.5 text-[15px] text-ink/80">
                  <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-accent" /> {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-line bg-surface p-4">
            <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-elevated">
              <div className="aurora absolute inset-0 opacity-70" />
              <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-semibold text-accent shadow-soft">
                <PlayIcon className="h-2.5 w-2.5" /> Best-match video
              </span>
              <span className="absolute left-1/2 top-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-accent shadow-lg">
                <PlayIcon className="h-5 w-5" />
              </span>
            </div>
          </div>
        </div>
      </section>

      <CtaBand />
    </MarketingShell>
  );
}

function CtaBand() {
  return (
    <section className="px-4 pb-24 sm:px-6">
      <div className="reveal relative mx-auto max-w-5xl overflow-hidden rounded-[32px] border border-line px-8 py-16 text-center shadow-3d">
        <div className="aurora absolute inset-0 -z-10" />
        <h2 className="text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">Start building your first course</h2>
        <p className="mx-auto mt-3 max-w-md text-muted">Free to start. Describe what you want to learn and watch the full course appear.</p>
        <Link href="/login" className="glow-accent mt-8 inline-flex items-center gap-2 rounded-full bg-accent px-7 py-3.5 text-sm font-bold text-canvas transition-transform hover:scale-[1.03]">
          Get started free <ArrowRightIcon className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}
