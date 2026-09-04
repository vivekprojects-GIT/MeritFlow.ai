'use client';

import { useEffect, type ReactNode } from 'react';
import { SiteNav } from './site-nav';
import { SiteFooter } from './site-footer';

/** Shared chrome for every marketing page: nav, scroll-reveal, footer. */
export function MarketingShell({ children }: { children: ReactNode }) {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll('.reveal'));
    if (typeof IntersectionObserver === 'undefined') {
      els.forEach((el) => el.classList.add('in'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('in');
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[460px] hero-glow" />
      <SiteNav />
      <main>{children}</main>
      <SiteFooter />
    </div>
  );
}
