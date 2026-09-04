'use client';

import type { ReactNode } from 'react';

/** Triggers the browser's print dialog — used to "Save as PDF" a certificate. */
export function PrintButton({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <button type="button" onClick={() => window.print()} className={className}>
      {children}
    </button>
  );
}
