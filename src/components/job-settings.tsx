'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from './button';
import { useHashView } from './use-hash-view';
import { CheckIcon, LockIcon } from './icons';

/**
 * JobPilot settings.
 *
 * The gap this closes: onboarding collected everything once and then nothing
 * could change it. A candidate who moved city, changed their phone number, or
 * wanted a different résumé had no route back in.
 *
 * So every stored answer is editable here, and each edit is re-saved as
 * USER_VERIFIED — the same provenance the wizard writes, which is the only one
 * Autopilot may act on unattended.
 */

type Answer = {
  intent: string;
  value: string;
  provenance: string;
  sensitivity: string;
  autopilotOk: boolean;
  updatedAt: number;
};

type Payload = {
  settings: {
    optimization: 'off' | 'honest' | 'aggressive';
    autoApprove: boolean;
    reviewBefore: boolean;
    autoSubmit: boolean;
    publicPortfolio: boolean;
    emailRecs: boolean;
    emailProduct: boolean;
    timezone: string;
  };
  answers: Answer[];
  resume: { name: string; chars: number } | null;
  billing: { isPro: boolean; plan: string | null; status: string | null; currentPeriodEnd: number | null; purchases: string[] };
  applyEmail: string | null;
  applyDomainConfigured: boolean;
  referralCode: string;
  sources: { source: string; open: number }[];
  account: { email: string; role: string; accountKind: string };
  mail: {
    id: string;
    fromName: string;
    subject: string;
    otp: string;
    company: string;
    receivedAt: number;
    forwarded: boolean;
  }[];
  mailForwardingConfigured: boolean;
  /** ATS vendors enabled for real submission, named so the copy cannot drift. */
  submitVendors: string[];
};

/**
 * Sections, each with a slug for the URL.
 *
 * The slug is the identity and the label is presentation. They were the same
 * string before, which meant a section could not appear in a URL without
 * carrying an accent and a space — and renaming one in the interface would have
 * silently broken every link to it.
 */
const SECTIONS = [
  { slug: 'apply-settings', label: 'Apply settings' },
  { slug: 'your-details', label: 'Your details' },
  { slug: 'answer-book', label: 'Answer book' },
  { slug: 'verifications', label: 'Verifications' },
  { slug: 'resume', label: 'Résumé' },
  { slug: 'application-email', label: 'Application email' },
  { slug: 'public-portfolio', label: 'Public portfolio' },
  { slug: 'job-boards', label: 'Job boards' },
  { slug: 'billing', label: 'Plans & billing' },
  { slug: 'referrals', label: 'Referrals' },
  { slug: 'email-notifications', label: 'Email notifications' },
  { slug: 'account', label: 'Account' },
] as const;

type Section = (typeof SECTIONS)[number]['slug'];
const SECTION_SLUGS = SECTIONS.map((s) => s.slug);

/**
 * The browser's autofill vocabulary, per intent.
 *
 * Without these, a text input is anonymous: the browser and any password
 * manager have no idea it wants a street address, so nothing is ever offered
 * and the candidate retypes what their browser already knows. The tokens are
 * the WHATWG autofill field names, which is what browsers actually match on —
 * `autocomplete="address"` does nothing, `street-address` works.
 */
const INTENT_AUTOCOMPLETE: Record<string, string> = {
  'PROFILE.FULL_NAME': 'name',
  'PROFILE.FIRST_NAME': 'given-name',
  'PROFILE.LAST_NAME': 'family-name',
  'PROFILE.EMAIL': 'email',
  'PROFILE.PHONE': 'tel',
  'PROFILE.ADDRESS': 'street-address',
  'PROFILE.CITY': 'address-level2',
  'PROFILE.STATE': 'address-level1',
  'PROFILE.ZIP': 'postal-code',
  'PROFILE.COUNTRY': 'country-name',
  'PROFILE.WEBSITE': 'url',
  'PROFILE.LINKEDIN': 'url',
  'PROFILE.GITHUB': 'url',
};

/** Human labels for canonical intents. The raw keys are for machines. */
const INTENT_LABEL: Record<string, string> = {
  'PROFILE.FULL_NAME': 'Full name',
  'PROFILE.FIRST_NAME': 'First name',
  'PROFILE.LAST_NAME': 'Last name',
  'PROFILE.EMAIL': 'Email',
  'PROFILE.PHONE': 'Phone',
  'PROFILE.ADDRESS': 'Address',
  'PROFILE.CITY': 'City',
  'PROFILE.STATE': 'State',
  'PROFILE.ZIP': 'ZIP / postal code',
  'PROFILE.COUNTRY': 'Country',
  'PROFILE.LINKEDIN': 'LinkedIn',
  'PROFILE.GITHUB': 'GitHub',
  'PROFILE.WEBSITE': 'Website',
  'PROFILE.NOTES': 'Notes for applications',
  'WORK_AUTH.AUTHORIZED': 'Authorized to work',
  'WORK_AUTH.SPONSORSHIP': 'Requires sponsorship',
  'LOGISTICS.RELOCATION': 'Willing to relocate',
  'LOGISTICS.ONSITE': 'Open to in-person work',
  'LOGISTICS.START_DATE': 'Can start immediately',
  'LOGISTICS.TRANSPORT': 'Reliable transportation',
  'COMPENSATION.EXPECTED': 'Expected compensation',
  'EDUCATION.GRADUATION': 'Graduation date',
  'CLEARANCE.SECURITY': 'Security clearance',
  'ACCOMMODATION.NEEDED': 'Workplace accommodations',
  'BACKGROUND.FOREIGN_TIES': 'Family ties to foreign governments',
  'DEMOGRAPHIC.VOLUNTARY': 'Diversity & inclusion',
  'HISTORY.PREVIOUS_EMPLOYMENT': 'Previously worked there',
  'HISTORY.REFERRAL': 'How you heard about the role',
};

