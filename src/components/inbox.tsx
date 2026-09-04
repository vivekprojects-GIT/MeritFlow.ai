'use client';

import { useEffect, useRef, useState } from 'react';
import type { Conversation, Message } from '@/lib/messages-store';
import { ChatIcon, CloseIcon, SendIcon, UserIcon } from './icons';

/**
 * Inbox for professors and students.
 *
 * Deliberately conversation-first rather than email-style: in a class the unit
 * that matters is "my thread with this person", not individual messages.
 *
 * Messaging is restricted server-side to people you share a class with, so this
 * never offers a compose-to-anyone box — you reply to a thread, or you start
 * one from the class roster / insights list where the relationship exists.
 */

export function Inbox({
  open,
  onClose,
  startWith,
}: {
  open: boolean;
  onClose: () => void;
  /** Optionally open straight into a thread, e.g. from "message this learner". */
  startWith?: { userId: string; email: string } | null;
}) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [active, setActive] = useState<{ userId: string; email: string } | null>(startWith ?? null);
  const [thread, setThread] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function fetchConversations(): Promise<Conversation[] | null> {
    try {
      const res = await fetch('/api/messages');
      if (!res.ok) return null;
      const data = (await res.json()) as { conversations: Conversation[] };
      return data.conversations ?? [];
    } catch {
      return null; /* the inbox simply stays as it was */
    }
  }

  async function fetchThread(userId: string): Promise<{ messages?: Message[]; error?: string }> {
    try {
      const res = await fetch(`/api/messages/${userId}`);
      const data = (await res.json()) as { messages?: Message[]; error?: string };
      if (!res.ok) return { error: data.error ?? 'Could not open that conversation.' };
      return { messages: data.messages ?? [] };
    } catch {
      return { error: 'Could not open that conversation.' };
    }
  }

  /* The fetch lives inside the effect so the state update happens in an async
     continuation rather than synchronously in the effect body. */
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const list = await fetchConversations();
      if (!cancelled && list) setConversations(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    (async () => {
      const result = await fetchThread(active.userId);
      if (cancelled) return;
      if (result.error) setError(result.error);
      else {
        setThread(result.messages ?? []);
        setError(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [thread]);

  if (!open) return null;

  async function send() {
    const text = draft.trim();
    if (!text || !active || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: active.userId, body: text }),
      });
      const data = (await res.json()) as { message?: Message; error?: string };
      if (!res.ok || !data.message) {
        setError(data.error ?? 'Could not send that message.');
        return;
      }
      setThread((prev) => [...prev, { ...data.message!, senderEmail: 'you' }]);
      setDraft('');
      const refreshed = await fetchConversations();
      if (refreshed) setConversations(refreshed);
    } catch {
      setError('Could not send that message.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="absolute right-0 top-0 flex h-full w-full max-w-3xl flex-col border-l border-line bg-canvas shadow-2xl">
        <div className="flex items-center gap-3 border-b border-line px-4 py-3.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <ChatIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-ink">Messages</p>
            <p className="truncate text-xs text-muted">
              {active ? active.email : 'Your conversations with professors and classmates'}
            </p>
          </div>
          {active && (
            <button
              onClick={() => setActive(null)}
              className="ring-focus rounded-lg px-3 py-1.5 text-xs font-semibold text-muted hover:text-ink"
            >
              All conversations
            </button>
          )}
          <button onClick={onClose} className="ring-focus rounded-lg p-2 text-muted hover:bg-surface hover:text-ink" aria-label="Close messages">
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        {!active ? (
          <div className="thin-scroll flex-1 overflow-y-auto">
            {conversations.length === 0 ? (
              <p className="px-6 py-12 text-center text-sm text-muted">
                No messages yet. Professors can start a conversation from the class roster; students can reply here.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {conversations.map((c) => (
                  <li key={c.withUserId}>
                    <button
                      onClick={() => setActive({ userId: c.withUserId, email: c.withEmail })}
                      className="ring-focus flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-mint text-accent">
                        <UserIcon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-semibold text-ink">{c.withEmail}</span>
                          {c.className && (
                            <span className="shrink-0 rounded-full bg-surface px-2 py-0.5 text-[10px] font-medium text-muted">
                              {c.className}
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 line-clamp-1 block text-sm text-muted">{c.lastBody}</span>
                      </span>
                      {c.unread > 0 && (
                        <span className="mt-1 flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-bold text-canvas">
                          {c.unread}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <>
            <div ref={scrollRef} className="thin-scroll flex-1 space-y-2.5 overflow-y-auto px-4 py-5">
              {thread.map((m) => (
                <div key={m.id} className={m.mine ? 'flex justify-end' : 'flex justify-start'}>
                  <div
                    className={[
                      'max-w-[80%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-[13px] leading-[1.6]',
                      m.mine ? 'bg-accent text-canvas' : 'border border-line bg-surface text-ink/85',
                    ].join(' ')}
                  >
                    {m.body}
                    <span className={['mt-1 block text-[10px]', m.mine ? 'text-canvas/70' : 'text-faint'].join(' ')}>
                      {new Date(m.createdAt).toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
              {thread.length === 0 && (
                <p className="py-8 text-center text-sm text-muted">No messages in this conversation yet.</p>
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
              className="border-t border-line p-3"
            >
              {error && <p className="mb-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
              <div className="flex items-end gap-2 rounded-2xl border border-line bg-surface p-2">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                  rows={1}
                  placeholder="Write a message…"
                  className="max-h-32 flex-1 resize-none bg-transparent px-2 py-1.5 text-[13px] text-ink placeholder:text-faint focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={sending || !draft.trim()}
                  aria-label="Send"
                  className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-canvas disabled:opacity-40"
                >
                  <SendIcon className="h-4 w-4" />
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
