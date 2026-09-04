import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Research — MeritFlow',
  description: 'What we see across applications, and where a tool genuinely helps.',
};

/**
 * The research page.
 *
 * Static by design. Everything here is either a claim we can stand behind or a
 * limit we are naming — no live counters, because a number that moves needs a
 * source, and an invented one would be exactly the kind of thing this page
 * argues against.
 */

const PIECES = [
  {
    tag: 'Hiring reality',
    read: '3 min',
    title: 'What actually happens after you press submit',
    body: 'Most applicant tracking systems do not auto-reject on a keyword score. They rank, and a human opens the top of the list. That changes what is worth optimising: being legible to the person who opens it, rather than gaming a filter that mostly is not there.',
  },
  {
    tag: 'Résumé',
    read: '4 min',
    title: 'Why we refuse to invent things on your résumé',
    body: 'Tailoring reorders and rephrases what you already did. It never adds. A claim you cannot defend in the interview costs more than the application it won, and you would not even know it had been made for you. Every generated line is checked back against your own text, and anything unsupported is dropped and shown to you.',
  },
  {
    tag: 'Automation',
    read: '3 min',
    title: 'Where automation stops, and why that is deliberate',
    body: 'A CAPTCHA, an account wall, or a question we cannot answer from something you told us hands the application back to you. There is no solver here and there will not be one. That is a real ceiling on how much can be automated, and pretending otherwise would mean quietly failing applications you believed were sent.',
  },
  {
    tag: 'Volume',
    read: '2 min',
    title: 'Why there are caps on how much we send',
    body: 'Six applications to one employer in an hour reads as a bot to that employer, and it costs you the ones that mattered. Per-day and per-company limits exist to protect your name, not to ration the product.',
  },
];

export default function ResearchPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-16 sm:px-6">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-faint">Research</p>
      <h1 className="mt-3 text-[clamp(1.9rem,5vw,2.6rem)] font-bold leading-[1.1] tracking-[-0.02em] text-ink">
        What we can show you, and what we cannot
      </h1>
      <p className="mt-4 max-w-2xl text-[17px] leading-relaxed text-muted">
        There is a lot of confident advice about job applications and very little of it is checkable. These are the
        positions the product is actually built on, including the places where it declines to help.
      </p>

      <div className="mt-12 space-y-3">
        {PIECES.map((p) => (
          <article key={p.title} className="rounded-[var(--mf-radius-xl)] border border-line bg-canvas p-6">
            <p className="flex items-center gap-2.5 text-[11px]">
              <span className="rounded-full bg-mint px-2.5 py-1 font-bold uppercase tracking-wide text-accent">{p.tag}</span>
              <span className="text-faint">{p.read} read</span>
            </p>
            <h2 className="mt-3 text-[19px] font-bold leading-snug text-ink">{p.title}</h2>
            <p className="mt-2 text-[15px] leading-relaxed text-muted">{p.body}</p>
          </article>
        ))}
      </div>

      {/* Named rather than omitted: a research page that only lists strengths
          is marketing wearing a lab coat. */}
      <section className="mt-12 rounded-[var(--mf-radius-xl)] border border-line bg-elevated/50 p-6">
        <h2 className="text-sm font-bold text-ink">What we do not have</h2>
        <ul className="mt-3 space-y-2 text-[15px] text-muted">
          <li>
            No professional network, so there are no &ldquo;insider connections&rdquo; to show you. Searching the company
            on LinkedIn for people from your school is the manual version, and it works.
          </li>
          <li>
            No outcome data. We can tell you how well a posting matches your résumé; we cannot tell you your odds of
            being hired, and anyone who does is guessing.
          </li>
          <li>
            No relationship with any employer. Nothing here gets your application looked at faster.
          </li>
        </ul>
      </section>

      <p className="mt-10 text-sm text-muted">
        <Link href="/" className="text-accent underline underline-offset-2">
          Back to MeritFlow
        </Link>
      </p>
    </main>
  );
}
