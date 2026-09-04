'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ChevronRightIcon, CloseIcon, MenuIcon } from './icons';
import { LogoMark } from './logo';

type NavItem = { label: string; href: string; caret?: boolean };

const NAV: NavItem[] = [
  { label: 'Solutions', href: '/product', caret: true },
  { label: 'Resources', href: '/resources', caret: true },
  { label: 'Community', href: '/use-cases' },
  { label: 'Enterprise', href: '/enterprise' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Security', href: '/enterprise' },
];

export function SiteNav() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-line/60 bg-canvas/70 backdrop-blur">
      <nav className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-3.5 sm:px-7">
        <Link href="/" className="ring-focus flex items-center gap-2.5">
          <LogoMark className="h-8 w-8" />
          <span className="text-[21px] font-semibold tracking-tight text-ink">MeritFlow</span>
        </Link>

        <div className="ml-3 hidden items-center gap-6 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="u-link inline-flex items-center gap-1 text-[15px] font-medium text-ink/80 transition-colors hover:text-ink"
            >
              {item.label}
              {item.caret && <ChevronRightIcon className="h-3.5 w-3.5 rotate-90 text-ink/40" />}
            </Link>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <Link
            href="/login"
            className="press ring-focus hidden rounded-lg px-3.5 py-2 text-[15px] font-medium text-ink transition-colors hover:bg-black/[0.05] sm:inline-flex"
          >
            Log in
          </Link>
          <Link
            href="/login"
            className="press ring-focus inline-flex items-center rounded-full bg-accent-fill px-4 py-2 text-[15px] font-semibold text-canvas"
          >
            Get started
          </Link>
          <button onClick={() => setOpen((v) => !v)} aria-label="Menu" className="rounded-lg p-2 text-muted hover:bg-black/[0.05] md:hidden">
            {open ? <CloseIcon className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
          </button>
        </div>
      </nav>

      {open && (
        <div className="mx-auto max-w-7xl px-4 pb-3 md:hidden">
          <div className="rounded-2xl border border-line bg-elevated p-2 shadow-soft">
            {NAV.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                onClick={() => setOpen(false)}
                className="block rounded-xl px-4 py-2.5 text-sm font-medium text-ink hover:bg-mint"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}
