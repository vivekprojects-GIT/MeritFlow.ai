'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { AccountMenu } from './account-menu';
import { Brandmark, type Brand } from './brandmark';
import { MenuIcon, CloseIcon } from './icons';

/**
 * The application shell: a persistent sidebar, a top bar, and a content well.
 *
 * Every signed-in surface renders through this — student, professor and admin.
 * Before it, each dashboard carried its own header, which is why the same
 * controls drifted apart: three copies of the account cluster, three different
 * nav treatments, and a theme toggle that only existed on one of them. One
 * shell means fixing the header fixes it everywhere.
 *
 * Navigation is vertical rather than horizontal because the item count grows
 * with the product. A horizontal bar was already wrapping to two lines at seven
 * items; a sidebar takes twenty without flinching.
 */

export type NavItem = {
  id: string;
  label: string;
  icon?: ReactNode;
  /** Rendered as a count pill on the right of the row. Omitted when zero. */
  badge?: number;
};

export type NavGroup = { heading?: string; items: NavItem[] };

export function AppShell({
  brand,
  roleLabel,
  groups,
  activeId,
  onNavigate,
  userEmail,
  title,
  actions,
  children,
}: {
  brand?: Brand | null;
  roleLabel?: string;
  groups: NavGroup[];
  activeId: string;
  onNavigate: (id: string) => void;
  userEmail: string;
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mobileOpen]);

  const sidebar = (
    <nav aria-label="Main" className="flex h-full flex-col gap-1 p-3">
      <div className="mb-2 flex items-center gap-2 px-2 py-1.5">
        <Brandmark brand={brand ?? null} />
        {roleLabel && (
          <span className="rounded-full border border-accent/25 bg-mint px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent">
            {roleLabel}
          </span>
        )}
      </div>

      {groups.map((group, gi) => (
        <div key={group.heading ?? gi} className={gi > 0 ? 'mt-4' : ''}>
          {group.heading && (
            <p className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-faint">{group.heading}</p>
          )}
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = item.id === activeId;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      /* Closed here rather than in an effect on activeId: an
                         effect that setStates on every route change is a
                         cascading render, and some nav items (Messages) open a
                         dialog without changing activeId at all, those still
                         need the drawer to get out of the way. */
                      setMobileOpen(false);
                      onNavigate(item.id);
                    }}
                    aria-current={active ? 'page' : undefined}
                    className={`ring-focus flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition ${
                      active ? 'bg-accent/12 font-semibold text-accent' : 'font-medium text-muted hover:bg-elevated hover:text-ink'
                    }`}
                  >
                    {item.icon && <span className="shrink-0 opacity-80">{item.icon}</span>}
                    <span className="truncate">{item.label}</span>
                    {/* Zero is not news, the pill only appears when there is
                        something to act on. */}
                    {item.badge != null && item.badge > 0 && (
                      <span className="ml-auto rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold text-canvas">
                        {item.badge > 99 ? '99+' : item.badge}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-surface">
      {/* Desktop rail. Fixed so the content scrolls under it rather than the
          whole page moving, long dashboards otherwise scroll the nav away. */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 overflow-y-auto border-r border-line bg-canvas lg:block">
        {sidebar}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-ink/40"
          />
          <div className="absolute inset-y-0 left-0 w-64 overflow-y-auto bg-canvas shadow-2xl">
            <div className="flex justify-end p-2">
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close navigation"
                className="rounded-lg p-1.5 text-muted hover:bg-elevated"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>
            {sidebar}
          </div>
        </div>
      )}

      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 border-b border-line bg-canvas/85 backdrop-blur">
          <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
              className="rounded-lg p-1.5 text-muted hover:bg-elevated lg:hidden"
            >
              <MenuIcon className="h-5 w-5" />
            </button>
            <h1 className="truncate text-lg font-bold text-ink">{title}</h1>
            <div className="ml-auto flex items-center gap-2">
              {actions}
              <AccountMenu email={userEmail} />
            </div>
          </div>
        </header>

        <main className="px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
