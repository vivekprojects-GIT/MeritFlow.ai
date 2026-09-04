import Link from 'next/link';
import { AuthForm } from '@/components/auth-form';
import { Brandmark } from '@/components/brandmark';
import { CheckIcon } from '@/components/icons';

const PROOF = [
  'The single best video, auto-matched to every topic',
  'Quizzes and a verifiable certificate, included',
  'Learn it yourself - or teach straight from it',
];

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ u?: string }> }) {
  const { u } = await searchParams;

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <aside className="grain relative hidden overflow-hidden border-r border-line bg-mint/40 lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16">
        <div className="aurora pointer-events-none absolute inset-0 z-0 opacity-60" />
        <Link href="/" className="ring-focus relative z-10 w-fit">
          <Brandmark brand={null} />
        </Link>

        <div className="relative z-10 max-w-md">
          <span className="eyebrow">Teach-from-anything</span>
          <h2 className="display mt-6 text-[clamp(2.3rem,3.2vw,3.4rem)] text-ink">
            Turn any document into a course you can{' '}
            <span className="marker">
              <span>teach from</span>
            </span>
            .
          </h2>
          <p className="mt-6 max-w-sm font-serif text-[17px] leading-relaxed text-muted">
            Upload a PDF or type a single sentence. MeritFlow writes the lessons, finds videos, and builds the quizzes.
          </p>
        </div>

        <ul className="relative z-10 space-y-3">
          {PROOF.map((p) => (
            <li key={p} className="flex items-start gap-2.5 text-[15px] text-ink/80">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-fill text-canvas">
                <CheckIcon className="h-3 w-3" />
              </span>
              {p}
            </li>
          ))}
        </ul>
      </aside>

      <div className="relative flex items-center justify-center px-4 py-16">
        <div className="hero-glow pointer-events-none absolute inset-0 -z-10 lg:hidden" />
        <div className="dot-grid pointer-events-none absolute inset-0 -z-10 lg:hidden" />
        <AuthForm brand={null} universitySlug={u} />
      </div>
    </main>
  );
}
