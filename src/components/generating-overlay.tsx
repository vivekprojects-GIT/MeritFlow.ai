'use client';

import { useEffect, useState } from 'react';
import { SparklesIcon, CheckIcon } from './icons';

const STEPS = [
  'Understanding your topic',
  'Designing the curriculum',
  'Writing the lessons',
  'Finding the best videos',
  'Assembling your course',
];

export function GeneratingOverlay({ topic }: { topic: string }) {
  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState(6);

  useEffect(() => {
    const stepTimer = setInterval(() => {
      setStep((s) => Math.min(s + 1, STEPS.length - 1));
    }, 4500);

    const progressTimer = setInterval(() => {
      // Ease toward 93% and stall there until the real response arrives.
      setProgress((p) => (p < 93 ? p + Math.max(0.4, (93 - p) * 0.05) : p));
    }, 350);

    return () => {
      clearInterval(stepTimer);
      clearInterval(progressTimer);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 px-4 backdrop-blur-sm">
      <div className="animate-fade-in-up elev-3 w-full max-w-md rounded-3xl border border-line bg-surface p-8">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-accent/30 bg-accent/15 text-accent">
            <SparklesIcon className="h-6 w-6 animate-pulse" />
          </span>
          <div className="min-w-0">
            <span className="eyebrow">Building your course</span>
            <p className="mt-1 line-clamp-1 font-serif text-lg font-medium text-ink">&ldquo;{topic}&rdquo;</p>
          </div>
        </div>

        <div className="mt-6 h-1.5 w-full overflow-hidden rounded-full bg-black/[0.08]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-accent to-accent-2 transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        <ul className="mt-6 space-y-3">
          {STEPS.map((label, i) => {
            const done = i < step;
            const active = i === step;
            return (
              <li key={label} className="flex items-center gap-3">
                <span
                  className={[
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs transition-colors',
                    done
                      ? 'border-accent bg-accent text-canvas'
                      : active
                        ? 'border-accent/60 text-accent'
                        : 'border-line text-faint',
                  ].join(' ')}
                >
                  {done ? (
                    <CheckIcon className="h-3.5 w-3.5" />
                  ) : active ? (
                    <span className="h-2 w-2 animate-ping rounded-full bg-accent" />
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  )}
                </span>
                <span
                  className={[
                    'text-sm transition-colors',
                    done ? 'text-faint line-through' : active ? 'font-medium text-ink' : 'text-faint',
                  ].join(' ')}
                >
                  {label}
                </span>
              </li>
            );
          })}
        </ul>

        <p className="mt-6 text-center text-xs text-faint">
          This usually takes 20-40 seconds. Hang tight while we craft something good.
        </p>
      </div>
    </div>
  );
}
