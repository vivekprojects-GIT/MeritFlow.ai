'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PRO_MONTHLY, PRO_YEARLY, SINGLE_COURSE_PRICE } from '@/lib/library';
import { ArrowRightIcon, CheckIcon, SparklesIcon } from './icons';

const PRO_FEATURES = [
  'Unlimited AI course generation',
  'Full access to the entire course library',
  'Best-match video in every lesson',
  'Progress tracking across all courses',
  'Cancel anytime',
];

const FREE_FEATURES = ['Browse the whole library', 'Preview any course (first lesson free)', 'Buy single courses forever'];

export function PricingPlans({
  loggedIn,
  isPro,
  plan,
}: {
  loggedIn: boolean;
  isPro: boolean;
  plan: string | null;
}) {
  const router = useRouter();
  const [cycle, setCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [busy, setBusy] = useState<string | null>(null);

  async function goPro() {
    if (!loggedIn) {
      router.push('/login');
      return;
    }
    const p = cycle === 'yearly' ? 'pro_yearly' : 'pro_monthly';
    setBusy('pro');
    try {
      const res = await fetch('/api/billing/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: p }),
      });
      if (res.ok) {
        router.push('/');
        router.refresh();
      }
    } finally {
      setBusy(null);
    }
  }

  async function cancel() {
    setBusy('cancel');
    try {
      await fetch('/api/billing/cancel', { method: 'POST' });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  const proPrice = cycle === 'yearly' ? PRO_YEARLY : PRO_MONTHLY;
  const proUnit = cycle === 'yearly' ? '/year' : '/month';

  return (
    <div>
      {/* Billing cycle toggle */}
      <div className="mx-auto flex w-fit items-center gap-1 rounded-full border border-line bg-surface p-1 shadow-soft">
        <button
          onClick={() => setCycle('monthly')}
          className={[
            'cursor-pointer rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
            cycle === 'monthly' ? 'bg-accent text-canvas' : 'text-muted hover:text-ink',
          ].join(' ')}
        >
          Monthly
        </button>
        <button
          onClick={() => setCycle('yearly')}
          className={[
            'cursor-pointer rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
            cycle === 'yearly' ? 'bg-accent text-canvas' : 'text-muted hover:text-ink',
          ].join(' ')}
        >
          Yearly
          <span className="ml-1.5 rounded-full bg-accent/10 px-1.5 py-0.5 text-[10px] font-semibold text-accent">
            Save 35%
          </span>
        </button>
      </div>

      <div className="mx-auto mt-10 grid max-w-4xl items-start gap-6 md:grid-cols-2">
        {/* Free */}
        <div className="rounded-3xl border border-line bg-surface p-8 shadow-soft">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-faint">Free</h3>
          <p className="mt-3 text-4xl font-extrabold tracking-tight text-ink">
            $0<span className="text-base font-medium text-faint">/forever</span>
          </p>
          <p className="mt-2 text-sm text-muted">Explore courses and buy the ones you want, one at a time.</p>
          <ul className="mt-6 space-y-3">
            {FREE_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2.5 text-[15px] text-ink/80">
                <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                {f}
              </li>
            ))}
          </ul>
          <button
            onClick={() => router.push(loggedIn ? '/' : '/login')}
            className="mt-8 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-full border border-line px-5 py-3 text-sm font-semibold text-ink transition-colors hover:border-accent/40"
          >
            {loggedIn ? 'Browse the library' : 'Get started free'}
          </button>
        </div>

        {/* Pro */}
        <div className="shadow-3d relative rounded-3xl border-2 border-accent bg-surface p-8">
          <span className="absolute -top-3 left-8 inline-flex items-center gap-1 rounded-full bg-accent px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-canvas">
            <SparklesIcon className="h-3 w-3" />
            Most popular
          </span>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-accent">Pro</h3>
          <p className="mt-3 text-4xl font-extrabold tracking-tight text-ink">
            ${proPrice}
            <span className="text-base font-medium text-faint">{proUnit}</span>
          </p>
          <p className="mt-2 text-sm text-muted">Create unlimited courses and unlock the entire library.</p>
          <ul className="mt-6 space-y-3">
            {PRO_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2.5 text-[15px] text-ink/80">
                <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                {f}
              </li>
            ))}
          </ul>
          {isPro ? (
            <div className="mt-8 space-y-2">
              <div className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-accent/10 px-5 py-3 text-sm font-semibold text-accent">
                <CheckIcon className="h-4 w-4" />
                You{"’"}re on Pro{plan ? ` (${plan === 'pro_yearly' ? 'yearly' : 'monthly'})` : ''}
              </div>
              <button
                onClick={cancel}
                disabled={busy === 'cancel'}
                className="w-full cursor-pointer rounded-full px-5 py-2 text-xs font-medium text-faint hover:text-accent disabled:opacity-50"
              >
                {busy === 'cancel' ? 'Cancelling…' : 'Cancel subscription'}
              </button>
            </div>
          ) : (
            <button
              onClick={goPro}
              disabled={busy === 'pro'}
              className="glow-accent mt-8 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-accent px-5 py-3 text-sm font-semibold text-canvas transition-all hover:brightness-110 disabled:opacity-60"
            >
              {busy === 'pro' ? 'Activating…' : loggedIn ? `Go Pro, $${proPrice}${proUnit}` : 'Go Pro'}
              <ArrowRightIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Single-course note */}
      <p className="mx-auto mt-8 max-w-xl text-center text-sm text-muted">
        Not ready to subscribe? Buy any library course for a one-time{' '}
        <span className="font-semibold text-ink">${SINGLE_COURSE_PRICE}</span> and keep it forever.
      </p>
    </div>
  );
}
