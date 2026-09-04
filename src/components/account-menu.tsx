'use client';

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import type { Profile } from '@/lib/profile-store';
import { Modal } from './modal';
import { ApiKeySettings } from './api-key-settings';
import { Button } from './button';
import { ThemeToggle } from './theme-toggle';

const ROLE_LABEL: Record<Profile['role'], string> = {
  student: 'Student',
  instructor: 'Professor',
  admin: 'Admin',
};

/** Load an image file, center-crop to a square, downscale, and return a small JPEG data URL. */
function downscaleImage(file: File, size = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('no canvas');
        const scale = Math.max(size / img.width, size / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      } catch (e) {
        reject(e instanceof Error ? e : new Error('bad image'));
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read that image.'));
    };
    img.src = url;
  });
}

function initialOf(name: string, email: string): string {
  return (name.trim()[0] || email.trim()[0] || 'U').toUpperCase();
}

export function Avatar({
  name,
  email,
  avatarUrl,
  className = 'h-8 w-8 text-sm',
}: {
  name: string;
  email: string;
  avatarUrl: string | null;
  className?: string;
}) {
  if (avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={avatarUrl} alt="" className={['shrink-0 rounded-full object-cover', className].join(' ')} />;
  }
  return (
    <span
      className={[
        'flex shrink-0 items-center justify-center rounded-full bg-accent-fill font-semibold text-canvas',
        className,
      ].join(' ')}
    >
      {initialOf(name, email)}
    </span>
  );
}

export function AccountMenu({ email }: { email: string }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/profile')
      .then((r) => r.json())
      .then((d: { profile?: Profile }) => {
        if (alive && d.profile) setProfile(d.profile);
      })
      .catch(() => {
        /* non-critical */
      });
    return () => {
      alive = false;
    };
  }, []);

  const name = profile?.name ?? '';
  const avatarUrl = profile?.avatarUrl ?? null;
  const display = name || email;

  /* Close on outside click and on Escape — a menu you can only dismiss by
     clicking the trigger again feels stuck. */
  useEffect(() => {
    if (!menuOpen) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  async function logout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      /* the redirect below still gets them out */
    }
    window.location.href = '/login';
  }

  return (
    <div ref={wrapRef} className="relative">
      {/* One control, not three. The theme switch, profile and sign-out used to
          sit side by side in the header and collided on narrow screens; they
          are all account-scoped, so they belong behind one avatar. */}
      <button
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        title="Your account"
        className="ring-focus flex items-center gap-2 rounded-full border border-line bg-surface p-1 transition-colors hover:border-accent/40 sm:pr-3"
      >
        <Avatar name={name} email={email} avatarUrl={avatarUrl} className="h-7 w-7 text-xs" />
        <span className="hidden max-w-[140px] truncate text-xs text-muted lg:inline">{display}</span>
      </button>

      {menuOpen && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-line bg-canvas shadow-2xl"
        >
          <div className="flex items-center gap-3 border-b border-line p-3">
            <Avatar name={name} email={email} avatarUrl={avatarUrl} className="h-10 w-10 text-sm" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">{display}</p>
              <p className="truncate text-xs text-muted">{email}</p>
              {profile?.role && <p className="mt-0.5 text-[11px] text-faint">{ROLE_LABEL[profile.role]}</p>}
            </div>
          </div>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenuOpen(false);
              setOpen(true);
            }}
            className="block w-full px-3 py-2.5 text-left text-sm text-ink transition hover:bg-elevated"
          >
            Edit profile
          </button>

          <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-2.5">
            <span className="text-sm text-ink">Theme</span>
            <ThemeToggle />
          </div>

          <button
            type="button"
            role="menuitem"
            onClick={logout}
            className="block w-full border-t border-line px-3 py-2.5 text-left text-sm font-medium text-danger transition hover:bg-danger-soft"
          >
            Log out
          </button>
        </div>
      )}

      {open && (
        <ProfileModal
          email={email}
          initial={profile}
          onClose={() => setOpen(false)}
          onSaved={(p) => setProfile(p)}
        />
      )}
    </div>
  );
}

