import Link from 'next/link';
import { LogoMark } from './logo';

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-faint">{title}</p>
      <ul className="mt-3 space-y-2">
        {links.map(([label, href]) => (
          <li key={label}>
            <Link href={href} className="u-link text-sm text-muted transition-colors hover:text-accent">
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-surface/50">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <div className="flex items-center gap-2">
              <LogoMark className="h-8 w-8" />
              <span className="text-xl font-semibold tracking-tight text-ink">MeritFlow</span>
            </div>
            <p className="mt-3 max-w-xs text-sm text-muted">
              Turn any topic into a complete, AI-powered course, with the best video in every lesson.
            </p>
          </div>
          <FooterCol
            title="Product"
            links={[
              ['Product', '/product'],
              ['Pricing', '/pricing'],
              ['Use cases', '/use-cases'],
              ['Enterprise', '/enterprise'],
            ]}
          />
          <FooterCol
            title="Resources"
            links={[
              ['Resources', '/resources'],
              ['Sign in', '/login'],
              ['Get started', '/login'],
            ]}
          />
          <FooterCol
            title="Company"
            links={[
              ['About', '/resources'],
              ['Contact', '/enterprise'],
            ]}
          />
        </div>
        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-line pt-6 text-xs text-faint sm:flex-row">
          <span>© 2026 MeritFlow. All rights reserved.</span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            All systems operational
          </span>
        </div>
      </div>
    </footer>
  );
}
