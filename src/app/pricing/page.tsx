import { PricingPlans } from '@/components/pricing-plans';
import { MarketingShell } from '@/components/marketing-shell';

export const metadata = { title: 'Pricing - MeritFlow' };

export default function PricingPage() {
  return (
    <MarketingShell>
      <section className="relative overflow-hidden px-4 pb-8 pt-16 sm:px-6 sm:pt-24">
        <div className="dot-grid pointer-events-none absolute inset-0 -z-10" />
        <div className="reveal mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
            Pricing
          </span>
          <h1 className="mt-4 text-4xl font-extrabold leading-[1.05] tracking-tight text-ink sm:text-6xl">
            Learn anything, <span className="text-aurora">your way</span>
          </h1>
          <p className="mx-auto mt-5 max-w-lg text-lg text-muted">
            Buy a single course when you need one, or go Pro to generate unlimited courses and unlock the whole library.
          </p>
        </div>
      </section>

      <section className="px-4 pb-24 sm:px-6">
        <div className="reveal">
          <PricingPlans loggedIn={false} isPro={false} plan={null} />
        </div>
      </section>
    </MarketingShell>
  );
}