/** A titled group of fields — the form is long enough to need structure. */
function Fieldset({ legend, note, children }: { legend: string; note?: string; children: React.ReactNode }) {
  return (
    <fieldset className="rounded-2xl border border-line p-4">
      <legend className="px-1.5 text-xs font-bold uppercase tracking-[0.14em] text-faint">{legend}</legend>
      {note && <p className="mb-3 text-xs text-muted">{note}</p>}
      <div className="space-y-4">{children}</div>
    </fieldset>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wider text-faint">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-faint">{hint}</span>}
    </label>
  );
}

function ProfileModal({
  email,
  initial,
  onClose,
  onSaved,
}: {
  email: string;
  initial: Profile | null;
  onClose: () => void;
  onSaved: (p: Profile) => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [headline, setHeadline] = useState(initial?.headline ?? '');
  const [bio, setBio] = useState(initial?.bio ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [birthDate, setBirthDate] = useState(initial?.birthDate ?? '');
  const [pronouns, setPronouns] = useState(initial?.pronouns ?? '');
  const [location, setLocation] = useState(initial?.location ?? '');
  const [timezone, setTimezone] = useState(initial?.timezone ?? '');
  const [website, setWebsite] = useState(initial?.website ?? '');
  const [department, setDepartment] = useState(initial?.department ?? '');
  const [studentId, setStudentId] = useState(initial?.studentId ?? '');
  const [avatar, setAvatar] = useState<string | null>(initial?.avatarUrl ?? null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  /* Two subjects, not one long form. Who you are is edited and saved together;
     an API key is saved on its own the moment you enter it, and mixing the two
     would put a key behind a "Save profile" button that also rewrites your
     name. */
  const [tab, setTab] = useState<'profile' | 'settings'>('profile');

  const role = initial?.role ?? 'student';
  /* The browser already knows the zone — offering it as the placeholder beats
     making someone look up the IANA spelling of where they live. */
  const guessedZone = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC';
  const headlinePlaceholder =
    role === 'instructor' ? 'e.g. Professor of Photography' : role === 'admin' ? 'e.g. Program Administrator' : 'e.g. Computer Science student';

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!f.type.startsWith('image/')) {
      setError('Please choose an image file.');
      return;
    }
    try {
      setError(null);
      setAvatar(await downscaleImage(f));
    } catch {
      setError('Could not read that image.');
    }
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          headline,
          bio,
          phone,
          birthDate,
          pronouns,
          location,
          timezone,
          website,
          department,
          studentId,
          avatarUrl: avatar,
        }),
      });
      const data = (await res.json()) as { profile?: Profile; error?: string };
      if (!res.ok || !data.profile) throw new Error(data.error ?? 'Could not save your profile.');
      onSaved(data.profile);
      setSaved(true);
      setTimeout(onClose, 600);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your profile.');
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    'ring-focus mt-1.5 w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none';

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      eyebrow="Your profile"
      title="Edit profile"
      footer={
        <div className="flex items-center justify-end gap-2">
          {saved && <span className="mr-auto text-sm font-medium text-accent">Saved ✓</span>}
          <Button variant="ghost" onClick={onClose}>
            {tab === 'settings' ? 'Close' : 'Cancel'}
          </Button>
          {/* Absent on the settings tab: each key there saves itself, and a
              second Save button would imply it had not. */}
          {tab === 'profile' && (
            <Button variant="primary" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save profile'}
            </Button>
          )}
        </div>
      }
    >
      <div className="mb-5 flex gap-1 border-b border-line">
        {(['profile', 'settings'] as const).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            aria-current={tab === id}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold capitalize transition ${
              tab === id ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            {id === 'profile' ? 'Profile' : 'Settings'}
          </button>
        ))}
      </div>

      {tab === 'settings' ? (
        <ApiKeySettings />
      ) : (
      <>
      {/* Avatar */}
      <div className="flex items-center gap-4">
        <Avatar name={name} email={email} avatarUrl={avatar} className="h-20 w-20 text-2xl" />
        <div>
          <input ref={fileRef} type="file" accept="image/*" onChange={onFile} className="hidden" />
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
              {avatar ? 'Change photo' : 'Upload photo'}
            </Button>
            {avatar && (
              <Button variant="ghost" size="sm" onClick={() => setAvatar(null)}>
                Remove
              </Button>
            )}
          </div>
          <p className="mt-2 text-xs text-faint">PNG or JPG · auto-cropped to a square.</p>
        </div>
      </div>

      <div className="mt-5 space-y-5">
        <Fieldset legend="Who you are">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" className={inputCls} />
            </Field>
            <Field label="Pronouns" hint="Shown beside your name">
              <input
                value={pronouns}
                onChange={(e) => setPronouns(e.target.value)}
                placeholder="e.g. they/them"
                className={inputCls}
              />
            </Field>
          </div>
          <Field label="Headline">
            <input value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder={headlinePlaceholder} className={inputCls} />
          </Field>
          <Field label="About">
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={4}
              placeholder="A short bio. Your background, what you teach, or what you want to learn."
              className={[inputCls, 'resize-y leading-relaxed'].join(' ')}
            />
          </Field>
        </Fieldset>

        <Fieldset legend="Contact" note="Only staff at your institution can see these.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Email" hint="Sign-in address. Cannot be changed here.">
              {/* Read-only rather than hidden: people look for their email to
                  confirm which account they are in. */}
              <input value={email} readOnly disabled className={[inputCls, 'cursor-not-allowed opacity-60'].join(' ')} />
            </Field>
            <Field label="Phone">
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 555 000 1234"
                className={inputCls}
              />
            </Field>
            <Field label="Date of birth">
              <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Location">
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="City, Country"
                className={inputCls}
              />
            </Field>
            <Field label="Time zone" hint="Used for deadlines">
              <input value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder={guessedZone} className={inputCls} />
            </Field>
            <Field label="Website">
              <input
                type="url"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://"
                className={inputCls}
              />
            </Field>
          </div>
        </Fieldset>

        {/* One field, different meaning per role, asking a student for their
            department, or a professor for a student ID, is noise. */}
        {role !== 'student' ? (
          <Fieldset legend="At your institution">
            <Field label="Department">
              <input
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="e.g. Computer Science"
                className={inputCls}
              />
            </Field>
          </Fieldset>
        ) : (
          <Fieldset legend="At your institution">
            <Field label="Student ID" hint="Matches you to your registrar's roster">
              <input
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                placeholder="e.g. S00123456"
                className={inputCls}
              />
            </Field>
          </Fieldset>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm font-semibold text-danger">
          {error}
        </p>
      )}
      <p className="mt-4 text-xs text-faint">
        Signed in as {ROLE_LABEL[role]} · {email}. Every field except your name is optional.
      </p>
      </>
      )}
    </Modal>
  );
}

/**
 * Profile as a destination.
 *
 * The editor was reachable only through the avatar in the header — an
 * unlabelled initial circle on mobile, with nothing to suggest it opened
 * anything. That matters more than ordinary discoverability: a missing name
 * silently blocks every job application, so the screen that fixes it cannot be
 * something you have to guess at.
 *
 * Reuses the same editor rather than copying it. Two implementations of one
 * form drift the moment either gains a field.
 */
export function ProfileView({ email, onClose }: { email: string; onClose: () => void }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch('/api/profile')
      .then((r) => (r.ok ? r.json() : { profile: null }))
      .then((d: { profile?: Profile }) => {
        if (!alive) return;
        setProfile(d.profile ?? null);
        setLoaded(true);
      })
      .catch(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, []);

  /* Waits for the fetch: mounting the editor with a null profile would show
     empty inputs and then overwrite real values with blanks on save. */
  if (!loaded) {
    return (
      <p role="status" aria-live="polite" className="rounded-2xl border border-line bg-canvas p-6 text-sm text-muted">
        Loading your profile…
      </p>
    );
  }

  return <ProfileModal email={email} initial={profile} onClose={onClose} onSaved={setProfile} />;
}
