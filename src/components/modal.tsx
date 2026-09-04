'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { CloseIcon } from './icons';

type Size = 'sm' | 'md' | 'lg' | 'xl';
const MAXW: Record<Size, string> = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-2xl',
  lg: 'sm:max-w-3xl',
  xl: 'sm:max-w-5xl',
};

/**
 * One polished dialog for every popup in the app — so they all look and behave
 * identically. Desktop: a centered card. Mobile: a bottom sheet. Includes a
 * sticky header (eyebrow + title + actions + close), a scrollable body, an
 * optional sticky footer, soft backdrop, entrance motion, Escape-to-close,
 * focus management, and background scroll-lock.
 */
export function Modal({
  open,
  onClose,
  title,
  eyebrow,
  subtitle,
  headerRight,
  footer,
  size = 'md',
  bodyClassName,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  eyebrow?: string;
  subtitle?: ReactNode;
  headerRight?: ReactNode;
  footer?: ReactNode;
  size?: Size;
  bodyClassName?: string;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prevFocus = document.activeElement as HTMLElement | null;
    const root = document.documentElement;
    const prevOverflow = root.style.overflow;
    root.style.overflow = 'hidden'; // lock background scroll
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      root.style.overflow = prevOverflow;
      prevFocus?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  const hasHeader = Boolean(title || eyebrow || headerRight);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 px-0 backdrop-blur-[3px] sm:items-center sm:px-6 sm:py-8"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={[
          'animate-fade-in-up elev-3 flex max-h-[92vh] w-full flex-col overflow-hidden border border-line bg-surface outline-none',
          'rounded-t-3xl sm:max-h-[86vh] sm:rounded-3xl',
          MAXW[size],
        ].join(' ')}
      >
        {hasHeader && (
          <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4 sm:px-6 sm:py-5">
            <div className="min-w-0">
              {eyebrow && <span className="eyebrow">{eyebrow}</span>}
              {title && (
                <h2 className="mt-1.5 truncate text-lg font-semibold tracking-tight text-ink">{title}</h2>
              )}
              {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {headerRight}
              <button
                onClick={onClose}
                aria-label="Close"
                className="ring-focus rounded-lg p-2 text-faint transition-colors hover:bg-mint hover:text-ink"
              >
                <CloseIcon className="h-5 w-5" />
              </button>
            </div>
          </div>
        )}

        <div className={['thin-scroll flex-1 overflow-y-auto px-5 py-5 sm:px-6', bodyClassName ?? ''].join(' ')}>
          {children}
        </div>

        {footer && <div className="border-t border-line bg-surface px-5 py-4 sm:px-6">{footer}</div>}
      </div>
    </div>
  );
}
