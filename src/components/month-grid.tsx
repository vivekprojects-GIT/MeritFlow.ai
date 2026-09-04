'use client';

import { useMemo, useState } from 'react';

/**
 * A month of days with the candidate's events on them.
 *
 * ## Why a grid and not a list
 *
 * The Calendar tab held two lists behind toggle pills, which answers "what is
 * next" but not the question a calendar exists for: *shape*. Forty-one sent
 * applications mean something different bunched into two frantic days than
 * spread over three weeks, and an interview's distance from today is easier
 * read as cells than computed from a date string. The lists stay — a grid is
 * bad at detail — but the month is now the first thing seen.
 *
 * ## Deliberately dependency-free
 *
 * Date maths here is `Date` arithmetic on local midnight boundaries. A
 * calendar library earns its weight when there are timezones to reconcile or
 * recurring events to expand; plotting owned events on the viewer's own local
 * month needs neither.
 */

export type CalendarEvent = {
  /** Epoch ms. Plotted on the viewer's local day. */
  at: number;
  kind: 'interview' | 'application' | 'assessment';
  label: string;
  /** Optional secondary line for the day panel. */
  detail?: string;
};

const KIND_STYLE: Record<CalendarEvent['kind'], { dot: string; chip: string; name: string }> = {
  interview: { dot: 'bg-accent', chip: 'bg-mint text-accent', name: 'Interview' },
  assessment: { dot: 'bg-[var(--color-warn)]', chip: 'bg-[var(--color-warn-soft)] text-[var(--color-warn)]', name: 'Assessment' },
  application: { dot: 'bg-[var(--color-info,#5b7fd4)]', chip: 'bg-elevated text-muted', name: 'Applied' },
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function MonthGrid({ events }: { events: CalendarEvent[] }) {
  /* Read the clock once per mount. Reading it during every render is impure
     and, across a midnight, would repaint "today" mid-interaction. */
  const [today] = useState(() => startOfDay(Date.now()));
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [selected, setSelected] = useState<number>(today);

  const byDay = useMemo(() => {
    const m = new Map<number, CalendarEvent[]>();
    for (const e of events) {
      const k = startOfDay(e.at);
      const list = m.get(k) ?? [];
      list.push(e);
      m.set(k, list);
    }
    for (const list of m.values()) list.sort((a, b) => a.at - b.at);
    return m;
  }, [events]);

  /* The visible cells: from the Sunday on/before the 1st, six weeks. Six
     always — a grid that changes height between months makes the whole page
     jump when navigating. */
  const cells = useMemo(() => {
    const first = new Date(cursor);
    const start = new Date(first);
    start.setDate(1 - first.getDay());
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [cursor]);

  const monthLabel = cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const selectedEvents = byDay.get(selected) ?? [];
  const move = (delta: number) => {
    const d = new Date(cursor);
    d.setMonth(d.getMonth() + delta);
    setCursor(d);
  };

  return (
    <div className="rounded-2xl border border-line bg-canvas p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold text-ink">{monthLabel}</h3>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => move(-1)}
            className="h-7 w-7 rounded-full border border-line text-sm text-muted hover:text-ink"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => {
              const d = new Date();
              d.setDate(1);
              d.setHours(0, 0, 0, 0);
              setCursor(d);
              setSelected(today);
            }}
            className="rounded-full border border-line px-2.5 py-1 text-[12px] font-semibold text-muted hover:text-ink"
          >
            Today
          </button>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => move(1)}
            className="h-7 w-7 rounded-full border border-line text-sm text-muted hover:text-ink"
          >
            ›
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((w) => (
          <div key={w} className="pb-1 text-center text-[10px] font-bold uppercase tracking-wider text-faint">
            {w}
          </div>
        ))}
        {cells.map((d) => {
          const key = d.getTime();
          const inMonth = d.getMonth() === cursor.getMonth();
          const dayEvents = byDay.get(key) ?? [];
          const isToday = key === today;
          const isSelected = key === selected;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setSelected(key)}
              aria-pressed={isSelected}
              className={`relative flex h-14 flex-col items-center rounded-lg border pt-1.5 text-[12px] transition sm:h-16 ${
                isSelected
                  ? 'border-accent bg-mint'
                  : isToday
                    ? 'border-line bg-elevated'
                    : 'border-transparent hover:border-line'
              } ${inMonth ? 'text-ink' : 'text-faint'}`}
            >
              <span className={`flex h-5 w-5 items-center justify-center rounded-full ${isToday ? 'bg-accent font-bold text-white' : ''}`}>
                {d.getDate()}
              </span>
              {dayEvents.length > 0 && (
                <span className="mt-1 flex max-w-full gap-0.5 px-1">
                  {dayEvents.slice(0, 4).map((e, i) => (
                    <span key={i} className={`h-1.5 w-1.5 shrink-0 rounded-full ${KIND_STYLE[e.kind].dot}`} />
                  ))}
                  {dayEvents.length > 4 && <span className="text-[9px] leading-none text-faint">+{dayEvents.length - 4}</span>}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-3 border-t border-line pt-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-faint">
          {new Date(selected).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
        {selectedEvents.length === 0 ? (
          <p className="mt-1 text-sm text-muted">Nothing on this day.</p>
        ) : (
          <ul className="mt-1.5 space-y-1.5">
            {selectedEvents.map((e, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className={`mt-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${KIND_STYLE[e.kind].chip}`}>
                  {KIND_STYLE[e.kind].name}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-medium text-ink">{e.label}</span>
                  {e.detail && <span className="block truncate text-xs text-muted">{e.detail}</span>}
                </span>
                <span className="ml-auto shrink-0 text-xs tabular-nums text-faint">
                  {new Date(e.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
