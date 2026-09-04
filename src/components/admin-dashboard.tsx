'use client';

import { useEffect, useState, type ChangeEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { University, ProfessorCode, AdminOverview } from '@/lib/universities-store';
import { AdminInsights } from './admin-insights';
import { AdminStudentExplorer } from './admin-student-explorer';
import { AdminCohorts } from './admin-cohorts';
import type { RosterEntry } from '@/lib/classes-store';
import { Brandmark } from './brandmark';
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  AwardIcon,
  BookIcon,
  CheckIcon,
  ClockIcon,
  LayersIcon,
  PlusIcon,
  SparklesIcon,
  UserIcon,
} from './icons';
import { Modal } from './modal';
import { AppShell, type NavGroup } from './app-shell';
import { ModeAnalyticsPanel, type ModeAnalyticsColumn, type ModeAnalyticsInsight } from './mode-analytics-panel';

const LOGO_MAX_BYTES = 600 * 1024;

async function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read file.'));
    reader.readAsDataURL(file);
  });
}

export function AdminDashboard({
  userEmail,
  initialUniversity,
}: {
  userEmail: string;
  initialUniversity: University | null;
}) {
  const router = useRouter();
  const [university, setUniversity] = useState<University | null>(initialUniversity);

  async function logout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      /* ignore */
    }
    router.replace('/login');
    router.refresh();
  }

  if (!university) {
    return <UniversitySetup userEmail={userEmail} onCreated={setUniversity} onLogout={logout} />;
  }
  return <Dashboard userEmail={userEmail} university={university} onUpdated={setUniversity} />;
}

/* ── First-run setup ────────────────────────────────────────────────────── */

function UniversitySetup({
  userEmail,
  onCreated,
  onLogout,
}: {
  userEmail: string;
  onCreated: (u: University) => void;
  onLogout: () => void;
}) {
  const [name, setName] = useState('');
  const [logo, setLogo] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > LOGO_MAX_BYTES) {
      setError('Logo image is too large (max 600 KB).');
      return;
    }
    setError(null);
    setLogo(await readFileAsDataUrl(file));
  }

  async function submit() {
    if (!name.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/university', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), logoUrl: logo }),
      });
      const data = (await res.json()) as { university?: University; error?: string };
      if (!res.ok || !data.university) throw new Error(data.error ?? 'Could not create the university.');
      onCreated(data.university);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the university.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 py-16">
      <div className="hero-glow pointer-events-none absolute inset-0 -z-10" />
      <div className="animate-fade-in-up w-full max-w-md">
        <div className="mb-6">
          <span className="eyebrow">University admin · {userEmail}</span>
          <h1 className="display mt-3 text-[2.4rem] text-ink">
            Set up your{' '}
            <span className="marker">
              <span>university</span>
            </span>
          </h1>
          <p className="mt-2 text-[15px] text-muted">
            Your name and logo will brand the login page and every dashboard for your professors and students.
          </p>
        </div>

        <div className="elev-2 rounded-2xl border border-line bg-surface p-6">
          <label className="block text-xs font-semibold uppercase tracking-wider text-faint" htmlFor="uni-name">
            University name
          </label>
          <input
            id="uni-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Riverside University"
            className="ring-focus mt-1.5 w-full rounded-xl border border-line bg-canvas px-3.5 py-2.5 text-[15px] text-ink placeholder:text-faint focus:border-accent/60 focus:outline-none"
          />

          <p className="mt-4 block text-xs font-semibold uppercase tracking-wider text-faint">Logo</p>
          <div className="mt-1.5 flex items-center gap-3">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-canvas">
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo} alt="Logo preview" className="h-full w-full object-contain" />
              ) : (
                <SparklesIcon className="h-5 w-5 text-faint" />
              )}
            </span>
            <label className="press ring-focus cursor-pointer rounded-lg border border-line px-3.5 py-2 text-sm font-semibold text-ink hover:border-accent/40">
              {logo ? 'Change logo' : 'Upload logo'}
              <input type="file" accept="image/*" onChange={onFile} className="hidden" />
            </label>
          </div>
          <p className="mt-1.5 text-xs text-faint">PNG, SVG, or JPG up to 600 KB. Optional.</p>

          {error && (
            <p role="alert" className="mt-4 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2 text-sm text-accent">
              {error}
            </p>
          )}

          <button
            onClick={submit}
            disabled={saving || !name.trim()}
            className="press ring-focus mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent-fill px-5 py-2.5 text-sm font-semibold text-canvas elev-1 disabled:opacity-50"
          >
            {saving ? 'Creating…' : 'Create university'}
            {!saving && <ArrowRightIcon className="h-4 w-4" />}
          </button>
        </div>

        <button onClick={onLogout} className="u-link mx-auto mt-5 block text-sm font-medium text-muted">
          Log out
        </button>
      </div>
    </div>
  );
}

