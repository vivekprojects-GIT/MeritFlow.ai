'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { LogoSpinner } from './logo';

/**
 * One button language for the whole product.
 *
 * The audit that produced this found four problems in the previous version:
 *
 *  - **No loading state.** Every caller invented its own, usually by swapping
 *    the label to "Saving…", which changes the button's width mid-click and
 *    moves whatever sits beside it.
 *  - **No pressed state.** Only hover, so on touch — where hover does not
 *    exist — a tap gave no feedback at all until the request returned.
 *  - **Heights drifted.** `sm` and `md` were defined by padding alone, so a
 *    button with an icon was taller than one without, and a row of mixed
 *    buttons had ragged tops.
 *  - **`danger` was styled as a quiet outline**, which made the most
 *    consequential action in the app the least visible one.
 *
 * Sizes are fixed heights on an 8px grid — 28/36/44px — so any two buttons on
 * a row align regardless of their content. 44px is the large size because that
 * is the minimum comfortable touch target.
 */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accentQuiet';
export type ButtonSize = 'sm' | 'md' | 'lg';

const BASE = [
  'relative inline-flex items-center justify-center gap-1.5 whitespace-nowrap',
  'font-medium tracking-[-0.01em] select-none',
  'transition-[background-color,border-color,color,box-shadow,transform]',
  'duration-[var(--mf-dur-fast)] ease-[var(--mf-ease-out)]',
  /* Focus is a ring, never an outline swap: it must be visible on every
     variant including the filled ones, and must not shift layout. */
  'outline-none focus-visible:shadow-[var(--mf-shadow-focus)]',
  /* Pressed. Small enough to feel like contact, not like a bounce. */
  'active:scale-[0.97] active:duration-75',
  'disabled:pointer-events-none disabled:opacity-40 disabled:active:scale-100',
].join(' ');

const VARIANTS: Record<ButtonVariant, string> = {
  /* The one filled button on a screen. */
  primary: 'bg-[var(--color-accent-fill)] text-white shadow-[var(--mf-shadow-xs)] hover:brightness-[1.08] active:brightness-95',
  /* The default. A hairline and a surface — quiet enough to repeat. */
  secondary: 'border border-line bg-canvas text-ink shadow-[var(--mf-shadow-xs)] hover:bg-elevated active:bg-elevated',
  /* No chrome until touched. For toolbars and icon rows. */
  ghost: 'text-muted hover:bg-elevated hover:text-ink active:bg-elevated',
  /* Tinted, not filled: an accent action that is not *the* action. */
  accentQuiet: 'bg-mint text-accent hover:brightness-[0.97] active:brightness-95',
  /* Destructive actions look destructive. Filled, because burying a delete in
     a quiet outline is how people click it by accident. */
  danger: 'bg-[var(--color-danger)] text-white shadow-[var(--mf-shadow-xs)] hover:brightness-110 active:brightness-95',
};

/** Fixed heights so mixed rows align. Padding is secondary to the height. */
const SIZES: Record<ButtonSize, string> = {
  sm: 'h-7 rounded-[var(--mf-radius-sm)] px-2.5 text-[13px]',
  md: 'h-9 rounded-[var(--mf-radius-md)] px-3.5 text-[14px]',
  lg: 'h-11 rounded-[var(--mf-radius-lg)] px-5 text-[15px]',
};

/** Square when there is only an icon — a 36px circle, not a 36×64 pill. */
const ICON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-7 w-7 rounded-[var(--mf-radius-sm)] p-0',
  md: 'h-9 w-9 rounded-[var(--mf-radius-md)] p-0',
  lg: 'h-11 w-11 rounded-[var(--mf-radius-lg)] p-0',
};

export function buttonClass(variant: ButtonVariant = 'secondary', size: ButtonSize = 'md', extra = ''): string {
  return [BASE, VARIANTS[variant], SIZES[size], extra].filter(Boolean).join(' ');
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows the brand spinner and blocks interaction, without resizing. */
  loading?: boolean;
  /** Square icon-only button. Requires `aria-label`. */
  iconOnly?: boolean;
  /** Stretches to the container. Off by default — long buttons are a smell. */
  block?: boolean;
  children?: ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = 'secondary', size = 'md', className = '', type = 'button', loading = false, iconOnly = false, block = false, children, disabled, ...props },
  ref,
) {
  const sizing = iconOnly ? ICON_SIZES[size] : SIZES[size];
  const cls = [BASE, VARIANTS[variant], sizing, block ? 'w-full' : '', className].filter(Boolean).join(' ');

  return (
    <button
      ref={ref}
      type={type}
      className={cls}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {/* The label stays in flow and only loses opacity, so the button keeps
          its exact width while loading and nothing beside it moves. */}
      <span className={loading ? 'inline-flex items-center gap-1.5 opacity-0' : 'inline-flex items-center gap-1.5'}>
        {children}
      </span>
      {loading && (
        <span className="absolute inset-0 flex items-center justify-center">
          <LogoSpinner size={size === 'sm' ? 14 : size === 'md' ? 16 : 18} />
        </span>
      )}
    </button>
  );
});
