import Link from 'next/link';
import { MarketingShell } from '@/components/marketing-shell';
import { ArrowRightIcon, CheckIcon, LayersIcon, SparklesIcon, TargetIcon, UserIcon } from '@/components/icons';

export const metadata = { title: 'Enterprise. MeritFlow' };

const BENEFITS = [
  { icon: SparklesIcon, title: 'Bulk course generation', body: 'Stand up onboarding and skills courses for your whole org from a list of topics.' },
  { icon: LayersIcon, title: 'A shared library', body: 'A central, branded catalog your team can browse, take, and reuse.' },
  { icon: TargetIcon, title: 'Progress & completion', body: 'See who has finished what across learners, teams, and programs.' },
  { icon: UserIcon, title: 'Admin & SSO', body: 'Roles, seat management, and single sign-on, available on request.' },
];

export default function EnterprisePage() {
  return (
    <MarketingShell>
      <section className="relative overflow-hidden px-4 pb-12 pt-16 sm:px-6 sm:pt-24">
        <div className="dot-grid pointer-events-none absolute inset-0 -z-10" />
        <div className="reveal mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">Enterprise</span>
          <h1 className="mt-4 text-4xl font-extrabold leading-[1.05] tracking-tight text-ink sm:text-6xl">
            MeritFlow for <span className="text-aurora">teams</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-muted">
            Bring AI course generation to your whole organization, onboarding, upskilling, and internal knowledge, built in minutes.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <a href="mailto:hello@courseai.app?subject=MeritFlow%20for%20our%20team" className="glow-accent inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-canvas transition-all hover:brightness-110">
              Talk to us <ArrowRightIcon className="h-4 w-4" />
            </a>
            <Link href="/login" className="inline-flex items-center gap-2 rounded-full border border-line bg-elevated px-6 py-3 text-sm font-semibold text-ink shadow-soft transition-colors hover:border-accent/40">
              Try it yourself
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-5 sm:grid-cols-2">
          {BENEFITS.map((b, i) => {
            const Icon = b.icon;
            return (
              <div key={b.title} className="reveal lift glass rounded-3xl p-7" style={{ transitionDelay: `${i * 70}ms` }}>
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10 text-accent">
                  <Icon className="h-6 w-6" />
                </span>
                <h3 className="mt-5 text-lg font-semibold text-ink">{b.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-muted">{b.body}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <div className="reveal glass rounded-3xl p-8 shadow-soft sm:p-12">
          <h2 className="text-2xl font-bold tracking-tight text-ink">Why teams choose MeritFlow</h2>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2">
            {['Cut course-prep time from weeks to minutes', 'Consistent, structured learning for everyone', 'The best video in every lesson, automatically', 'Pay per course or per seat, your call'].map((t) => (
              <li key={t} className="flex items-start gap-2.5 text-[15px] text-ink/80">
                <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-accent" /> {t}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="px-4 pb-24 sm:px-6">
        <div className="reveal relative mx-auto max-w-5xl overflow-hidden rounded-[32px] border border-line px-8 py-16 text-center shadow-3d">
          <div className="aurora absolute inset-0 -z-10" />
          <h2 className="text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">Let&rsquo;s bring MeritFlow to your org</h2>
          <p className="mx-auto mt-3 max-w-md text-muted">Tell us about your team and we&rsquo;ll help you get started.</p>
          <a href="mailto:hello@courseai.app?subject=MeritFlow%20for%20our%20team" className="glow-accent mt-8 inline-flex items-center gap-2 rounded-full bg-accent px-7 py-3.5 text-sm font-bold text-canvas transition-transform hover:scale-[1.03]">
            Talk to us <ArrowRightIcon className="h-4 w-4" />
          </a>
        </div>
      </section>
    </MarketingShell>
  );
}