/* ── Admin dashboard ────────────────────────────────────────────────────── */

function Dashboard({
  userEmail,
  university,
  onUpdated,
}: {
  userEmail: string;
  university: University;
  onUpdated: (u: University) => void;
}) {
  const [codes, setCodes] = useState<ProfessorCode[]>([]);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [label, setLabel] = useState('');
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [rosterId, setRosterId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [section, setSection] = useState('overview');

  useEffect(() => {
    fetch('/api/admin/codes')
      .then((r) => r.json())
      .then((d: { codes?: ProfessorCode[] }) => setCodes(d.codes ?? []))
      .catch(() => {});
    fetch('/api/admin/overview')
      .then((r) => r.json())
      .then((d: AdminOverview) => setOverview(d))
      .catch(() => {});
  }, []);

  const brand = { name: university.name, logoUrl: university.logoUrl };
  const loginLink =
    typeof window !== 'undefined' ? `${window.location.origin}/login?u=${university.slug}` : `/login?u=${university.slug}`;

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((k) => (k === key ? null : k)), 1600);
    } catch {
      /* ignore */
    }
  }

  async function generateCode() {
    if (generating) return;
    setGenerating(true);
    try {
      const res = await fetch('/api/admin/codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: label.trim() }),
      });
      const data = (await res.json()) as { code?: string };
      if (data.code) {
        setCodes((prev) => [
          { code: data.code!, label: label.trim(), usedByEmail: null, usedAt: null, createdAt: Date.now() },
          ...prev,
        ]);
        setLabel('');
      }
    } finally {
      setGenerating(false);
    }
  }

  async function revoke(code: string) {
    setCodes((prev) => prev.filter((c) => c.code !== code));
    await fetch('/api/admin/codes', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    }).catch(() => {});
  }

  const totals = overview?.totals ?? { professors: 0, classes: 0, students: 0, completions: 0 };

  /* Section ids double as scroll anchors: the admin surface is one long page,
     so the sidebar scrolls to a section rather than swapping the view. */
  const NAV: NavGroup[] = [
    {
      items: [
        { id: 'overview', label: 'Overview', icon: <LayersIcon className="h-4 w-4" /> },
        { id: 'learners', label: 'Learners', icon: <UserIcon className="h-4 w-4" /> },
        { id: 'professors', label: 'Professors', icon: <UserIcon className="h-4 w-4" /> },
        { id: 'classes', label: 'Classes', icon: <BookIcon className="h-4 w-4" /> },
      ],
    },
    {
      heading: 'Institution',
      items: [
        { id: 'codes', label: 'Access codes', icon: <PlusIcon className="h-4 w-4" /> },
        { id: 'branding', label: 'Branding', icon: <SparklesIcon className="h-4 w-4" /> },
      ],
    },
  ];

  return (
    <AppShell
      brand={brand}
      roleLabel="Admin"
      groups={NAV}
      activeId={section}
      onNavigate={(id) => {
        setSection(id);
        document.getElementById(`sec-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }}
      userEmail={userEmail}
      title={university.name}
    >
      <AdminCommandCenter university={university} overview={overview} codes={codes} totals={totals} />

      <div className="mx-auto max-w-6xl space-y-16 pb-24 pt-8">
        {/* Professor codes */}
        <section id="sec-codes">
          <div className="border-b border-line pb-4">
            <span className="eyebrow">Invite professors</span>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">Professor access codes</h2>
            <p className="mt-1 text-sm text-muted">
              Generate a single-use code and share it with a professor. They enter it when signing up to join {university.name}.
            </p>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Label (optional). e.g. Dr. Lee, Biology"
              className="ring-focus w-72 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none"
            />
            <button
              onClick={generateCode}
              disabled={generating}
              className="press ring-focus inline-flex items-center gap-1.5 rounded-lg bg-accent-fill px-4 py-2 text-sm font-semibold text-canvas disabled:opacity-50"
            >
              <PlusIcon className="h-4 w-4" />
              {generating ? 'Generating…' : 'Generate code'}
            </button>
          </div>
          {codes.length > 0 ? (
            <div className="mt-5 overflow-hidden rounded-2xl border border-line">
              <table className="w-full text-left text-sm">
                <thead className="bg-elevated text-[11px] uppercase tracking-wider text-faint">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Code</th>
                    <th className="px-4 py-2.5 font-semibold">Label</th>
                    <th className="px-4 py-2.5 font-semibold">Status</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {codes.map((c) => (
                    <tr key={c.code}>
                      <td className="px-4 py-2.5 font-mono font-bold tracking-[0.15em] text-ink">{c.code}</td>
                      <td className="max-w-[200px] truncate px-4 py-2.5 text-muted">{c.label || '--'}</td>
                      <td className="px-4 py-2.5">
                        {c.usedByEmail ? (
                          <span className="inline-flex items-center gap-1 text-[12px] text-muted">
                            <CheckIcon className="h-3 w-3 text-accent" /> {c.usedByEmail}
                          </span>
                        ) : (
                          <span className="text-[12px] text-faint">Unused</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          onClick={() => copy(c.code, `c-${c.code}`)}
                          className="ring-focus rounded-md px-2 py-1 text-xs font-semibold text-accent hover:bg-mint"
                        >
                          {copied === `c-${c.code}` ? 'Copied' : 'Copy'}
                        </button>
                        {!c.usedByEmail && (
                          <button
                            onClick={() => revoke(c.code)}
                            className="ring-focus rounded-md px-2 py-1 text-xs font-semibold text-muted hover:text-accent"
                          >
                            Revoke
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-5 text-sm text-muted">No codes yet, generate one to invite your first professor.</p>
          )}
        </section>

        {/* Learners, the individual level, between platform adoption above and
            the professor/class rosters below. */}
        <section id="sec-learners">
          <AdminStudentExplorer classes={overview?.classes ?? []} />
          <div className="mt-4">
            <AdminCohorts />
          </div>
        </section>

        {/* Adoption, real activity, above the static rosters. */}
        {/* Professors */}
        <section id="sec-professors">
          <div className="border-b border-line pb-4">
            <span className="eyebrow">Oversight</span>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">Professors</h2>
          </div>
          {overview && overview.professors.length > 0 ? (
            <div className="mt-5 overflow-hidden rounded-2xl border border-line">
              <table className="w-full text-left text-sm">
                <thead className="bg-elevated text-[11px] uppercase tracking-wider text-faint">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Professor</th>
                    <th className="px-4 py-2.5 font-semibold">Classes</th>
                    <th className="px-4 py-2.5 font-semibold">Students</th>
                    <th className="px-4 py-2.5 font-semibold">Completions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {overview.professors.map((p) => (
                    <tr key={p.id}>
                      <td className="max-w-[220px] truncate px-4 py-2.5 text-ink">{p.email}</td>
                      <td className="px-4 py-2.5 text-muted">{p.classes}</td>
                      <td className="px-4 py-2.5 text-muted">{p.students}</td>
                      <td className="px-4 py-2.5 font-semibold text-accent">{p.completions}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-5 text-sm text-muted">No professors have joined yet. Share a code to get started.</p>
          )}
        </section>

        {/* Classes */}
        <section id="sec-classes">
          <div className="border-b border-line pb-4">
            <span className="eyebrow">Oversight</span>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">Classes</h2>
          </div>
          {overview && overview.classes.length > 0 ? (
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {overview.classes.map((c) => (
                <button key={c.id} onClick={() => setRosterId(c.id)} className="card-edit ring-focus rounded-2xl p-5 text-left">
                  <div className="flex items-start justify-between gap-2">
                    <span className="rounded-full bg-mint px-2.5 py-1 text-[11px] font-semibold text-accent">
                      {c.examOpen ? 'Exam open' : 'Exam locked'}
                    </span>
                  </div>
                  <h3 className="mt-3 line-clamp-2 font-semibold leading-snug text-ink">{c.title}</h3>
                  <p className="mt-1 line-clamp-1 text-sm text-muted">{c.professorEmail}</p>
                  <p className="mt-4 flex items-center gap-x-3 text-xs text-faint">
                    <span className="inline-flex items-center gap-1">
                      <LayersIcon className="h-3.5 w-3.5" />
                      {c.enrolled} enrolled
                    </span>
                    <span className="inline-flex items-center gap-1 text-accent">
                      <CheckIcon className="h-3 w-3" />
                      {c.completed} completed
                    </span>
                  </p>
                  <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-accent">
                    View roster
                    <ArrowRightIcon className="h-3.5 w-3.5" />
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-5 text-sm text-muted">No classes published yet.</p>
          )}
        </section>

        {/* Branding */}
        <section id="sec-branding">
          <div className="flex items-end justify-between gap-3 border-b border-line pb-4">
            <div>
              <span className="eyebrow">Branding</span>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">Your login link & logo</h2>
            </div>
            <button onClick={() => setEditing((v) => !v)} className="u-link shrink-0 text-sm font-semibold text-accent">
              {editing ? 'Close' : 'Edit branding'}
            </button>
          </div>
          <div className="mt-5 flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-3">
            <span className="truncate text-sm text-ink">{loginLink}</span>
            <button
              onClick={() => copy(loginLink, 'login-link')}
              className="press ring-focus ml-auto shrink-0 rounded-lg bg-accent-fill px-3.5 py-1.5 text-xs font-semibold text-canvas"
            >
              {copied === 'login-link' ? 'Copied' : 'Copy link'}
            </button>
          </div>
          <p className="mt-2 text-sm text-muted">
            Share this link with your professors and students, the login page shows your {university.name} logo.
          </p>
          {editing && <BrandingEditor university={university} onUpdated={onUpdated} />}
        </section>
      </div>

      {rosterId && <RosterModal classId={rosterId} onClose={() => setRosterId(null)} />}
    </AppShell>
  );
}

function AdminCommandCenter({
  university,
  overview,
  codes,
  totals,
}: {
  university: University;
  overview: AdminOverview | null;
  codes: ProfessorCode[];
  totals: AdminOverview['totals'];
}) {
  const professors = overview?.professors ?? [];
  const classes = overview?.classes ?? [];
  const usedCodes = codes.filter((code) => code.usedByEmail).length;
  const unusedCodes = Math.max(0, codes.length - usedCodes);
  const codeUsePct = codes.length > 0 ? Math.round((usedCodes / codes.length) * 100) : 0;
  const professorsWithClasses = professors.filter((professor) => professor.classes > 0).length;
  const professorActivationPct = totals.professors > 0 ? Math.round((professorsWithClasses / totals.professors) * 100) : 0;
  const classesWithStudents = classes.filter((klass) => klass.enrolled > 0).length;
  const classActivationPct = totals.classes > 0 ? Math.round((classesWithStudents / totals.classes) * 100) : 0;
  const completionPct = totals.students > 0 ? Math.round((totals.completions / totals.students) * 100) : 0;
  const avgStudentsPerClass = totals.classes > 0 ? Math.round((totals.students / totals.classes) * 10) / 10 : 0;
  const classesPerProfessor = totals.professors > 0 ? Math.round((totals.classes / totals.professors) * 10) / 10 : 0;
  const professorsWithoutClass = professors.filter((professor) => professor.classes === 0);
  const emptyClasses = classes.filter((klass) => klass.enrolled === 0);
  const noCompletionClasses = classes.filter((klass) => klass.enrolled > 0 && klass.completed === 0);
  const examOpenClasses = classes.filter((klass) => klass.examOpen).length;
  const zeroCompletionRiskPct = totals.classes > 0 ? Math.round((noCompletionClasses.length / totals.classes) * 100) : 0;
  const emptyClassRiskPct = totals.classes > 0 ? Math.round((emptyClasses.length / totals.classes) * 100) : 0;
  const topClasses = classes
    .slice()
    .sort((a, b) => classCompletionPct(b) - classCompletionPct(a) || b.enrolled - a.enrolled)
    .slice(0, 3);
  const priorities = [
    unusedCodes > 0
      ? {
          title: `${unusedCodes} professor invite${unusedCodes === 1 ? '' : 's'} unused`,
          body: 'Follow up or revoke stale codes so the invitation list stays intentional.',
          tone: 'warn' as const,
        }
      : null,
    professorsWithoutClass.length > 0
      ? {
          title: `${professorsWithoutClass.length} professor${professorsWithoutClass.length === 1 ? '' : 's'} without a class`,
          body: 'Help them publish a first course so students can enroll.',
          tone: 'warn' as const,
        }
      : null,
    emptyClasses.length > 0
      ? {
          title: `${emptyClasses.length} class${emptyClasses.length === 1 ? '' : 'es'} with no students`,
          body: 'These classes need join-code distribution or roster follow-up.',
          tone: 'warn' as const,
        }
      : null,
    noCompletionClasses.length > 0
      ? {
          title: `${noCompletionClasses.length} active class${noCompletionClasses.length === 1 ? '' : 'es'} with no completions`,
          body: 'Students enrolled, but progress has not converted into course completion.',
          tone: 'neutral' as const,
        }
      : null,
  ].filter(Boolean) as Array<{ title: string; body: string; tone: 'warn' | 'neutral' }>;
  const modeAnalytics: ModeAnalyticsColumn[] = [
    {
      eyebrow: 'Create mode',
      title: 'Institution production',
      value: `${classesPerProfessor}`,
      detail: 'classes per activated professor',
      icon: <SparklesIcon className="h-4 w-4" />,
      rows: [
        { label: 'Professor activation', value: `${professorActivationPct}%`, pct: professorActivationPct },
        { label: 'Class production', value: totals.classes.toLocaleString(), pct: Math.min(100, totals.classes * 12) },
        { label: 'Invite utilization', value: `${codeUsePct}%`, pct: codeUsePct, tone: unusedCodes > 0 ? 'warn' : 'good' },
      ],
      signals: ['Professor codes', 'University branding', 'Course publishing', 'Admin audit view'],
      tone: unusedCodes > 0 || professorsWithoutClass.length > 0 ? 'warn' : undefined,
    },
    {
      eyebrow: 'Learn mode',
      title: 'Outcome intelligence',
      value: `${completionPct}%`,
      detail: `${totals.completions}/${totals.students || 0} learners completed`,
      icon: <AwardIcon className="h-4 w-4" />,
      rows: [
        { label: 'Class enrollment', value: `${classActivationPct}%`, pct: classActivationPct },
        { label: 'Student completion', value: `${completionPct}%`, pct: completionPct, tone: completionPct > 0 ? 'good' : 'neutral' },
        { label: 'No-completion risk', value: `${zeroCompletionRiskPct}%`, pct: zeroCompletionRiskPct, tone: zeroCompletionRiskPct > 0 ? 'warn' : 'good' },
      ],
      signals: ['Embedded insights', 'Roster drilldown', 'Exam gates', 'Completion funnel'],
      tone: emptyClassRiskPct > 0 || zeroCompletionRiskPct > 0 ? 'warn' : undefined,
    },
  ];
  const executiveInsights: ModeAnalyticsInsight[] = [
    {
      label: 'Executive priority',
      value: priorities.length > 0 ? `${priorities.length}` : 'Clear',
      detail: priorities[0]?.title ?? 'No activation or completion gaps detected right now.',
      tone: priorities.length > 0 ? 'warn' : 'good',
    },
    {
      label: 'Activation health',
      value: `${professorActivationPct}%`,
      detail: `${professorsWithClasses}/${totals.professors || 0} professors have published at least one class.`,
      tone: professorActivationPct > 0 ? 'good' : 'neutral',
    },
    {
      label: 'Outcome velocity',
      value: `${completionPct}%`,
      detail: totals.students > 0 ? `${totals.completions}/${totals.students} enrolled learners completed.` : 'Enrollments will turn this into a learner-outcome metric.',
      tone: completionPct > 0 ? 'good' : 'neutral',
    },
  ];

  return (
    <section className="relative overflow-hidden px-4 pb-8 pt-10 sm:px-6">
      <div className="hero-glow pointer-events-none absolute inset-x-0 top-0 -z-10 h-72" />
      <div className="mx-auto max-w-6xl rounded-[26px] border border-line bg-surface p-4 shadow-soft sm:p-5 lg:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="eyebrow">{university.name}</span>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
              Institution command center
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
              Adoption, activation, invitations, and student movement in one operational view.
            </p>
          </div>
          <span
            className={[
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold',
              priorities.length > 0 ? 'bg-warn-soft text-warn' : 'bg-success-soft text-success',
            ].join(' ')}
          >
            {priorities.length > 0 ? <AlertTriangleIcon className="h-3.5 w-3.5" /> : <CheckIcon className="h-3.5 w-3.5" />}
            {priorities.length > 0 ? `${priorities.length} priority signals` : 'No priority gaps'}
          </span>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <AdminMetric icon={<UserIcon className="h-3.5 w-3.5" />} label="Professors" value={String(totals.professors)} sub={`${professorActivationPct}% activated`} />
          <AdminMetric icon={<LayersIcon className="h-3.5 w-3.5" />} label="Classes" value={String(totals.classes)} sub={`${classActivationPct}% with students`} />
          <AdminMetric icon={<BookIcon className="h-3.5 w-3.5" />} label="Students" value={String(totals.students)} sub={`${avgStudentsPerClass}/class avg`} />
          <AdminMetric icon={<AwardIcon className="h-3.5 w-3.5" />} label="Completions" value={String(totals.completions)} sub={`${completionPct}% learner completion`} tone={completionPct > 0 ? 'good' : 'neutral'} />
        </div>

        <div className="mt-5">
          <ModeAnalyticsPanel
            title="Create/Learn institution intelligence"
            subtitle="Creation activation and learner outcomes are separated into executive lanes, with risk bars for invites, empty classes, and no-completion cohorts."
            columns={modeAnalytics}
            insights={executiveInsights}
          />
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.78fr)]">
          <div className="rounded-2xl border border-line bg-canvas p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-bold text-ink">Activation funnel</h2>
              <span className="text-xs text-muted">{examOpenClasses} exams open</span>
            </div>
            <div className="mt-4 space-y-3">
              <ProgressRow label="Professor to class" value={professorsWithClasses} total={totals.professors} pct={professorActivationPct} />
              <ProgressRow label="Class to enrolled students" value={classesWithStudents} total={totals.classes} pct={classActivationPct} />
              <ProgressRow label="Student to completion" value={totals.completions} total={totals.students} pct={completionPct} />
              <ProgressRow label="Professor invite use" value={usedCodes} total={codes.length} pct={codeUsePct} />
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <AdminMini label="Unused codes" value={String(unusedCodes)} tone={unusedCodes > 0 ? 'warn' : 'neutral'} />
              <AdminMini label="Empty classes" value={String(emptyClasses.length)} tone={emptyClasses.length > 0 ? 'warn' : 'neutral'} />
              <AdminMini label="No completions" value={String(noCompletionClasses.length)} tone={noCompletionClasses.length > 0 ? 'warn' : 'neutral'} />
            </div>
          </div>

          <div className="rounded-2xl border border-line bg-canvas p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-bold text-ink">Ops priorities</h2>
              <ClockIcon className="h-4 w-4 text-accent" />
            </div>
            {priorities.length > 0 ? (
              <ul className="mt-3 space-y-2.5">
                {priorities.slice(0, 4).map((item) => (
                  <li key={item.title} className="rounded-xl border border-line bg-surface px-3.5 py-3">
                    <p className={['text-sm font-semibold', item.tone === 'warn' ? 'text-warn' : 'text-ink'].join(' ')}>
                      {item.title}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-muted">{item.body}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 rounded-xl border border-success/30 bg-success-soft px-4 py-6 text-center text-sm text-success">
                Invitations, classes, and student activation are all clean right now.
              </p>
            )}
          </div>
        </div>

        {topClasses.length > 0 && (
          <div className="mt-5 rounded-2xl border border-line bg-canvas p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-bold text-ink">Top class momentum</h2>
              <span className="text-xs text-muted">completion-weighted</span>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              {topClasses.map((klass) => (
                <div key={klass.id} className="rounded-xl border border-line bg-surface px-3.5 py-3">
                  <p className="line-clamp-1 text-sm font-semibold text-ink">{klass.title}</p>
                  <p className="mt-0.5 line-clamp-1 text-xs text-muted">{klass.professorEmail}</p>
                  <div className="mt-3 flex items-center justify-between text-[11px] text-faint">
                    <span>{klass.completed}/{klass.enrolled} completed</span>
                    <span className="font-semibold text-accent">{classCompletionPct(klass)}%</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line">
                    <div className="h-full rounded-full bg-accent-fill" style={{ width: `${classCompletionPct(klass)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-5">
          <AdminInsights embedded />
        </div>
      </div>
    </section>
  );
}

function classCompletionPct(klass: { enrolled: number; completed: number }): number {
  return klass.enrolled > 0 ? Math.round((klass.completed / klass.enrolled) * 100) : 0;
}

function ProgressRow({ label, value, total, pct }: { label: string; value: number; total: number; pct: number }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="font-medium text-ink">{label}</span>
        <span className="text-muted">
          {value}/{total} <span className="font-semibold text-accent">{pct}%</span>
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-accent-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function AdminMetric({
  icon,
  label,
  value,
  sub,
  tone = 'neutral',
}: {
  icon: ReactNode;
  label: string;
  value: string;
  sub: string;
  tone?: 'good' | 'neutral';
}) {
  return (
    <div className={['rounded-2xl border px-4 py-3', tone === 'good' ? 'border-success/30 bg-success-soft' : 'border-line bg-canvas'].join(' ')}>
      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-faint">
        {icon}
        {label}
      </p>
      <p className={['mt-1 text-2xl font-black tabular-nums', tone === 'good' ? 'text-success' : 'text-ink'].join(' ')}>
        {value}
      </p>
      <p className="text-[11px] text-muted">{sub}</p>
    </div>
  );
}

function AdminMini({ label, value, tone }: { label: string; value: string; tone: 'warn' | 'neutral' }) {
  return (
    <div className={['rounded-xl border px-3 py-2 text-center', tone === 'warn' ? 'border-warn/35 bg-warn-soft' : 'border-line bg-surface'].join(' ')}>
      <p className={['text-xl font-black tabular-nums', tone === 'warn' ? 'text-warn' : 'text-ink'].join(' ')}>{value}</p>
      <p className="text-[10px] uppercase tracking-[0.12em] text-faint">{label}</p>
    </div>
  );
}

function BrandingEditor({ university, onUpdated }: { university: University; onUpdated: (u: University) => void }) {
  const [name, setName] = useState(university.name);
  const [logo, setLogo] = useState<string | null>(university.logoUrl);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > LOGO_MAX_BYTES) {
      setError('Logo image is too large (max 600 KB).');
      return;
    }
    setError(null);
    setLogo(await readFileAsDataUrl(file));
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/university', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), logoUrl: logo }),
      });
      const data = (await res.json()) as { university?: University; error?: string };
      if (!res.ok || !data.university) throw new Error(data.error ?? 'Could not save.');
      onUpdated(data.university);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4 rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex-1">
          <label className="block text-xs font-semibold uppercase tracking-wider text-faint">University name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="ring-focus mt-1.5 w-full rounded-xl border border-line bg-canvas px-3.5 py-2.5 text-[15px] text-ink focus:border-accent/60 focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl border border-line bg-canvas">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="Logo" className="h-full w-full object-contain" />
            ) : (
              <SparklesIcon className="h-5 w-5 text-faint" />
            )}
          </span>
          <label className="press ring-focus cursor-pointer rounded-lg border border-line px-3.5 py-2 text-sm font-semibold text-ink hover:border-accent/40">
            Change
            <input type="file" accept="image/*" onChange={onFile} className="hidden" />
          </label>
        </div>
        <button
          onClick={save}
          disabled={saving || !name.trim()}
          className="press ring-focus rounded-lg bg-accent-fill px-4 py-2.5 text-sm font-semibold text-canvas disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      {error && <p className="mt-3 text-sm text-accent">{error}</p>}
    </div>
  );
}

