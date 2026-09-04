import Link from 'next/link';
import { MarketingShell } from '@/components/marketing-shell';
import { ArrowRightIcon, BookIcon, LightbulbIcon, PlayIcon, SparklesIcon } from '@/components/icons';

export const metadata = { title: 'Resources. MeritFlow' };

const RESOURCES = [
  { icon: SparklesIcon, title: 'Getting started', body: 'Create an account, describe a topic, and generate your first course in minutes.', href: '/login' },
  { icon: PlayIcon, title: 'How it works', body: 'See how MeritFlow builds a curriculum and finds the best video for each lesson.', href: '/product' },
  { icon: LightbulbIcon, title: 'FAQ', body: 'Answers about pricing, videos, Pro, and single-course purchases.', href: '/#faq' },
  { icon: BookIcon, title: 'Use cases', body: 'Ideas for students, self-learners, professionals, and teams.', href: '/use-cases' },
];

const FAQS = [
  { q: 'How does MeritFlow work?', a: 'Describe a topic in one sentence. The AI designs a curriculum, writes each lesson with examples and practice, and finds the single best video for the lessons that need one.' },
  { q: 'Is it free to start?', a: 'Yes, browse and preview courses free. Generating your own is a Pro feature, and you can also buy individual library courses.' },
  { q: 'Where do the videos come from?', a: 'Public YouTube videos, ranked by relevance, length, and engagement so each lesson gets the one best match.' },
  { q: 'What do I get with Pro?', a: 'Unlimited AI course generation plus full access to the entire library, with progress tracking across all of it.' },
];

export default function ResourcesPage() {
  return (
    <MarketingShell>
      <section className="relative overflow-hidden px-4 pb-12 pt-16 sm:px-6 sm:pt-24">
        <div className="dot-grid pointer-events-none absolute inset-0 -z-10" />
        <div className="reveal mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">Resources</span>
          <h1 className="mt-4 text-4xl font-extrabold leading-[1.05] tracking-tight text-ink sm:text-6xl">
            Everything to <span className="text-aurora">get going</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-muted">Guides, answers, and ideas to help you build and finish great courses.</p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-5 sm:grid-cols-2">
          {RESOURCES.map((r, i) => {
            const Icon = r.icon;
            return (
              <Link key={r.title} href={r.href} className="reveal lift group glass rounded-3xl p-7" style={{ transitionDelay: `${i * 70}ms` }}>
                <div className="flex items-center justify-between">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10 text-accent">
                    <Icon className="h-6 w-6" />
                  </span>
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface text-faint transition-colors group-hover:bg-accent group-hover:text-canvas">
                    <ArrowRightIcon className="h-4 w-4" />
                  </span>
                </div>
                <h3 className="mt-5 text-lg font-semibold text-ink">{r.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-muted">{r.body}</p>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 pb-24 sm:px-6">
        <h2 className="reveal text-center text-2xl font-bold tracking-tight text-ink sm:text-3xl">Frequently asked</h2>
        <div className="reveal mt-8 space-y-3">
          {FAQS.map((f, i) => (
            <details key={i} className="group glass rounded-2xl px-5 py-4" open={i === 0}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[15px] font-semibold text-ink">
                {f.q}
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 text-[15px] leading-relaxed text-muted">{f.a}</p>
            </details>
          ))}
        </div>
      </section>
    </MarketingShell>
  );
}
