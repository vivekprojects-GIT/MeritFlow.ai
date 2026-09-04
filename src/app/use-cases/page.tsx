import Link from 'next/link';
import { MarketingShell } from '@/components/marketing-shell';
import { ArrowRightIcon, BookIcon, LayersIcon, PlayIcon, TargetIcon } from '@/components/icons';

export const metadata = { title: 'Use cases. MeritFlow' };

const CASES = [
  { icon: BookIcon, title: 'Students', body: 'Turn any syllabus topic into a guided course with the best explainer videos and practice for each idea.', eg: 'A crash course on organic chemistry reactions' },
  { icon: PlayIcon, title: 'Self-learners', body: 'Pick up a new hobby or skill with a structured path instead of a pile of random tutorials.', eg: 'Learn watercolor painting from scratch' },
  { icon: TargetIcon, title: 'Professionals', body: 'Upskill for your role with focused, practical courses you can finish on a lunch break.', eg: 'SQL for product managers, with exercises' },
  { icon: LayersIcon, title: 'Teams', body: 'Spin up shared onboarding and skill courses so everyone learns the same thing, fast.', eg: 'Onboarding: our data stack in 6 lessons' },
];

export default function UseCasesPage() {
  return (
    <MarketingShell>
      <section className="relative overflow-hidden px-4 pb-12 pt-16 sm:px-6 sm:pt-24">
        <div className="dot-grid pointer-events-none absolute inset-0 -z-10" />
        <div className="reveal mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">Use cases</span>
          <h1 className="mt-4 text-4xl font-extrabold leading-[1.05] tracking-tight text-ink sm:text-6xl">
            Built for the way <span className="text-aurora">you learn</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-muted">
            Whatever you&rsquo;re trying to master, MeritFlow turns it into a clear path, from a single sentence to a finished course.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <div className="grid gap-5 sm:grid-cols-2">
          {CASES.map((c, i) => {
            const Icon = c.icon;
            return (
              <div key={c.title} className="reveal lift glass rounded-3xl p-7" style={{ transitionDelay: `${i * 70}ms` }}>
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10 text-accent">
                  <Icon className="h-6 w-6" />
                </span>
                <h3 className="mt-5 text-xl font-bold text-ink">{c.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-muted">{c.body}</p>
                <p className="mt-4 rounded-xl border border-line bg-surface px-3 py-2 text-sm text-muted">
                  <span className="text-faint">e.g.</span> &ldquo;{c.eg}&rdquo;
                </p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="px-4 pb-24 sm:px-6">
        <div className="reveal relative mx-auto max-w-5xl overflow-hidden rounded-[32px] border border-line px-8 py-16 text-center shadow-3d">
          <div className="aurora absolute inset-0 -z-10" />
          <h2 className="text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">What do you want to learn?</h2>
          <p className="mx-auto mt-3 max-w-md text-muted">Describe it in a sentence and get a full course in minutes.</p>
          <Link href="/login" className="glow-accent mt-8 inline-flex items-center gap-2 rounded-full bg-accent px-7 py-3.5 text-sm font-bold text-canvas transition-transform hover:scale-[1.03]">
            Get started free <ArrowRightIcon className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </MarketingShell>
  );
}
