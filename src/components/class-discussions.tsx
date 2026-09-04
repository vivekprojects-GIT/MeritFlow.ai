'use client';

import { useEffect, useState } from 'react';
import type { DiscussionPost, DiscussionTopic } from '@/lib/discussions-store';
import { ArrowRightIcon, ChatIcon, SendIcon, SparklesIcon, UserIcon } from './icons';

/**
 * Class discussion board.
 *
 * Two levels only — topics and replies. Students can start topics as well as
 * reply; a board only they can read is a notice board, and peer questions are
 * most of the value.
 */

export function ClassDiscussions({ classId, canPin = false }: { classId: string; canPin?: boolean }) {
  const [topics, setTopics] = useState<DiscussionTopic[]>([]);
  const [open, setOpen] = useState<DiscussionTopic | null>(null);
  const [replies, setReplies] = useState<DiscussionPost[]>([]);
  const [draft, setDraft] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');
  const [composing, setComposing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchTopics(): Promise<DiscussionTopic[] | null> {
    try {
      const res = await fetch(`/api/classes/${classId}/discussions`);
      if (!res.ok) return null;
      const data = (await res.json()) as { topics: DiscussionTopic[] };
      return data.topics ?? [];
    } catch {
      return null;
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await fetchTopics();
      if (!cancelled && list) setTopics(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [classId]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/discussions/${open.id}`);
        const data = (await res.json()) as { replies?: DiscussionPost[] };
        if (!cancelled) setReplies(data.replies ?? []);
      } catch {
        /* leave the thread as it was */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function refresh() {
    const list = await fetchTopics();
    if (list) setTopics(list);
  }

  async function postTopic() {
    if (!newTitle.trim() || !newBody.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/classes/${classId}/discussions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle, body: newBody }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? 'Could not post that.');
        return;
      }
      setNewTitle('');
      setNewBody('');
      setComposing(false);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function postReply() {
    if (!draft.trim() || !open || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/discussions/${open.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: draft }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? 'Could not post that reply.');
        return;
      }
      setDraft('');
      const res2 = await fetch(`/api/discussions/${open.id}`);
      const d2 = (await res2.json()) as { replies?: DiscussionPost[] };
      setReplies(d2.replies ?? []);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function togglePin(topic: DiscussionTopic) {
    await fetch(`/api/discussions/${topic.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pinned: !topic.pinned }),
    });
    await refresh();
  }

  if (open) {
    return (
      <div className="space-y-4">
        <button onClick={() => setOpen(null)} className="u-link text-sm font-semibold text-accent">
          ← All topics
        </button>

        <article className="rounded-2xl border border-line bg-surface p-4">
          <h3 className="text-base font-bold text-ink">{open.title}</h3>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
            <UserIcon className="h-3 w-3" />
            {open.authorEmail}
            {open.authorRole === 'instructor' && (
              <span className="rounded-full bg-mint px-2 py-0.5 text-[10px] font-bold text-accent">Professor</span>
            )}
            · {new Date(open.createdAt).toLocaleString()}
          </p>
          <p className="mt-3 whitespace-pre-wrap text-[15px] leading-7 text-ink/85">{open.body}</p>
        </article>

        <div className="space-y-2.5">
          {replies.map((r) => (
            <div key={r.id} className="rounded-xl border border-line bg-canvas p-3.5">
              <p className="flex items-center gap-1.5 text-xs text-muted">
                <UserIcon className="h-3 w-3" />
                {r.authorEmail}
                {r.authorRole === 'instructor' && (
                  <span className="rounded-full bg-mint px-2 py-0.5 text-[10px] font-bold text-accent">Professor</span>
                )}
                · {new Date(r.createdAt).toLocaleString()}
              </p>
              <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-ink/85">{r.body}</p>
            </div>
          ))}
          {replies.length === 0 && <p className="py-4 text-center text-sm text-muted">No replies yet.</p>}
        </div>

        {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

        <div className="flex items-end gap-2 rounded-2xl border border-line bg-surface p-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            placeholder="Write a reply…"
            className="flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-ink placeholder:text-faint focus:outline-none"
          />
          <button
            onClick={() => void postReply()}
            disabled={busy || !draft.trim()}
            className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-canvas disabled:opacity-40"
            aria-label="Post reply"
          >
            <SendIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {!composing ? (
        <button
          onClick={() => setComposing(true)}
          className="press ring-focus inline-flex items-center gap-2 rounded-full bg-accent-fill px-4 py-2 text-sm font-semibold text-canvas"
        >
          <ChatIcon className="h-4 w-4" />
          Start a topic
        </button>
      ) : (
        <div className="rounded-2xl border border-line bg-surface p-4">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Topic title"
            className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-accent/60 focus:outline-none"
          />
          <textarea
            value={newBody}
            onChange={(e) => setNewBody(e.target.value)}
            rows={4}
            placeholder="What do you want to discuss?"
            className="mt-2 w-full resize-none rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-accent/60 focus:outline-none"
          />
          {error && <p className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => void postTopic()}
              disabled={busy || !newTitle.trim() || !newBody.trim()}
              className="press rounded-full bg-accent-fill px-4 py-2 text-sm font-semibold text-canvas disabled:opacity-40"
            >
              Post topic
            </button>
            <button onClick={() => setComposing(false)} className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-muted">
              Cancel
            </button>
          </div>
        </div>
      )}

      {topics.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line bg-surface/60 px-4 py-8 text-center text-sm text-muted">
          No discussions yet. Start the first topic, questions here help everyone, not just you.
        </p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
          {topics.map((t) => (
            <li key={t.id} className="flex items-start gap-3 bg-canvas px-4 py-3">
              <button onClick={() => setOpen(t)} className="ring-focus min-w-0 flex-1 text-left">
                <span className="flex items-center gap-2">
                  {t.pinned && <SparklesIcon className="h-3.5 w-3.5 shrink-0 text-accent" />}
                  <span className="truncate text-sm font-semibold text-ink">{t.title}</span>
                  {t.authorRole === 'instructor' && (
                    <span className="shrink-0 rounded-full bg-mint px-2 py-0.5 text-[10px] font-bold text-accent">
                      Professor
                    </span>
                  )}
                </span>
                <span className="mt-0.5 line-clamp-1 block text-xs text-muted">{t.body}</span>
                <span className="mt-1 block text-[11px] text-faint">
                  {t.replyCount} {t.replyCount === 1 ? 'reply' : 'replies'} · last activity{' '}
                  {new Date(t.lastActivityAt).toLocaleDateString()}
                </span>
              </button>
              {canPin && (
                <button
                  onClick={() => void togglePin(t)}
                  className="ring-focus shrink-0 rounded-full border border-line px-2.5 py-1 text-[11px] font-semibold text-muted hover:text-accent"
                  title={t.pinned ? 'Unpin' : 'Pin to top'}
                >
                  {t.pinned ? 'Unpin' : 'Pin'}
                </button>
              )}
              <ArrowRightIcon className="mt-1 h-4 w-4 shrink-0 text-faint" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