export function JobSettings() {
  const [data, setData] = useState<Payload | null>(null);
  /* Depth 2: `#jobs/settings/answer-book`. A section is where someone was,
     so a refresh should leave them there. */
  const [section, setSection] = useHashView<Section>(2, SECTION_SLUGS, 'apply-settings');
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    fetch('/api/jobs/settings')
      .then(async (r) => {
        const d = (await r.json()) as Payload & { error?: string };
        if (!alive) return;
        if (!r.ok) setError(d.error ?? 'Could not load settings.');
        else setData(d);
      })
      .catch(() => {
        if (alive) setError('Could not load settings.');
      });
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  const patch = useCallback(async (body: Record<string, unknown>) => {
    setError(null);
    try {
      const res = await fetch('/api/jobs/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = (await res.json()) as { error?: string };
        setError(d.error ?? 'That change did not save.');
        return false;
      }
      return true;
    } catch {
      setError('That change did not save.');
      return false;
    }
  }, []);

  if (error && !data) return <p className="rounded-2xl border border-line bg-canvas p-6 text-sm text-muted">{error}</p>;
  if (!data)
    return (
      <p role="status" aria-live="polite" className="rounded-2xl border border-line bg-canvas p-6 text-sm text-muted">
        Loading settings…
      </p>
    );

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
      <nav aria-label="Settings sections">
        <h2 className="text-xl font-bold text-ink">Settings</h2>
        <p className="mt-0.5 text-sm text-muted">Manage your account and integrations.</p>
        <ul className="mt-5 space-y-0.5">
          {SECTIONS.map((s) => (
            <li key={s.slug}>
              <button
                type="button"
                onClick={() => setSection(s.slug)}
                aria-current={section === s.slug ? 'page' : undefined}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                  section === s.slug ? 'bg-mint font-semibold text-accent' : 'text-muted hover:bg-elevated hover:text-ink'
                }`}
              >
                {s.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="min-w-0">
        {error && (
          <p role="alert" className="mb-4 text-sm font-semibold text-danger">
            {error}
          </p>
        )}

        {section === 'apply-settings' && <ApplySettings data={data} patch={patch} reload={() => setReloadKey((k) => k + 1)} />}
        {section === 'your-details' && <YourDetails answers={data.answers} patch={patch} reload={() => setReloadKey((k) => k + 1)} />}
        {section === 'answer-book' && <AnswerBook />}
        {section === 'verifications' && <Verifications />}
        {section === 'resume' && <ResumeSection resume={data.resume} reload={() => setReloadKey((k) => k + 1)} />}
        {section === 'application-email' && <ApplyEmail data={data} />}
        {section === 'public-portfolio' && (
          <Simple
            title="Public portfolio"
            sub="Share a public page of your experience and projects."
            rows={[
              {
                label: 'Make my profile public',
                value: data.settings.publicPortfolio,
                onChange: async (v: boolean) => {
                  if (await patch({ publicPortfolio: v })) setReloadKey((k) => k + 1);
                },
              },
            ]}
            footer={data.settings.publicPortfolio ? 'Anyone with the link can see it.' : 'Your portfolio is private. Only you can see it.'}
          />
        )}
        {section === 'job-boards' && <JobBoards sources={data.sources} />}
        {section === 'billing' && <Billing billing={data.billing} reload={() => setReloadKey((k) => k + 1)} />}
        {section === 'account' && <Account account={data.account} />}
        {section === 'referrals' && <Referrals code={data.referralCode} />}
        {section === 'email-notifications' && (
          <Simple
            title="Email notifications"
            sub="A morning digest of your new matches."
            rows={[
              {
                label: 'Job recommendations',
                value: data.settings.emailRecs,
                onChange: async (v: boolean) => {
                  if (await patch({ emailRecs: v })) setReloadKey((k) => k + 1);
                },
              },
              {
                label: 'Product updates',
                hint: 'New features and announcements.',
                value: data.settings.emailProduct,
                onChange: async (v: boolean) => {
                  if (await patch({ emailProduct: v })) setReloadKey((k) => k + 1);
                },
              },
            ]}
            footer="Every send carries an unsubscribe link."
          />
        )}
      </div>
    </div>
  );
}

/* ── Sections ────────────────────────────────────────────────────────────── */

type BookEntry = {
  intent: string;
  question: string;
  value: string;
  provenance: string;
  sensitivity: string;
  auto: boolean;
  updatedAt: number;
  source: 'learned' | 'standard';
};

/**
 * Every answer that goes on an application, in one editable place.
 *
 * ## Why this screen exists
 *
 * The vault fills forms on the candidate's behalf, in their name. Before this
 * there was no way to read the whole set, correct one, or remove one - the
 * answers were only visible one at a time, as they happened to come up on a
 * receipt. A store of statements made on someone's behalf that they cannot
 * inspect is not a feature.
 *
 * Two groups, because they carry different weight. Standard questions are ones
 * the system recognises in any wording. Learned ones are questions an employer
 * asked that nothing recognised, answered once by the candidate and matched
 * literally from then on.
 *
 * The file view is the same data as Markdown. It is there for the candidate who
 * would rather fix six answers in a text editor than click through six rows,
 * and because an answer set you can export is one you can audit.
 */
function AnswerBook() {
  const [entries, setEntries] = useState<BookEntry[] | null>(null);
  const [reloadKey] = useState(0);
  const [markdown, setMarkdown] = useState('');
  const [draft, setDraft] = useState('');
  const [mode, setMode] = useState<'list' | 'file'>('list');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [value, setValue] = useState('');

  const load = useCallback(async () => {
    const res = await fetch('/api/jobs/answers');
    const d = (await res.json()) as { entries?: BookEntry[]; markdown?: string };
    setEntries(d.entries ?? []);
    setMarkdown(d.markdown ?? '');
    setDraft(d.markdown ?? '');
  }, []);

  useEffect(() => {
    let alive = true;
    fetch('/api/jobs/answers')
      .then((r) => r.json() as Promise<{ entries?: BookEntry[]; markdown?: string }>)
      .then((d) => {
        if (!alive) return;
        setEntries(d.entries ?? []);
        setMarkdown(d.markdown ?? '');
        setDraft(d.markdown ?? '');
      })
      .catch(() => {
        if (alive) setEntries([]);
      });
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  const save = async (question: string, next: string) => {
    setBusy(true);
    await fetch('/api/jobs/answers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, value: next }),
    });
    setEditing(null);
    await load();
    setBusy(false);
    setNote('Saved.');
  };

  const forget = async (intent: string) => {
    setBusy(true);
    await fetch(`/api/jobs/answers?intent=${encodeURIComponent(intent)}`, { method: 'DELETE' });
    await load();
    setBusy(false);
    setNote('Removed. The next application that asks will check with you.');
  };

  const applyFile = async () => {
    setBusy(true);
    const res = await fetch('/api/jobs/answers', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markdown: draft }),
    });
    const d = (await res.json()) as { message?: string };
    await load();
    setBusy(false);
    setNote(d.message ?? 'Saved.');
  };

  if (!entries) {
    return (
      <>
        <Head title="Answer book" sub="Everything Autopilot may say on your applications." />
        <p role="status" aria-live="polite" className="text-sm text-muted">
          Loading your answers…
        </p>
      </>
    );
  }

  const groups: { key: BookEntry['source']; title: string; blurb: string }[] = [
    {
      key: 'standard',
      title: 'Standard questions',
      blurb: 'Recognised in any wording, on any board.',
    },
    {
      key: 'learned',
      title: 'Learned from forms you filled',
      blurb: 'Questions nothing recognised. You answered once; they fill from now on.',
    },
  ];

  return (
    <>
      <Head
        title="Answer book"
        sub="Everything Autopilot may say on your applications. Edit any answer and it applies to every future one."
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setMode('list')}
          className={`h-9 rounded-[var(--mf-radius-md)] px-3 text-sm font-semibold ${
            mode === 'list' ? 'bg-mint text-accent' : 'text-muted hover:bg-elevated'
          }`}
        >
          Answers
        </button>
        <button
          type="button"
          onClick={() => {
            setDraft(markdown);
            setMode('file');
          }}
          className={`h-9 rounded-[var(--mf-radius-md)] px-3 text-sm font-semibold ${
            mode === 'file' ? 'bg-mint text-accent' : 'text-muted hover:bg-elevated'
          }`}
        >
          Edit as a file
        </button>
        <a
          href="/api/jobs/answers?format=md"
          className="ml-auto text-sm font-semibold text-accent underline underline-offset-2"
        >
          Download
        </a>
      </div>

      {note && <p className="mb-4 text-sm font-semibold text-accent">{note}</p>}

      {mode === 'file' ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted">
            Edit the answers below and save. Keep each <code className="text-ink">key:</code> line — it is how an edited
            answer finds its way back to the right question. Anything that does not parse is skipped rather than guessed
            at.
          </p>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            spellCheck={false}
            rows={22}
            className="w-full rounded-[var(--mf-radius-lg)] border border-line bg-canvas p-4 font-mono text-[13px] leading-relaxed text-ink outline-none focus:border-accent"
          />
          <div className="flex items-center gap-3">
            <Button variant="primary" disabled={busy || draft === markdown} onClick={applyFile}>
              {busy ? 'Saving…' : 'Save file'}
            </Button>
            <button type="button" onClick={() => setDraft(markdown)} className="text-sm text-muted underline">
              Revert
            </button>
          </div>
        </div>
      ) : entries.length === 0 ? (
        <p className="rounded-[var(--mf-radius-lg)] border border-line bg-canvas p-5 text-sm text-muted">
          Nothing here yet. Finish setup, or answer a question on an Auto Apply receipt, and it will appear here.
        </p>
      ) : (
        <div className="flex flex-col gap-7">
          {groups.map((g) => {
            const rows = entries.filter((e) => e.source === g.key);
            if (rows.length === 0) return null;
            return (
              <section key={g.key}>
                <h3 className="text-sm font-bold text-ink">{g.title}</h3>
                <p className="mt-0.5 text-xs text-muted">{g.blurb}</p>

                <ul className="mt-3 divide-y divide-[var(--color-line)] rounded-[var(--mf-radius-lg)] border border-line">
                  {rows.map((e) => (
                    <li key={e.intent} className="px-4 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-ink">{e.question}</p>

                          {editing === e.intent ? (
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <input
                                autoFocus
                                value={value}
                                onChange={(ev) => setValue(ev.target.value)}
                                onKeyDown={(ev) => {
                                  if (ev.key === 'Enter' && value.trim()) void save(e.question, value);
                                  if (ev.key === 'Escape') setEditing(null);
                                }}
                                className="h-9 min-w-0 flex-1 rounded-[var(--mf-radius-md)] border border-line bg-canvas px-3 text-sm text-ink outline-none focus:border-accent"
                              />
                              <Button
                                variant="primary"
                                disabled={busy || !value.trim()}
                                onClick={() => save(e.question, value)}
                              >
                                Save
                              </Button>
                              <button type="button" onClick={() => setEditing(null)} className="text-xs text-muted underline">
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <p className="mt-0.5 break-words text-sm text-muted">{e.value}</p>
                          )}

                          {!e.auto && (
                            <p className="mt-1 text-[11px] text-faint">
                              {e.sensitivity === 'LEGAL_ATTESTATION'
                                ? 'Only you can agree to this, so it is always handed back to you.'
                                : 'Stored, but Autopilot checks with you before using it.'}
                            </p>
                          )}
                        </div>

                        {editing !== e.intent && (
                          <div className="flex shrink-0 items-center gap-3">
                            <button
                              type="button"
                              onClick={() => {
                                setEditing(e.intent);
                                setValue(e.value);
                              }}
                              className="text-xs font-semibold text-accent underline underline-offset-2"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => forget(e.intent)}
                              className="text-xs text-muted underline underline-offset-2 hover:text-danger"
                            >
                              Remove
                            </button>
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

type Authorization = {
  id: string;
  type: string;
  scope: string;
  authorizedAt: number;
  revokedAt: number | null;
  expiresAt: number | null;
};

/**
 * The two assertions only you can make.
 *
 * Everything else in settings is a preference, where wrong is inconvenient.
 * These change what the system will say in your name to an employer, so each
 * one is its own explicit act rather than a default or a side effect.
 */
function Verifications() {
  const [history, setHistory] = useState<{ employment: boolean; consulting: boolean; clients: boolean; otherEmployers: string } | null>(null);
  const [auths, setAuths] = useState<Authorization[]>([]);
  const [others, setOthers] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const d = (await (await fetch('/api/jobs/verification')).json()) as {
      history?: typeof history;
      authorizations?: Authorization[];
    };
    if (d.history) {
      setHistory(d.history);
      setOthers(d.history.otherEmployers);
    }
    setAuths(d.authorizations ?? []);
  }, []);

  useEffect(() => {
    let alive = true;
    fetch('/api/jobs/verification')
      .then((r) => r.json() as Promise<{ history?: typeof history; authorizations?: Authorization[] }>)
      .then((d) => {
        if (!alive) return;
        if (d.history) {
          setHistory(d.history);
          setOthers(d.history.otherEmployers);
        }
        setAuths(d.authorizations ?? []);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const post = async (body: Record<string, unknown>, message: string) => {
    setBusy(true);
    const res = await fetch('/api/jobs/verification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const d = (await res.json()) as { error?: string };
    await load();
    setBusy(false);
    setNote(res.ok ? message : (d.error ?? 'That did not save.'));
  };

  if (!history) {
    return (
      <>
        <Head title="Verifications" sub="The two things only you can confirm." />
        <p role="status" aria-live="polite" className="text-sm text-muted">Loading…</p>
      </>
    );
  }

  const allComplete = history.employment && history.consulting && history.clients;
  const policyAuth = auths.find((a) => a.type === 'POLICY' && a.revokedAt == null);

  return (
    <>
      <Head
        title="Verifications"
        sub="Two confirmations that change what Autopilot may say in your name. Neither is assumed, and neither can be set by anything but you."
      />

      {note && <p className="mb-4 text-sm font-semibold text-accent">{note}</p>}

      <section className="mb-7 rounded-[var(--mf-radius-lg)] border border-line p-5">
        <h3 className="text-sm font-bold text-ink">Is your work history complete?</h3>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          Applications constantly ask <em>&ldquo;have you worked here before?&rdquo;</em>. Autopilot can only answer
          <strong className="text-ink"> no</strong> if you confirm the record below is complete — a résumé leaves out
          short contracts and agency work as a matter of course, and &ldquo;not on my CV&rdquo; is not the same claim as
          &ldquo;never happened&rdquo;. Until you confirm, every one of those questions comes to you.
        </p>

        <div className="mt-4 flex flex-col gap-3">
          {([
            ['employment', 'Every employer I have worked for is on my résumé or listed below'],
            ['consulting', 'Every consulting or contract engagement is included'],
            ['clients', 'Every client I have worked with directly is included'],
          ] as const).map(([key, label]) => (
            <label key={key} className="flex items-start gap-3 text-sm text-ink">
              <input
                type="checkbox"
                checked={history[key]}
                disabled={busy}
                onChange={(e) => void post({ action: 'history', [key]: e.target.checked }, 'Saved.')}
                className="mt-0.5 size-4 shrink-0 accent-[var(--color-accent-fill)]"
              />
              <span>{label}</span>
            </label>
          ))}
        </div>

        <div className="mt-4">
          <label htmlFor="other-employers" className="block text-xs font-semibold uppercase tracking-[0.1em] text-faint">
            Anyone not on your résumé
          </label>
          <input
            id="other-employers"
            value={others}
            disabled={busy}
            onChange={(e) => setOthers(e.target.value)}
            onBlur={() => {
              if (others !== history.otherEmployers) void post({ action: 'history', otherEmployers: others }, 'Saved.');
            }}
            placeholder="Acme Consulting, Globex, Initech"
            className="mt-1.5 h-10 w-full rounded-[var(--mf-radius-md)] border border-line bg-canvas px-3 text-sm text-ink outline-none focus:border-accent"
          />
          <p className="mt-1 text-xs text-muted">
            Comma separated. Contracts, internships and short engagements count — this is the list a &ldquo;no&rdquo;
            gets checked against.
          </p>
        </div>

        <p className={`mt-4 text-xs font-semibold ${allComplete ? 'text-accent' : 'text-warn'}`}>
          {allComplete
            ? 'Confirmed. Autopilot can answer prior-employment questions.'
            : 'Not confirmed. Those questions will come to you on every application.'}
        </p>
      </section>

      <section className="rounded-[var(--mf-radius-lg)] border border-line p-5">
        <h3 className="text-sm font-bold text-ink">Routine acknowledgements</h3>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          Most application forms end with a candidate privacy notice to tick. Authorising that class lets Autopilot
          acknowledge it without stopping. If an employer rewrites the wording, the authorisation stops matching and the
          application comes back to you.
        </p>

        <p className="mt-3 text-sm leading-relaxed text-muted">
          This covers privacy notices only. Arbitration agreements, background-check consent, IP assignment and
          non-competes can never be authorised this way — they bind you beyond the application, and each one is always
          handed back.
        </p>

        {policyAuth ? (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold text-accent">
              Authorised {new Date(policyAuth.authorizedAt).toLocaleDateString()}
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => void post({ action: 'revoke', id: policyAuth.id }, 'Withdrawn.')}
              className="text-xs text-muted underline underline-offset-2 hover:text-danger"
            >
              Withdraw
            </button>
          </div>
        ) : (
          <Button
            variant="primary"
            disabled={busy}
            onClick={() =>
              void post(
                {
                  action: 'authorize',
                  type: 'POLICY',
                  scope: '*',
                  exactText: 'candidate privacy policy acknowledgement',
                },
                'Authorised. Privacy notices will no longer stop an application.',
              )
            }
          >
            Authorise privacy acknowledgements
          </Button>
        )}
      </section>
    </>
  );
}

function Head({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mb-6">
      <h3 className="text-[22px] font-bold tracking-[-0.01em] text-ink">{title}</h3>
      <p className="mt-1 text-sm text-muted">{sub}</p>
    </div>
  );
}

function ApplySettings({
  data,
  patch,
  reload,
}: {
  data: Payload;
  patch: (b: Record<string, unknown>) => Promise<boolean>;
  reload: () => void;
}) {
  return (
    <>
      <Head title="Apply settings" sub="How your applications are prepared and submitted." />

      <Row label="Résumé optimization">
        <div className="inline-flex overflow-hidden rounded-lg border border-line">
          {(['off', 'honest', 'aggressive'] as const).map((o) => (
            <button
              key={o}
              type="button"
              onClick={async () => {
                if (await patch({ optimization: o })) reload();
              }}
              aria-pressed={data.settings.optimization === o}
              className={`px-3.5 py-1.5 text-sm capitalize transition ${
                data.settings.optimization === o ? 'bg-canvas font-semibold text-ink shadow-[var(--mf-shadow-xs)]' : 'text-muted hover:text-ink'
              }`}
            >
              {o}
            </button>
          ))}
        </div>
      </Row>
      {data.settings.optimization === 'aggressive' && (
        <p className="-mt-2 mb-4 text-xs text-warn">
          Claims we cannot trace to your résumé are blocked by the verifier before anything is sent.
        </p>
      )}

      {/* "Auto-approve edits" used to sit here. It was saved and displayed but
          read by nothing, which is worse than a missing control: it looked
          like a decision the candidate had made. Removed rather than given a
          meaning it never had. */}
      <Toggle
        label="Review before submit"
        hint="Each prepared application waits in Auto Apply for you to approve it."
        value={data.settings.reviewBefore}
        onChange={async (v) => {
          if (await patch({ reviewBefore: v })) reload();
        }}
      />

      {/* The switch that decides whether an employer receives anything.
          Deliberately separate from "review before submit": one is about
          seeing a preview, the other is about sending, and an earlier version
          conflated them so turning off a preview turned on sending. */}
      {data.submitVendors.length === 0 ? (
        /*
         * The control is absent, so say why.
         *
         * It used to render nothing at all when the operator allowlist was
         * empty -- no switch, no gap, no explanation. Someone looking for
         * "Send applications automatically" because the product mentions it
         * found a screen that simply did not contain it, which is
         * indistinguishable from a broken page. An absent control needs a
         * reason more than a present one does.
         */
        <div className="mb-4 rounded-xl border border-line bg-elevated p-4">
          <p className="text-sm font-bold text-ink">Automatic submission is not enabled on this deployment</p>
          <p className="mt-1 text-sm text-muted">
            Sending applications is switched on per applicant tracking system by whoever runs this instance, after that
            path has been reviewed. Until one is enabled, every run stops at a finished application you send yourself —
            so this switch has nothing to control and is hidden rather than shown doing nothing.
          </p>
        </div>
      ) : (
        <div className="mb-4 rounded-xl border border-[var(--color-warn)] bg-[var(--color-warn-soft)] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <span className="min-w-0">
              <span className="block text-sm font-bold text-ink">Send applications automatically</span>
              <span className="mt-0.5 block text-sm text-muted">
                A run that clears every check goes to the employer without asking you again. You keep a receipt of
                each one, and CAPTCHAs or account walls still stop and hand back to you.
              </span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={data.settings.autoSubmit}
              aria-label="Send applications automatically"
              onClick={async () => {
                if (await patch({ autoSubmit: !data.settings.autoSubmit })) reload();
              }}
              className={`relative h-6 w-11 shrink-0 rounded-full transition ${
                data.settings.autoSubmit ? 'bg-[var(--color-warn)]' : 'bg-line-strong'
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left] ${
                  data.settings.autoSubmit ? 'left-[1.4rem]' : 'left-0.5'
                }`}
              />
            </button>
          </div>
          {data.settings.autoSubmit && (
            <p className="mt-2 text-xs font-semibold text-warn">
              On. Applications are sent to real employers under your name.
            </p>
          )}
        </div>
      )}

      {/* Read from configuration, not asserted. */}
      <div className="mt-5 rounded-xl border border-line bg-elevated/50 p-4">
        {data.submitVendors.length === 0 ? (
          <>
            <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
              <LockIcon className="h-3.5 w-3.5" />
              Automatic submission is off
            </p>
            <p className="mt-1 text-sm text-muted">
              Autopilot fills, validates and hands you a finished application. No applicant tracking system is enabled for
              automatic submission, so turning off review above does not cause anything to be sent.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold text-ink">
              Submission routes are open for {data.submitVendors.join(", ")}
            </p>
            <p className="mt-1 text-sm text-muted">
              {data.settings.autoSubmit
                ? "Runs that clear every check go to the employer without asking you again."
                : "Nothing is sent while the switch above is off."}
            </p>
          </>
        )}
      </div>
    </>
  );
}

function YourDetails({
  answers,
  patch,
  reload,
}: {
  answers: Answer[];
  patch: (b: Record<string, unknown>) => Promise<boolean>;
  reload: () => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  if (answers.length === 0) {
    return (
      <>
        <Head title="Your details" sub="Everything applications ask, answered once." />
        <p className="rounded-xl border border-dashed border-line-strong p-8 text-center text-sm text-muted">
          Nothing saved yet. Finish JobPilot setup and your answers appear here.
        </p>
      </>
    );
  }

  return (
    <>
      <Head title="Your details" sub="Every answer applications reuse. Edit anything that has changed." />
      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
        {answers.map((a) => (
          <li key={a.intent} className="px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">{INTENT_LABEL[a.intent] ?? a.intent}</p>
                {editing === a.intent ? (
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    autoFocus
                    /* Tells the browser what this field is, so a saved address
                       or phone number is actually offered. Without it every
                       input here is anonymous and nothing autofills. */
                    autoComplete={INTENT_AUTOCOMPLETE[a.intent] ?? 'on'}
                    name={INTENT_AUTOCOMPLETE[a.intent] ?? a.intent.toLowerCase().replace(/\./g, '-')}
                    type={
                      a.intent === 'PROFILE.EMAIL'
                        ? 'email'
                        : a.intent === 'PROFILE.PHONE'
                          ? 'tel'
                          : INTENT_AUTOCOMPLETE[a.intent] === 'url'
                            ? 'url'
                            : 'text'
                    }
                    className="mt-1.5 w-full min-w-[16rem] rounded-lg border border-line bg-canvas px-2.5 py-1.5 text-sm text-ink focus:border-accent focus:outline-none"
                  />
                ) : (
                  <p className="mt-0.5 break-words text-sm text-muted">{a.value || <span className="text-faint">Not set</span>}</p>
                )}
                {/* Provenance shown because it decides whether Autopilot may
                    use the answer without asking again. */}
                <p className="mt-1 text-[11px] text-faint">
                  {a.autopilotOk ? 'Used automatically' : 'Needs your confirmation each time'} · {a.provenance.toLowerCase().replace('_', ' ')}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                {editing === a.intent ? (
                  <>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={async () => {
                        if (await patch({ intent: a.intent, value: draft })) {
                          setEditing(null);
                          reload();
                        }
                      }}
                    >
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setEditing(a.intent);
                      setDraft(a.value);
                    }}
                  >
                    Edit
                  </Button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

function ResumeSection({ resume, reload }: { resume: { name: string; chars: number } | null; reload: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <>
      <Head title="Résumé" sub="Matching and tailoring run on this file. Replace it any time." />
      <div className="rounded-xl border border-line p-5">
        {resume?.name ? (
          <p className="flex items-center gap-2 text-sm text-ink">
            <CheckIcon className="h-4 w-4 text-success" />
            <span className="font-medium">{resume.name}</span>
            <span className="text-faint">{resume.chars.toLocaleString()} characters parsed</span>
          </p>
        ) : (
          <p className="text-sm text-muted">No résumé uploaded yet.</p>
        )}

        {err && (
          <p role="alert" className="mt-3 text-sm font-semibold text-danger">
            {err}
          </p>
        )}

        <Button variant="secondary" loading={busy} onClick={() => ref.current?.click()} className="mt-4">
          {resume?.name ? 'Replace résumé' : 'Upload résumé'}
        </Button>
        <input
          ref={ref}
          type="file"
          accept=".pdf,.docx,.txt"
          className="sr-only"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            setBusy(true);
            setErr(null);
            try {
              const form = new FormData();
              form.append('resume', f);
              form.append('json', '{}');
              const res = await fetch('/api/jobs/profile', { method: 'POST', body: form });
              const d = (await res.json()) as { error?: string };
              if (!res.ok) setErr(d.error ?? 'Could not read that file.');
              else reload();
            } catch {
              setErr('Could not upload that file.');
            } finally {
              setBusy(false);
            }
          }}
        />
        <p className="mt-2 text-xs text-faint">PDF, DOCX or TXT, up to 4 MB. Replacing it re-scores your matches.</p>
      </div>
    </>
  );
}

/**
 * The browser extension's credential.
 *
 * Issued on demand rather than shown by default: it is a bearer token, and a
 * token sitting visible on a settings page is one that gets screenshotted into
 * a support thread. Rotating invalidates every installed copy, which is what
 * makes a leaked one recoverable.
 */
function ExtensionConnect() {
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const issue = async (rotate: boolean) => {
    setBusy(true);
    setCopied(false);
    const res = await fetch('/api/extension/connect', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rotate }),
    });
    if (res.ok) setToken(((await res.json()) as { token: string }).token);
    setBusy(false);
  };

  return (
    <div className="mt-5 border-t border-line pt-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-faint">Browser extension</p>
      <p className="mt-1 text-sm text-muted">
        Fills applications in your own browser, where you are already signed in — the sites that need an account or
        show a CAPTCHA to Auto Apply. It never submits; you review and press send.
      </p>

      {token ? (
        <>
          <p className="mt-3 break-all rounded-lg border border-line bg-surface p-2.5 font-mono text-xs text-ink">
            {token}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                void navigator.clipboard.writeText(token);
                setCopied(true);
              }}
            >
              {copied ? 'Copied' : 'Copy token'}
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void issue(true)}>
              Rotate
            </Button>
          </div>
          <p className="mt-2 text-xs text-faint">
            Paste it into the extension once. Rotating signs out every copy of it.
          </p>
        </>
      ) : (
        <Button size="sm" variant="secondary" className="mt-3" disabled={busy} onClick={() => void issue(false)}>
          {busy ? 'Issuing…' : 'Show connection token'}
        </Button>
      )}
    </div>
  );
}

function ApplyEmail({ data }: { data: Payload }) {
  const [copied, setCopied] = useState(false);
  return (
    <>
      <Head
        title="Application email"
        sub="A dedicated address used only on job applications, so recruiter mail and verification codes stay out of your personal inbox."
      />
      {data.applyEmail ? (
        <div className="rounded-xl border border-line p-5">
          <p className="font-mono text-sm text-ink">{data.applyEmail}</p>
          <Button
            size="sm"
            variant="secondary"
            className="mt-3"
            onClick={() => {
              void navigator.clipboard.writeText(data.applyEmail ?? '');
              setCopied(true);
            }}
          >
            {copied ? 'Copied' : 'Copy address'}
          </Button>
          <p className="mt-3 text-xs text-faint">
            Issued once and never reissued. Applications use it in place of your sign-in address
            {data.mailForwardingConfigured ? ', and everything it receives is copied to your own inbox.' : '.'}
          </p>

          <ExtensionConnect />

          {/* The inbox. An address you cannot read is a string on a settings
              page, not a feature. */}
          <div className="mt-5 border-t border-line pt-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-faint">Received</p>
            {data.mail.length === 0 ? (
              <p className="mt-2 text-sm text-muted">Nothing yet. Mail sent to this address appears here.</p>
            ) : (
              <ul className="mt-2 divide-y divide-line">
                {data.mail.map((m) => (
                  <li key={m.id} className="py-2.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="min-w-0 text-sm font-medium text-ink">{m.fromName}</span>
                      <span className="shrink-0 text-[11px] text-faint">
                        {new Date(m.receivedAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="truncate text-sm text-muted">{m.subject}</p>
                    {/* The code is pulled out because that is the one thing
                        someone opening this screen mid-application needs. */}
                    {m.otp && (
                      <p className="mt-1 inline-flex items-center gap-2 rounded-lg bg-mint px-2.5 py-1">
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-accent">Code</span>
                        <span className="font-mono text-sm font-bold tabular-nums text-accent">{m.otp}</span>
                      </p>
                    )}
                    {!m.forwarded && data.mailForwardingConfigured && (
                      <p className="mt-0.5 text-[11px] text-warn">Not yet copied to your inbox.</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : (
        /* Honest about why there is no address rather than showing a
           placeholder that would silently drop recruiter mail. */
        <div className="rounded-xl border border-line bg-elevated/50 p-5">
          <p className="text-sm font-semibold text-ink">Not available yet</p>
          <p className="mt-1 text-sm text-muted">
            Addresses are issued once a mail domain is configured and can actually receive replies. Handing you an
            address that drops recruiter mail would be worse than not offering one.
          </p>
          <p className="mt-2 text-xs text-faint">Set APPLY_EMAIL_DOMAIN and point inbound mail at the app to switch this on.</p>
        </div>
      )}
    </>
  );
}

const SOURCE_LABEL: Record<string, { name: string; note: string }> = {
  google_jobs: { name: 'Google Jobs', note: 'Aggregated postings, refreshed on each search.' },
  greenhouse: { name: 'Greenhouse', note: 'Public company boards, read directly from the employer.' },
  lever: { name: 'Lever', note: 'Public company boards, read directly from the employer.' },
  registry: { name: 'Curated registry', note: 'Hand-checked employer boards.' },
};

function JobBoards({ sources }: { sources: { source: string; open: number }[] }) {
  const total = sources.reduce((n, s) => n + s.open, 0);
  return (
    <>
      <Head title="Job boards" sub="Where your listings come from." />
      {sources.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line-strong p-8 text-center text-sm text-muted">
          No open listings yet. Run a search and the sources appear here.
        </p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
          {sources.map((s) => {
            const meta = SOURCE_LABEL[s.source] ?? { name: s.source, note: '' };
            return (
              <li key={s.source} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <span>
                  <span className="block text-sm font-medium text-ink">{meta.name}</span>
                  {meta.note && <span className="block text-xs text-muted">{meta.note}</span>}
                </span>
                <span className="shrink-0 rounded-full bg-mint px-2.5 py-1 text-xs font-semibold text-accent tabular-nums">
                  {s.open.toLocaleString()} open
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {/* No toggles for boards we do not read. A switch labelled with a job
          site that changes nothing is worse than an honest absence. */}
      <p className="mt-3 text-xs text-faint">
        {total.toLocaleString()} open listings tracked. Every posting links to the employer&rsquo;s own application page, never
        to a generic careers landing page.
      </p>
    </>
  );
}

function Account({ account }: { account: Payload['account'] }) {
  const [busy, setBusy] = useState(false);
  const kind = account.accountKind === 'personal' ? 'Personal' : 'Institutional';
  return (
    <>
      <Head title="Account" sub="Your sign-in identity." />
      <dl className="divide-y divide-line overflow-hidden rounded-xl border border-line">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <dt className="text-sm text-muted">Email</dt>
          <dd className="text-sm font-medium text-ink">{account.email}</dd>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <dt className="text-sm text-muted">Account type</dt>
          <dd className="text-sm font-medium text-ink">
            {kind} · {account.role}
          </dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-faint">
        Your sign-in email is separate from the address applications are sent from, so a recruiter reply never lands in the
        inbox you use to log in.
      </p>
      <Button
        variant="secondary"
        className="mt-5"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await fetch('/api/auth/logout', { method: 'POST' });
            window.location.href = '/';
          } catch {
            setBusy(false);
          }
        }}
      >
        Sign out
      </Button>
    </>
  );
}

function Billing({ billing, reload }: { billing: Payload['billing']; reload: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const planName = billing.plan === 'pro_yearly' ? 'Pro, yearly' : billing.plan === 'pro_monthly' ? 'Pro, monthly' : 'Free';

  return (
    <>
      <Head title="Plans & billing" sub="One plan covers course generation and JobPilot together." />
      <div className="rounded-xl border border-line p-5">
        <p className="text-sm text-ink">
          Current plan: <span className="font-semibold">{planName}</span>
        </p>
        <p className="mt-1 text-sm text-muted">
          {billing.isPro
            ? 'Unlimited course generation, the full library, and JobPilot matching.'
            : 'Free covers browsing, job matching, and a daily allowance of assistant questions.'}
        </p>
        {billing.currentPeriodEnd != null && billing.isPro && (
          <p className="mt-1 text-xs text-faint">
            {billing.status === 'canceled' ? 'Access ends' : 'Renews'} {new Date(billing.currentPeriodEnd).toLocaleDateString()}
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {/* Checkout stays on the existing pricing page rather than being
              rebuilt here — one plan, one checkout, one source of truth. */}
          <a
            href="/pricing"
            className="inline-flex h-9 items-center rounded-[var(--mf-radius-md)] bg-[var(--color-accent-fill)] px-4 text-sm font-semibold text-white"
          >
            {billing.isPro ? 'Change plan' : 'See plans'}
          </a>
          {billing.isPro && billing.status !== 'canceled' && !confirming && (
            <Button variant="ghost" onClick={() => setConfirming(true)}>
              Cancel subscription
            </Button>
          )}
        </div>

        {confirming && (
          <div className="mt-4 rounded-lg border border-line bg-elevated/60 p-4">
            <p className="text-sm text-ink">Cancel your plan? You keep Pro access until the end of the period you paid for.</p>
            <div className="mt-3 flex gap-2">
              <Button
                variant="danger"
                size="sm"
                loading={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await fetch('/api/billing/cancel', { method: 'POST' });
                    setConfirming(false);
                    reload();
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Cancel plan
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
                Keep it
              </Button>
            </div>
          </div>
        )}
      </div>

      {billing.purchases.length > 0 && (
        <div className="mt-4 rounded-xl border border-line p-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-faint">One-off purchases</p>
          <ul className="mt-2 space-y-1">
            {billing.purchases.map((p) => (
              <li key={p} className="text-sm text-muted">
                {p}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function Referrals({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const link = typeof window === 'undefined' ? '' : `${window.location.origin}/?ref=${code}`;
  return (
    <>
      <Head title="Referrals" sub="Share MeritFlow with someone who is job hunting." />
      <div className="rounded-xl border border-line p-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-faint">Your referral link</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg border border-line bg-elevated px-3 py-2 text-sm text-ink">{link}</code>
          <Button
            size="md"
            onClick={() => {
              void navigator.clipboard.writeText(link);
              setCopied(true);
            }}
          >
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
        <p className="mt-3 text-xs text-faint">
          Referral rewards are not switched on yet. The link works and attribution is recorded.
        </p>
      </div>
    </>
  );
}

/* ── Controls ────────────────────────────────────────────────────────────── */

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
      <span className="text-sm font-medium text-ink">{label}</span>
      {children}
    </div>
  );
}

function Toggle({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
      <span>
        <span className="block text-sm font-medium text-ink">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-label={label}
        onClick={() => onChange(!value)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${value ? 'bg-accent-fill' : 'bg-line-strong'}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left] ${value ? 'left-[1.4rem]' : 'left-0.5'}`}
        />
      </button>
    </div>
  );
}

function Simple({
  title,
  sub,
  rows,
  footer,
}: {
  title: string;
  sub: string;
  rows: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }[];
  footer?: string;
}) {
  return (
    <>
      <Head title={title} sub={sub} />
      {rows.map((r) => (
        <Toggle key={r.label} {...r} />
      ))}
      {footer && <p className="text-sm text-muted">{footer}</p>}
    </>
  );
}