function RosterModal({ classId, onClose }: { classId: string; onClose: () => void }) {
  const [data, setData] = useState<{ title: string; joinCode: string; lessonCount: number; roster: RosterEntry[] } | null>(
    null,
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch(`/api/admin/classes/${classId}`)
      .then((r) => r.json())
      .then((d) => {
        if (alive) setData(d?.roster ? d : { title: '', joinCode: '', lessonCount: 0, roster: [] });
      })
      .catch(() => {
        if (alive) setData({ title: '', joinCode: '', lessonCount: 0, roster: [] });
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [classId]);

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      eyebrow={`Roster${data?.joinCode ? ` · code ${data.joinCode}` : ''}`}
      title={data?.title || 'Class'}
    >
        {loading ? (
          <p role="status" aria-live="polite" className="text-sm text-muted">Loading students…</p>
        ) : data && data.roster.length > 0 ? (
          <div className="overflow-hidden rounded-2xl border border-line">
            <table className="w-full text-left text-sm">
              <thead className="bg-elevated text-[11px] uppercase tracking-wider text-faint">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Student</th>
                  <th className="px-4 py-2.5 font-semibold">Lessons</th>
                  <th className="px-4 py-2.5 font-semibold">Exam</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.roster.map((s) => {
                  const pct = data.lessonCount ? Math.round((s.completedLessons / data.lessonCount) * 100) : 0;
                  return (
                    <tr key={s.studentId}>
                      <td className="max-w-[180px] truncate px-4 py-2.5 text-ink">{s.email}</td>
                      <td className="px-4 py-2.5 text-muted">
                        {s.completedLessons}/{data.lessonCount} · {pct}%
                      </td>
                      <td className="px-4 py-2.5 text-muted">{s.examScore == null ? '--' : `${s.examScore}/${s.examTotal}`}</td>
                      <td className="px-4 py-2.5">
                        {s.completedAt ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-bold text-accent">
                            <CheckIcon className="h-3 w-3" /> Completed
                          </span>
                        ) : (
                          <span className="text-[11px] text-faint">In progress</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted">No students enrolled yet.</p>
        )}
    </Modal>
  );
}
