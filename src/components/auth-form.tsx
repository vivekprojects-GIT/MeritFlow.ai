'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRightIcon, AwardIcon, BookIcon, ChevronLeftIcon, SparklesIcon, UserIcon } from './icons';
import { Brandmark, type Brand } from './brandmark';

type Mode = 'login' | 'signup';
type Audience = 'individual' | 'university';
type Role = 'student' | 'instructor' | 'admin';

const ROLE_LABEL: Record<Role, string> = { student: 'Student', instructor: 'Professor', admin: 'Admin' };

/**
 * Sign-in entry paths.
 *
 * These are presentational only. Which dashboard you land on is decided by the
 * role stored on your account, never by what you pick here — so choosing the
 * "wrong" door can't lock you out, it just tailors the copy on the way in.
 */
type LoginPath = 'student' | 'instructor' | 'admin' | 'individual';

const LOGIN_PATHS: Array<{ id: LoginPath; label: string; blurb: string; icon: ReactNode }> = [
  {
    id: 'student',
    label: 'Student',
    blurb: 'Your classes, assignments, deadlines, and certificates.',
    icon: <BookIcon className="h-5 w-5" />,
  },
  {
    id: 'instructor',
    label: 'Professor',
    blurb: 'Your classes, course library, gradebook, and assignments.',
    icon: <UserIcon className="h-5 w-5" />,
  },
  {
    id: 'admin',
    label: 'Admin',
    blurb: 'Your university, professors, access codes, and branding.',
    icon: <AwardIcon className="h-5 w-5" />,
  },
  {
    id: 'individual',
    label: 'Just me',
    blurb: 'Personal learning, generate courses and read at your own pace.',
    icon: <SparklesIcon className="h-5 w-5" />,
  },
];

const LOGIN_INTRO: Record<LoginPath, string> = {
  student: 'Sign in to reach your classes and coursework.',
  instructor: 'Sign in to your classes, gradebook, and course library.',
  admin: 'Sign in to manage your university.',
  individual: 'Sign in to your courses.',
};

