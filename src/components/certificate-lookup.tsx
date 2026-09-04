'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AlertTriangleIcon, CheckIcon, SparklesIcon } from './icons';
import { LogoMark } from './logo';
import { PrintButton } from './print-button';

type Certificate = {
  id: string;
  courseTitle: string;
  recipient: string;
  score: number;
  total: number;
  issuedAt: number;
};

export function CertificateLookup({ id, mode }: { id: string; mode: 'certificate' | 'verify' }) {
  const [cert, setCert] = useState<Certificate | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/certificates/${id}`)
      .then(async (res): Promise<{ certificate?: Certificate }> =>
        res.ok ? ((await res.json()) as { certificate?: Certificate }) : {},
      )
      .then((data) => {
        if (!cancelled) {
          setCert(data.certificate ?? null);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!loaded) return <main className="min-h-screen bg-canvas" />;

  if (!cert) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-canvas px-4 text-center">
        <AlertTriangleIcon className="h-10 w-10 text-accent" />
        <h1 className="text-2xl font-bold text-ink">Certificate not found</h1>
        <p className="max-w-md text-muted">No certificate matches this ID.</p>
        <Link href="/" className="rounded-xl bg-ink px-5 py-2.5 text-sm font-semibold text-canvas">
          Back to MeritFlow
        </Link>
      </main>
    );
  }

  const pct = Math.round((cert.score / cert.total) * 100);
  const date = new Date(cert.issuedAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  if (mode === 'verify') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas px-4 py-12">
        <div className="shadow-soft w-full max-w-md rounded-3xl border border-line bg-surface p-8 text-center">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-500/15 text-green-600">
            <CheckIcon className="h-8 w-8" />
          </span>
          <h1 className="mt-5 text-xl font-bold text-ink">Certificate verified</h1>
          <p className="mt-1 text-sm text-muted">This is a genuine MeritFlow certificate.</p>
          <dl className="mt-6 space-y-3 text-left">
            <Row label="Recipient" value={cert.recipient} />
            <Row label="Course" value={cert.courseTitle} />
            <Row label="Result" value={`${pct}% (${cert.score}/${cert.total})`} />
            <Row label="Issued" value={date} />
          </dl>
          <Link href={`/certificate/${cert.id}`} className="mt-7 inline-flex rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-canvas">
            View certificate
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-canvas px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
          <Link href="/" className="text-sm font-medium text-muted transition-colors hover:text-ink">
            Back to MeritFlow
          </Link>
          <div className="flex items-center gap-2">
            <Link href={`/verify/${cert.id}`} className="rounded-full border border-line bg-elevated px-4 py-2 text-sm font-medium text-ink">
              Verify
            </Link>
            <PrintButton className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-canvas">
              Print / Save as PDF
            </PrintButton>
          </div>
        </div>

        <article className="shadow-3d relative overflow-hidden rounded-3xl border-2 border-accent/25 bg-surface p-8 text-center sm:p-14">
          <div className="flex items-center justify-center gap-2">
            <LogoMark className="h-8 w-8" />
            <span className="text-xl font-extrabold tracking-tight text-ink">MeritFlow</span>
          </div>
          <p className="mt-8 text-xs font-semibold uppercase tracking-[0.35em] text-accent">Certificate of Completion</p>
          <p className="mt-8 text-sm text-muted">This certifies that</p>
          <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">{cert.recipient}</h1>
          <p className="mt-6 text-sm text-muted">has successfully completed</p>
          <h2 className="mx-auto mt-2 max-w-xl text-2xl font-bold text-ink">{cert.courseTitle}</h2>
          <div className="mt-7 inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent/10 px-4 py-1.5 text-sm font-semibold text-accent">
            <SparklesIcon className="h-4 w-4" />
            Passed with {pct}% ({cert.score}/{cert.total})
          </div>
          <div className="mt-10 border-t border-line pt-6 text-sm text-muted">
            Issued {date} · Verification ID {cert.id}
          </div>
        </article>
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line pb-3 last:border-0">
      <dt className="text-xs uppercase tracking-wider text-faint">{label}</dt>
      <dd className="text-right text-sm font-medium text-ink">{value}</dd>
    </div>
  );
}