export function AuthForm({
  brand = null,
  universitySlug,
  ssoUniversity = null,
}: {
  brand?: Brand;
  universitySlug?: string;
  /** Set when this university has OIDC configured, enabling the SSO button. */
  ssoUniversity?: { slug: string; name: string } | null;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('login');
  // When arriving via a university's branded link, default the sign-up audience to university.
  const [audience, setAudience] = useState<Audience | null>(brand ? 'university' : null);
  const [role, setRole] = useState<Role>('student');
  const [loginPath, setLoginPath] = useState<LoginPath | null>(null);
  const [accessCode, setAccessCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const isSignup = mode === 'signup';
  const effectiveRole: Role = audience === 'individual' ? 'student' : role;
  const needsCode = isSignup && audience === 'university' && role !== 'student';

  function switchMode() {
    setMode(isSignup ? 'login' : 'signup');
    setAudience(brand ? 'university' : null);
    setRole('student');
    setLoginPath(null);
    setError('');
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError('');
    try {
      let body: Record<string, unknown> = { email, password };
      if (isSignup) {
        if (audience === 'individual') body = { email, password, role: 'student', accountKind: 'personal' };
        else if (effectiveRole === 'student') body = { email, password, role: 'student', universitySlug };
        else body = { email, password, role: effectiveRole, accessCode };
      }
      const res = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong.');
      router.replace('/');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setLoading(false);
    }
  }

  // ── Sign-up: choose audience first. Sign-in: choose a door first. ──
  const showChooser = isSignup && audience === null;
  const showLoginChooser = !isSignup && loginPath === null;

  return (
    <div className="animate-fade-in-up w-full max-w-sm">
      <div className="mb-7 flex flex-col items-center text-center lg:hidden">
        <Brandmark brand={brand} />
      </div>

      <div className="mb-6">
        <span className="eyebrow">{isSignup ? 'Get started' : 'Sign in'}</span>
        <h1 className="display mt-3 text-[2.1rem] text-ink">
          {isSignup ? 'Create your account' : showLoginChooser ? 'Welcome back' : `Sign in as ${loginPath === 'individual' ? 'yourself' : ROLE_LABEL[loginPath as Role].toLowerCase()}`}
        </h1>
        <p className="mt-2 text-[15px] text-muted">
          {!isSignup
            ? showLoginChooser
              ? 'How do you use MeritFlow?'
              : LOGIN_INTRO[loginPath as LoginPath]
            : showChooser
              ? 'How will you use MeritFlow?'
              : audience === 'individual'
                ? 'Personal learning, no code needed.'
                : effectiveRole === 'student'
                  ? brand
                    ? `Join ${brand.name} as a student.`
                    : 'Join your university as a student.'
                  : effectiveRole === 'instructor'
                    ? 'Publish courses and track your class.'
                    : 'Set up your university and invite professors.'}
        </p>
      </div>

      {showLoginChooser ? (
        <div className="grid gap-2.5">
          {LOGIN_PATHS.map((path) => (
            <button
              key={path.id}
              type="button"
              onClick={() => {
                setLoginPath(path.id);
                setError('');
              }}
              className="card-edit ring-focus flex items-start gap-3 rounded-2xl p-4 text-left"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-mint text-accent">
                {path.icon}
              </span>
              <span className="min-w-0">
                <span className="block font-semibold text-ink">{path.label}</span>
                <span className="block text-sm leading-relaxed text-muted">{path.blurb}</span>
              </span>
            </button>
          ))}
          <p className="mt-1 text-center text-xs text-faint">
            Not sure? Any of these works, we take you to the right place from your account.
          </p>
        </div>
      ) : showChooser ? (
        <div className="grid gap-3">
          <button
            type="button"
            onClick={() => setAudience('individual')}
            className="card-edit ring-focus flex items-start gap-3 rounded-2xl p-4 text-left"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-mint text-accent">
              <SparklesIcon className="h-5 w-5" />
            </span>
            <span>
              <span className="block font-semibold text-ink">Individual</span>
              <span className="block text-sm text-muted">
                Learn on your own, browse the library, generate courses, earn certificates.
              </span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => setAudience('university')}
            className="card-edit ring-focus flex items-start gap-3 rounded-2xl p-4 text-left"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-mint text-accent">
              <AwardIcon className="h-5 w-5" />
            </span>
            <span>
              <span className="block font-semibold text-ink">University</span>
              <span className="block text-sm text-muted">
                Join your institution with an access code, student, professor, or admin.
              </span>
            </span>
          </button>
        </div>
      ) : (
        <>
          {/* University role picker */}
          {isSignup && audience === 'university' && (
            <div className="mb-4 grid grid-cols-3 gap-1.5 rounded-2xl border border-line bg-surface p-1.5">
              {(['student', 'instructor', 'admin'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => {
                    setRole(r);
                    setError('');
                  }}
                  aria-pressed={role === r}
                  className={[
                    'press ring-focus rounded-xl px-2 py-2 text-sm font-semibold transition-colors',
                    role === r ? 'bg-accent-fill text-canvas' : 'text-muted hover:bg-mint hover:text-ink',
                  ].join(' ')}
                >
                  {ROLE_LABEL[r]}
                </button>
              ))}
            </div>
          )}

          {/* Institutional sign-in comes first: where it exists it is the
              expected route, and it avoids another password entirely. */}
          {ssoUniversity && (
            <div className="mb-4">
              <a
                href={`/api/auth/sso/${ssoUniversity.slug}/start`}
                className="press ring-focus flex w-full items-center justify-center gap-2 rounded-xl border border-accent/40 bg-mint px-5 py-3 text-sm font-semibold text-accent"
              >
                <AwardIcon className="h-4 w-4" />
                Continue with {ssoUniversity.name}
              </a>
              <p className="mt-3 flex items-center gap-3 text-[11px] uppercase tracking-[0.14em] text-faint">
                <span className="h-px flex-1 bg-line" />
                or use a password
                <span className="h-px flex-1 bg-line" />
              </p>
            </div>
          )}

          <form onSubmit={submit} className="elev-2 rounded-2xl border border-line bg-surface p-6">
            <label className="block text-xs font-semibold uppercase tracking-wider text-faint" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="ring-focus mt-1.5 w-full rounded-xl border border-line bg-canvas px-3.5 py-2.5 text-[15px] text-ink caret-accent transition-colors placeholder:text-faint focus:border-accent/60 focus:outline-none"
            />

            <label className="mt-4 block text-xs font-semibold uppercase tracking-wider text-faint" htmlFor="password">
              Password
            </label>
            <div className="relative mt-1.5">
              <input
                id="password"
                type={showPw ? 'text' : 'password'}
                required
                minLength={8}
                autoComplete={isSignup ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isSignup ? 'At least 8 characters' : '••••••••'}
                className="ring-focus w-full rounded-xl border border-line bg-canvas px-3.5 py-2.5 pr-16 text-[15px] text-ink caret-accent transition-colors placeholder:text-faint focus:border-accent/60 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="ring-focus absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-xs font-semibold text-muted hover:text-accent"
                aria-label={showPw ? 'Hide password' : 'Show password'}
              >
                {showPw ? 'Hide' : 'Show'}
              </button>
            </div>

            {needsCode && (
              <>
                <label className="mt-4 block text-xs font-semibold uppercase tracking-wider text-faint" htmlFor="code">
                  {role === 'admin' ? 'Admin access code' : 'University access code'}
                </label>
                <input
                  id="code"
                  type="text"
                  required
                  value={accessCode}
                  onChange={(e) => setAccessCode(e.target.value)}
                  placeholder={role === 'admin' ? 'Provided to set up a university' : 'Provided by your university admin'}
                  className="ring-focus mt-1.5 w-full rounded-xl border border-line bg-canvas px-3.5 py-2.5 text-[15px] text-ink caret-accent transition-colors placeholder:text-faint focus:border-accent/60 focus:outline-none"
                />
                {role === 'admin' && <p className="mt-1.5 text-xs text-faint">Demo code: LECTERN-ADMIN</p>}
              </>
            )}

            {error && (
              <p role="alert" className="mt-4 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2 text-sm text-accent">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="press ring-focus mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent-fill px-5 py-2.5 text-sm font-semibold text-canvas elev-1 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Please wait…' : isSignup ? `Create ${ROLE_LABEL[effectiveRole].toLowerCase()} account` : 'Sign in'}
              {!loading && <ArrowRightIcon className="h-4 w-4" />}
            </button>

            <p className="mt-4 text-center text-xs text-faint">No credit card required · Demo accounts welcome</p>
          </form>

          {/* Back to whichever chooser brought us here */}
          {((isSignup && !brand) || !isSignup) && (
            <button
              type="button"
              onClick={() => {
                if (isSignup) setAudience(null);
                else setLoginPath(null);
                setError('');
              }}
              className="u-link mx-auto mt-4 flex items-center gap-1 text-sm font-medium text-muted"
            >
              <ChevronLeftIcon className="h-4 w-4" />
              Choose a different account type
            </button>
          )}
        </>
      )}

      <p className="mt-5 text-center text-sm text-muted">
        {isSignup ? 'Already have an account? ' : "Don't have an account? "}
        <button type="button" onClick={switchMode} className="u-link font-semibold text-accent">
          {isSignup ? 'Sign in' : 'Create one'}
        </button>
      </p>
    </div>
  );
}
