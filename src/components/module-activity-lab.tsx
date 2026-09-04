'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import type {
  ChallengeGame,
  EnrichedModule,
  Flashcard,
  MemoryGame,
  MemoryPair,
  ModuleMindMap,
} from '@/lib/course-schema';
import { normalizeModuleActivities } from '@/lib/module-activity-catalog';
import { usePersisted } from '@/lib/use-persisted';
import { Confetti, mulberry32, ScoreRing } from './celebrate';
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  AwardIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  CloseIcon,
  LayersIcon,
  LightbulbIcon,
  QuizIcon,
  RefreshIcon,
  SparklesIcon,
  TargetIcon,
} from './icons';

/* ═══════════════════════════════════════════════════════════════════════
   PRACTICE LAB
   Four ways to rehearse one module, a map you explore, a deck you grade
   yourself on, a concentration game, and a timed decision sprint. Each one
   owns a colour channel (`--ch`) and reports progress + XP up to the shell,
   so the header always shows how close the module is to mastered.
   ═══════════════════════════════════════════════════════════════════════ */

type LabTab = 'mindMap' | 'flashcards' | 'memoryGame' | 'challengeGame';

const CHANNEL: Record<LabTab, string> = {
  mindMap: 'var(--color-ch-map)',
  flashcards: 'var(--color-ch-cards)',
  memoryGame: 'var(--color-ch-memory)',
  challengeGame: 'var(--color-ch-sprint)',
};

const TABS: Array<{ id: LabTab; label: string; blurb: string; icon: ReactNode }> = [
  { id: 'mindMap', label: 'Mind map', blurb: 'See how it fits together', icon: <LayersIcon className="h-4 w-4" /> },
  { id: 'flashcards', label: 'Flashcards', blurb: 'Recall it from memory', icon: <LightbulbIcon className="h-4 w-4" /> },
  { id: 'memoryGame', label: 'Memory', blurb: 'Match the pairs', icon: <SparklesIcon className="h-4 w-4" /> },
  { id: 'challengeGame', label: 'Sprint', blurb: 'Decide under pressure', icon: <TargetIcon className="h-4 w-4" /> },
];

/** Inline `--ch` so every child utility tints itself from one variable. */
function ch(color: string, extra?: CSSProperties): CSSProperties {
  return { ['--ch' as string]: color, ...extra } as CSSProperties;
}

type LabProgress = { xp: number; done: Partial<Record<LabTab, number>> };

export function ModuleActivityLab({
  module,
  moduleIndex,
  courseKey,
  quizLocked,
  onQuiz,
  onBackToOverview,
}: {
  module: EnrichedModule;
  moduleIndex: number;
  /** Identifies the course this module belongs to — without it, two courses
      whose module titles happen to match would share saved progress. */
  courseKey: string;
  quizLocked: boolean;
  onQuiz: () => void;
  onBackToOverview: () => void;
}) {
  const activities = useMemo(() => normalizeModuleActivities(module), [module]);
  const [activeTab, setActiveTab] = useState<LabTab>('mindMap');
  /* Scoped to the course AND the module title: the course stops one course's
     progress leaking into another, the title means a module that gets moved or
     replaced by an edit starts clean rather than inheriting the old one's XP. */
  const storageKey = `courseai:lab:${slug(courseKey)}:${moduleIndex}:${slug(module.title)}`;
  const [progress, setProgress] = usePersisted<LabProgress>(storageKey, { xp: 0, done: {} });
  const [xpBurst, setXpBurst] = useState<{ id: number; amount: number } | null>(null);

  const report = useCallback(
    (tab: LabTab, fraction: number, xpGain = 0) => {
      setProgress((prev) => ({
        xp: prev.xp + xpGain,
        done: { ...prev.done, [tab]: Math.max(prev.done[tab] ?? 0, clamp01(fraction)) },
      }));
      if (xpGain > 0) setXpBurst({ id: Date.now(), amount: xpGain });
    },
    [setProgress],
  );

  const mastery = TABS.reduce((sum, tab) => sum + (progress.done[tab.id] ?? 0), 0) / TABS.length;
  const allCleared = TABS.every((tab) => (progress.done[tab.id] ?? 0) >= 0.999);
  const activeColor = CHANNEL[activeTab];

  return (
    <div className="animate-fade-in-up mx-auto max-w-6xl">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 text-xs font-medium text-faint">
        <button onClick={onBackToOverview} className="u-link text-accent">
          Module {moduleIndex + 1}
        </button>
        <span>/</span>
        <span className="truncate">{module.title}</span>
      </div>

      <div
        className="arena mt-3 overflow-hidden rounded-3xl p-6 sm:p-8"
        style={ch(activeColor)}
      >
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <span
              className="ch-soft ch-border ch-text inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em]"
            >
              <SparklesIcon className="h-3.5 w-3.5" />
              Practice lab
            </span>
            <h1 className="display mt-4 text-[2.1rem] text-ink sm:text-[2.9rem]">
              {module.title}
            </h1>
            <p className="mt-3 max-w-2xl text-[15px] leading-7 text-muted">{module.summary}</p>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <StatChip icon={<AwardIcon className="h-3.5 w-3.5" />} label={`${progress.xp} XP`} highlight />
              <StatChip
                icon={<CheckIcon className="h-3.5 w-3.5" />}
                label={`${TABS.filter((t) => (progress.done[t.id] ?? 0) >= 0.999).length}/4 activities cleared`}
              />
              <StatChip icon={<QuizIcon className="h-3.5 w-3.5" />} label={`${module.quiz.length}-question quiz`} />
            </div>
          </div>

          <div className="relative flex shrink-0 items-center gap-5 self-start rounded-2xl border border-line/70 bg-canvas/70 px-5 py-4 backdrop-blur">
            <ScoreRing value={mastery} size={76} stroke={7} color={activeColor} />
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-faint">Module mastery</p>
              <p className="display mt-1 text-2xl text-ink">{Math.round(mastery * 100)}%</p>
              <p className="mt-0.5 text-xs text-muted">
                {allCleared ? 'Lab complete, take the quiz' : 'Clear all four to unlock a perfect run'}
              </p>
            </div>
            {xpBurst && (
              <span
                key={xpBurst.id}
                className="score-rise pointer-events-none absolute -top-1 right-4 text-sm font-bold text-success"
                onAnimationEnd={() => setXpBurst(null)}
              >
                +{xpBurst.amount} XP
              </span>
            )}
          </div>
        </div>

        {/* ── Tabs ─────────────────────────────────────────────── */}
        <div className="mt-7 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
          {TABS.map((tab) => {
            const active = activeTab === tab.id;
            const value = progress.done[tab.id] ?? 0;
            const cleared = value >= 0.999;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                aria-pressed={active}
                style={ch(CHANNEL[tab.id])}
                className={[
                  'ring-focus group relative overflow-hidden rounded-2xl border p-4 text-left transition-all duration-200',
                  active
                    ? 'ch-border ch-glow -translate-y-0.5 bg-canvas'
                    : 'border-line bg-canvas/60 hover:-translate-y-0.5 hover:border-line-strong',
                ].join(' ')}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={[
                      'flex h-9 w-9 items-center justify-center rounded-xl transition-colors',
                      active ? 'ch-fill' : 'ch-soft ch-text',
                    ].join(' ')}
                  >
                    {tab.icon}
                  </span>
                  {cleared ? (
                    <span className="pop-in flex h-6 w-6 items-center justify-center rounded-full bg-success text-white">
                      <CheckIcon className="h-3.5 w-3.5" />
                    </span>
                  ) : (
                    <span className="text-[11px] font-semibold text-faint">{Math.round(value * 100)}%</span>
                  )}
                </div>
                <p className={['mt-3 text-sm font-bold', active ? 'text-ink' : 'text-ink/80'].join(' ')}>{tab.label}</p>
                <p className="mt-0.5 text-xs text-muted">{tab.blurb}</p>
                <span className="mt-3 block h-1 overflow-hidden rounded-full bg-line">
                  <span
                    className="ch-fill block h-full rounded-full transition-[width] duration-500"
                    style={{ width: `${Math.max(value * 100, cleared ? 100 : 2)}%` }}
                  />
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Active activity ──────────────────────────────────────── */}
      <div key={activeTab} className="animate-fade-in-up mt-5">
        {activeTab === 'mindMap' && (
          <MindMapStudio mindMap={activities.mindMap} onProgress={(f, xp) => report('mindMap', f, xp)} />
        )}
        {activeTab === 'flashcards' && (
          <FlashcardStudio cards={activities.flashcards} onProgress={(f, xp) => report('flashcards', f, xp)} />
        )}
        {activeTab === 'memoryGame' && (
          <MemoryArena
            game={activities.memoryGame}
            storageKey={`${storageKey}:memory`}
            onProgress={(f, xp) => report('memoryGame', f, xp)}
          />
        )}
        {activeTab === 'challengeGame' && (
          <SprintArena game={activities.challengeGame} onProgress={(f, xp) => report('challengeGame', f, xp)} />
        )}
      </div>

      <QuizLaunchPanel
        quizCount={module.quiz.length}
        locked={quizLocked}
        ready={allCleared}
        xp={progress.xp}
        onQuiz={onQuiz}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   1. MIND MAP, an explorable radial map
   ═══════════════════════════════════════════════════════════════════════ */

function MindMapStudio({
  mindMap,
  onProgress,
}: {
  mindMap: ModuleMindMap;
  onProgress: (fraction: number, xp?: number) => void;
}) {
  const branches = mindMap.branches;
  const [active, setActive] = useState(0);
  /* Branch 0 is shown first but only counts once the learner actually opens it,
     so the "explored" chip and the tab's progress bar always agree. */
  const [visited, setVisited] = useState<Set<number>>(() => new Set());

  const W = 880;
  const H = 520;
  const cx = W / 2;
  const cy = H / 2;
  const R = branches.length > 4 ? 196 : 182;
  const nodeW = 186;
  const nodeH = 66;

  const nodes = branches.map((branch, index) => {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / Math.max(branches.length, 1);
    return {
      branch,
      index,
      x: cx + R * Math.cos(angle),
      y: cy + R * Math.sin(angle) * 0.92,
      color: mapPalette(index),
    };
  });

  function open(index: number) {
    setActive(index);
    if (visited.has(index)) return;
    const next = new Set(visited).add(index);
    setVisited(next);
    onProgress(next.size / branches.length, 8);
  }

  const current = branches[active] ?? branches[0];

  return (
    <div className="arena rounded-3xl p-4 sm:p-6" style={ch(CHANNEL.mindMap)}>
      <ActivityHeader
        eyebrow="Mind map"
        title={mindMap.centralIdea}
        subtitle="Tap any branch to open it. Explore all of them to clear this activity."
        right={
          <StatChip
            icon={<LayersIcon className="h-3.5 w-3.5" />}
            label={`${visited.size}/${branches.length} explored`}
            highlight={visited.size === branches.length}
          />
        }
      />

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.6fr)]">
        <div className="relative overflow-hidden rounded-2xl border border-line bg-canvas">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="h-auto w-full touch-manipulation"
            role="group"
            aria-label={`Mind map of ${mindMap.centralIdea}`}
          >
            <defs>
              <radialGradient id="mm-core" cx="34%" cy="26%" r="82%">
                <stop offset="0%" stopColor="#a78bfa" />
                <stop offset="55%" stopColor="#7c3aed" />
                <stop offset="100%" stopColor="#4c1d95" />
              </radialGradient>
              <pattern id="mm-grid" width="26" height="26" patternUnits="userSpaceOnUse">
                <path d="M26 0H0V26" fill="none" stroke="rgba(15,23,42,0.045)" strokeWidth="1" />
              </pattern>
              <filter id="mm-shadow" x="-40%" y="-40%" width="180%" height="180%">
                <feDropShadow dx="0" dy="6" stdDeviation="8" floodColor="#0f172a" floodOpacity="0.12" />
              </filter>
            </defs>

            <rect width={W} height={H} fill="url(#mm-grid)" />

            {/* Curved connectors, drawn in on mount */}
            {nodes.map((node) => {
              const midX = (cx + node.x) / 2 + (node.y - cy) * 0.14;
              const midY = (cy + node.y) / 2 - (node.x - cx) * 0.14;
              const length = Math.hypot(node.x - cx, node.y - cy) * 1.25;
              const isActive = node.index === active;
              return (
                <path
                  key={`edge-${node.index}`}
                  d={`M ${cx} ${cy} Q ${midX} ${midY} ${node.x} ${node.y}`}
                  fill="none"
                  stroke={node.color}
                  strokeOpacity={isActive ? 0.95 : 0.35}
                  strokeWidth={isActive ? 3.4 : 2.2}
                  strokeLinecap="round"
                  className="edge-draw"
                  style={{ ['--len' as string]: length, ['--d' as string]: `${node.index * 110}ms` } as CSSProperties}
                />
              );
            })}

            {/* Branch nodes */}
            {nodes.map((node) => {
              const isActive = node.index === active;
              const seen = visited.has(node.index);
              return (
                <g
                  key={`node-${node.index}`}
                  role="button"
                  tabIndex={0}
                  aria-label={`${node.branch.title}. ${node.branch.summary}`}
                  aria-pressed={isActive}
                  onClick={() => open(node.index)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      open(node.index);
                    }
                  }}
                  className="tile-in cursor-pointer outline-none"
                  style={{
                    ['--d' as string]: `${260 + node.index * 110}ms`,
                    transformOrigin: `${node.x}px ${node.y}px`,
                    transform: isActive ? 'scale(1.06)' : 'scale(1)',
                    transition: 'transform 260ms cubic-bezier(0.2,0.9,0.25,1.25)',
                    opacity: isActive ? 1 : 0.92,
                  }}
                >
                  <rect
                    x={node.x - nodeW / 2}
                    y={node.y - nodeH / 2}
                    width={nodeW}
                    height={nodeH}
                    rx={16}
                    fill="#ffffff"
                    stroke={node.color}
                    strokeWidth={isActive ? 2.6 : 1.5}
                    filter="url(#mm-shadow)"
                  />
                  <rect
                    x={node.x - nodeW / 2}
                    y={node.y - nodeH / 2}
                    width={6}
                    height={nodeH}
                    rx={3}
                    fill={node.color}
                  />
                  {wrapSvgText(node.branch.title, 22, 2).map((line, lineIndex, lines) => (
                    <text
                      key={lineIndex}
                      x={node.x - nodeW / 2 + 20}
                      y={node.y + (lineIndex - (lines.length - 1) / 2) * 15}
                      dominantBaseline="central"
                      fontSize={13}
                      fontWeight={700}
                      fill="#0f172a"
                    >
                      {line}
                    </text>
                  ))}
                  <circle
                    cx={node.x + nodeW / 2 - 16}
                    cy={node.y - nodeH / 2 + 16}
                    r={9}
                    fill={seen ? '#059669' : '#ffffff'}
                    stroke={seen ? '#059669' : node.color}
                    strokeWidth={1.4}
                  />
                  {seen ? (
                    <path
                      d={`M ${node.x + nodeW / 2 - 20} ${node.y - nodeH / 2 + 16} l 3 3 l 5.5 -6`}
                      fill="none"
                      stroke="#ffffff"
                      strokeWidth={1.9}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ) : (
                    <text
                      x={node.x + nodeW / 2 - 16}
                      y={node.y - nodeH / 2 + 16}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={10}
                      fontWeight={800}
                      fill={node.color}
                    >
                      {node.branch.points.length}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Core */}
            <g>
              {/* transform-origin matters: an SVG scale() without it pivots on (0,0) and the halo drifts */}
              <circle
                cx={cx}
                cy={cy}
                r={78}
                fill="#7c3aed"
                opacity={0.16}
                className="halo"
                style={{ transformOrigin: `${cx}px ${cy}px` }}
              />
              <circle cx={cx} cy={cy} r={74} fill="url(#mm-core)" filter="url(#mm-shadow)" />
              <circle cx={cx} cy={cy} r={74} fill="none" stroke="#ffffff" strokeOpacity={0.6} strokeWidth={2} />
              {wrapSvgText(mindMap.centralIdea, 17, 3).map((line, index, lines) => (
                <text
                  key={index}
                  x={cx}
                  y={cy + (index - (lines.length - 1) / 2) * 16}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={13}
                  fontWeight={800}
                  fill="#ffffff"
                >
                  {line}
                </text>
              ))}
            </g>
          </svg>
        </div>

        {/* Detail panel for the open branch */}
        <div className="flex flex-col gap-3">
          <div
            key={active}
            className="pop-in rounded-2xl border bg-canvas p-5"
            style={{ borderColor: `${mapPalette(active)}55` }}
          >
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: mapPalette(active) }} />
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-faint">
                Branch {active + 1} of {branches.length}
              </p>
            </div>
            <h3 className="mt-2 text-lg font-bold leading-snug text-ink">{current?.title}</h3>
            <p className="mt-2 text-sm leading-6 text-muted">{current?.summary}</p>
            <ul className="mt-4 space-y-2">
              {current?.points.map((point, index) => (
                <li
                  key={index}
                  className="tile-in flex gap-2.5 rounded-xl bg-surface px-3 py-2.5 text-[13px] leading-6 text-ink/85"
                  style={{ ['--d' as string]: `${index * 70}ms` } as CSSProperties}
                >
                  <span
                    className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                    style={{ backgroundColor: mapPalette(active) }}
                  >
                    {index + 1}
                  </span>
                  {point}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => open((active - 1 + branches.length) % branches.length)}
              className="ring-focus press flex-1 rounded-xl border border-line bg-canvas px-3 py-2.5 text-sm font-semibold text-ink"
            >
              <ChevronLeftIcon className="mr-1 inline h-4 w-4" />
              Previous
            </button>
            <button
              type="button"
              onClick={() => open((active + 1) % branches.length)}
              className="ring-focus press ch-fill flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold"
            >
              Next branch
              <ChevronRightIcon className="ml-1 inline h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   2. FLASHCARDS, 3D flip deck with self-grading
   ═══════════════════════════════════════════════════════════════════════ */

function FlashcardStudio({
  cards,
  onProgress,
}: {
  cards: Flashcard[];
  onProgress: (fraction: number, xp?: number) => void;
}) {
  const [queue, setQueue] = useState<number[]>(() => cards.map((_, index) => index));
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [known, setKnown] = useState<Set<number>>(() => new Set());
  const [repeats, setRepeats] = useState(0);

  const cardIndex = queue[pos];
  const card = cards[cardIndex];
  const finished = pos >= queue.length;
  const remaining = Math.max(queue.length - pos, 0);

  const grade = useCallback(
    (got: boolean) => {
      if (cardIndex === undefined) return;
      if (got) {
        if (!known.has(cardIndex)) {
          const next = new Set(known).add(cardIndex);
          setKnown(next);
          onProgress(next.size / cards.length, 12);
        }
      } else {
        setQueue((prev) => [...prev, cardIndex]);
        setRepeats((n) => n + 1);
      }
      setFlipped(false);
      setShowHint(false);
      setPos((p) => p + 1);
    },
    [cardIndex, cards.length, known, onProgress],
  );

  const step = useCallback(
    (delta: number) => {
      setFlipped(false);
      setShowHint(false);
      setPos((p) => Math.min(Math.max(p + delta, 0), queue.length));
    },
    [queue.length],
  );

  /* Keyboard: ← → move, space flips, 1/2 grade. */
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (event.key === 'ArrowRight') step(1);
      else if (event.key === 'ArrowLeft') step(-1);
      else if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        setFlipped((f) => !f);
      } else if (event.key === '1') grade(false);
      else if (event.key === '2') grade(true);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [grade, step]);

  function restart(onlyMissed: boolean) {
    const pool = onlyMissed ? cards.map((_, i) => i).filter((i) => !known.has(i)) : cards.map((_, i) => i);
    setQueue(pool.length ? pool : cards.map((_, i) => i));
    setPos(0);
    setFlipped(false);
    setShowHint(false);
    setRepeats(0);
    if (!onlyMissed) setKnown(new Set());
  }

  if (finished) {
    const mastered = known.size;
    const perfect = mastered === cards.length && repeats === 0;
    return (
      <div className="arena relative overflow-hidden rounded-3xl p-6 sm:p-10" style={ch(CHANNEL.flashcards)}>
        {mastered === cards.length && <Confetti seed={mastered} />}
        <div className="relative mx-auto max-w-md text-center">
          <div className="ch-grad mx-auto flex h-20 w-20 items-center justify-center rounded-3xl text-white shadow-lg">
            <AwardIcon className="h-9 w-9" />
          </div>
          <h3 className="display mt-6 text-3xl text-ink">
            {perfect ? 'Flawless deck' : mastered === cards.length ? 'Deck cleared' : 'Round complete'}
          </h3>
          <p className="mt-2 text-muted">
            You recalled <strong className="text-ink">{mastered}</strong> of {cards.length} cards
            {repeats > 0 ? ` with ${repeats} repeat${repeats === 1 ? '' : 's'}.` : ' on the first pass.'}
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            {mastered < cards.length && (
              <button
                type="button"
                onClick={() => restart(true)}
                className="ring-focus press ch-fill ch-glow rounded-xl px-5 py-3 text-sm font-bold"
              >
                Review the {cards.length - mastered} I missed
              </button>
            )}
            <button
              type="button"
              onClick={() => restart(false)}
              className="ring-focus press rounded-xl border border-line bg-canvas px-5 py-3 text-sm font-bold text-ink"
            >
              <RefreshIcon className="mr-1.5 inline h-4 w-4" />
              Shuffle again
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!card) return null;

  return (
    <div className="arena rounded-3xl p-4 sm:p-6" style={ch(CHANNEL.flashcards)}>
      <ActivityHeader
        eyebrow="Flashcards"
        title="Recall before you reveal"
        subtitle="Say the answer out loud, flip, then grade yourself honestly."
        right={
          <div className="flex items-center gap-2">
            <StatChip icon={<CheckIcon className="h-3.5 w-3.5" />} label={`${known.size} mastered`} highlight={known.size > 0} />
            <StatChip label={`${remaining} left`} />
          </div>
        }
      />

      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-line">
        <div
          className="ch-fill h-full rounded-full transition-[width] duration-500"
          style={{ width: `${(known.size / cards.length) * 100}%` }}
        />
      </div>

      {/* Card stack */}
      <div className="relative mx-auto mt-7 max-w-2xl">
        <div
          className="deck-ghost absolute inset-x-6 -top-3 h-full rounded-3xl border border-line bg-canvas/70"
          style={{ transform: 'scale(0.96)' }}
          aria-hidden
        />
        <div
          className="deck-ghost absolute inset-x-3 -top-1.5 h-full rounded-3xl border border-line bg-canvas/85"
          style={{ transform: 'scale(0.98)' }}
          aria-hidden
        />

        <div className="flip-scene relative">
          <button
            type="button"
            onClick={() => setFlipped((f) => !f)}
            aria-pressed={flipped}
            aria-label={flipped ? 'Hide the answer' : 'Reveal the answer'}
            className={['flip-inner ring-focus block w-full text-left', flipped ? 'is-flipped' : ''].join(' ')}
            style={{ minHeight: 320 }}
          >
            {/* Front */}
            <span className="flip-face ch-border flex min-h-[320px] w-full flex-col justify-between rounded-3xl border-2 bg-canvas p-7 shadow-soft">
              <span className="flex items-center justify-between">
                <span className="ch-soft ch-text inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em]">
                  <LightbulbIcon className="h-3.5 w-3.5" />
                  Prompt
                </span>
                <span className="text-xs font-semibold text-faint">
                  {Math.min(pos + 1, queue.length)} / {queue.length}
                </span>
              </span>
              <span className="block break-words text-[1.6rem] font-bold leading-snug text-ink sm:text-[2rem]">
                {card.front}
              </span>
              <span className="block text-sm text-muted">
                {showHint ? (
                  <span className="ch-soft block rounded-xl px-3.5 py-2.5 text-ink/80">Hint: {card.hint}</span>
                ) : (
                  <span className="text-faint">Tap the card to reveal · Space flips · ← → moves</span>
                )}
              </span>
            </span>

            {/* Back */}
            <span className="flip-face flip-face-back ch-grad flex min-h-[320px] w-full flex-col justify-between rounded-3xl p-7 text-white shadow-soft">
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em]">
                <CheckIcon className="h-3.5 w-3.5" />
                Answer
              </span>
              <span className="block break-words text-[1.35rem] font-semibold leading-relaxed sm:text-[1.55rem]">
                {card.back}
              </span>
              <span className="block text-sm text-white/80">How did you do? Grade yourself below.</span>
            </span>
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
        <button
          type="button"
          onClick={() => step(-1)}
          disabled={pos === 0}
          className="ring-focus press rounded-xl border border-line bg-canvas p-3 text-muted disabled:opacity-40"
          aria-label="Previous card"
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </button>

        {flipped ? (
          <>
            <button
              type="button"
              onClick={() => grade(false)}
              className="ring-focus press inline-flex items-center gap-2 rounded-xl border-2 border-warn/40 bg-warn-soft px-5 py-3 text-sm font-bold text-warn"
            >
              <RefreshIcon className="h-4 w-4" />
              Still learning
            </button>
            <button
              type="button"
              onClick={() => grade(true)}
              className="ring-focus press inline-flex items-center gap-2 rounded-xl bg-success px-6 py-3 text-sm font-bold text-white shadow-[0_12px_28px_-12px_rgba(5,150,105,0.8)]"
            >
              <CheckIcon className="h-4 w-4" />
              Got it
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setShowHint((h) => !h)}
              className="ring-focus press rounded-xl border border-line bg-canvas px-4 py-3 text-sm font-semibold text-ink"
            >
              {showHint ? 'Hide hint' : 'Show hint'}
            </button>
            <button
              type="button"
              onClick={() => setFlipped(true)}
              className="ring-focus press ch-fill ch-glow inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold"
            >
              Reveal answer
              <ArrowRightIcon className="h-4 w-4" />
            </button>
          </>
        )}

        <button
          type="button"
          onClick={() => step(1)}
          className="ring-focus press rounded-xl border border-line bg-canvas p-3 text-muted"
          aria-label="Next card"
        >
          <ChevronRightIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   3. MEMORY MATCH, a real concentration game
   ═══════════════════════════════════════════════════════════════════════ */

type MemoryTile = { id: string; pairIndex: number; kind: 'prompt' | 'match'; text: string };

function MemoryArena({
  game,
  storageKey,
  onProgress,
}: {
  game: MemoryGame;
  storageKey: string;
  onProgress: (fraction: number, xp?: number) => void;
}) {
  const pairs = useMemo(() => game.pairs.slice(0, 6), [game.pairs]);
  const [seed, setSeed] = useState(() => stableHash(game.title));
  const tiles = useMemo(() => shuffle(buildTiles(pairs), seed), [pairs, seed]);

  const [revealed, setRevealed] = useState<string[]>([]);
  const [matched, setMatched] = useState<Set<number>>(() => new Set());
  const [wrong, setWrong] = useState<string[]>([]);
  const [moves, setMoves] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [score, setScore] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [started, setStarted] = useState(false);
  const [best, setBest] = usePersisted<number | null>(storageKey, null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const complete = matched.size === pairs.length;
  /* The clock runs from the first flip until the board is cleared. */
  const ticking = started && !complete;

  useEffect(() => {
    if (!ticking) return;
    const id = setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => clearInterval(id);
  }, [ticking]);

  useEffect(() => () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); }, []);

  function flip(tile: MemoryTile) {
    if (complete || matched.has(tile.pairIndex) || revealed.includes(tile.id) || revealed.length >= 2) return;
    if (!started) setStarted(true);

    const next = [...revealed, tile.id];
    setRevealed(next);
    setWrong([]);
    if (next.length < 2) {
      setNote(null);
      return;
    }

    setMoves((value) => value + 1);
    const first = tiles.find((candidate) => candidate.id === next[0]);
    if (!first) return;

    if (first.pairIndex === tile.pairIndex && first.kind !== tile.kind) {
      const nextStreak = streak + 1;
      const gained = 20 + (nextStreak - 1) * 10;
      const nextMatched = new Set(matched).add(tile.pairIndex);
      setMatched(nextMatched);
      setStreak(nextStreak);
      setBestStreak((value) => Math.max(value, nextStreak));
      setScore((value) => value + gained);
      setRevealed([]);
      setNote(pairs[tile.pairIndex]?.explanation ?? 'Matched.');
      onProgress(nextMatched.size / pairs.length, gained);
      if (nextMatched.size === pairs.length) {
        setBest((previous) => (previous === null || elapsed < previous ? elapsed : previous));
      }
    } else {
      setStreak(0);
      setWrong(next);
      setNote('Not a pair, remember where those two sit.');
      timeoutRef.current = setTimeout(() => {
        setRevealed([]);
        setWrong([]);
      }, 950);
    }
  }

  function reset() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setSeed(Date.now());
    setRevealed([]);
    setMatched(new Set());
    setWrong([]);
    setMoves(0);
    setStreak(0);
    setBestStreak(0);
    setScore(0);
    setNote(null);
    setElapsed(0);
    setStarted(false);
  }

  const accuracy = moves > 0 ? Math.round((matched.size / moves) * 100) : 0;

  return (
    <div className="arena relative overflow-hidden rounded-3xl p-4 sm:p-6" style={ch(CHANNEL.memoryGame)}>
      {complete && <Confetti seed={moves + pairs.length} />}
      <ActivityHeader
        eyebrow="Memory match"
        title={game.title}
        subtitle={game.instructions}
        right={
          <button
            type="button"
            onClick={reset}
            className="ring-focus press inline-flex items-center gap-1.5 rounded-xl border border-line bg-canvas px-3.5 py-2 text-sm font-semibold text-ink"
          >
            <RefreshIcon className="h-4 w-4" />
            New game
          </button>
        }
      />

      {/* Scoreboard */}
      <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <ScoreCell label="Score" value={score.toLocaleString()} accent />
        <ScoreCell label="Time" value={formatTime(elapsed)} hint={best !== null ? `best ${formatTime(best)}` : undefined} />
        <ScoreCell label="Moves" value={String(moves)} hint={moves > 0 ? `${accuracy}% accurate` : undefined} />
        <ScoreCell
          label="Streak"
          value={`${streak}×`}
          hint={bestStreak > 1 ? `best ${bestStreak}×` : undefined}
          hot={streak >= 2}
        />
      </div>

      {/* Board */}
      <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
        {tiles.map((tile, index) => {
          const isMatched = matched.has(tile.pairIndex);
          const isUp = isMatched || revealed.includes(tile.id);
          const isWrong = wrong.includes(tile.id);
          return (
            <button
              key={tile.id}
              type="button"
              onClick={() => flip(tile)}
              disabled={isMatched}
              aria-label={isUp ? tile.text : `Hidden tile ${index + 1}`}
              className={['flip-scene tile-in ring-focus block h-[132px] w-full text-left', isWrong ? 'nudge' : ''].join(' ')}
              style={{ ['--d' as string]: `${index * 45}ms` } as CSSProperties}
            >
              <span className={['flip-inner block h-full w-full', isUp ? 'is-flipped' : ''].join(' ')}>
                {/* Face down */}
                <span className="flip-face ch-grad absolute inset-0 flex h-full w-full items-center justify-center rounded-2xl text-white shadow-soft transition-transform hover:scale-[1.02]">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/20 text-lg font-black">
                    {index + 1}
                  </span>
                </span>
                {/* Face up */}
                <span
                  className={[
                    'flip-face flip-face-back absolute inset-0 flex h-full w-full items-center justify-center rounded-2xl border-2 px-3 py-2.5 text-center text-[12.5px] font-semibold leading-[1.35]',
                    isMatched
                      ? 'border-success bg-success-soft text-success'
                      : isWrong
                        ? 'border-danger bg-danger-soft text-danger'
                        : 'ch-border ch-soft text-ink',
                  ].join(' ')}
                >
                  <span className="line-clamp-5">{tile.text}</span>
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Status strip */}
      <div
        className={[
          'mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3.5 transition-colors',
          complete ? 'border-success/40 bg-success-soft' : 'border-line bg-canvas',
        ].join(' ')}
      >
        <div className="flex items-center gap-2.5">
          <span
            className={[
              'flex h-8 w-8 items-center justify-center rounded-xl',
              complete ? 'bg-success text-white' : 'ch-soft ch-text',
            ].join(' ')}
          >
            {complete ? <CheckIcon className="h-4 w-4" /> : <SparklesIcon className="h-4 w-4" />}
          </span>
          <p className="text-sm font-bold text-ink">
            {matched.size}/{pairs.length} pairs
          </p>
        </div>
        <p key={note ?? 'idle'} className={['pop-in max-w-xl text-sm', complete ? 'font-bold text-success' : 'text-muted'].join(' ')}>
          {complete
            ? `Board cleared in ${formatTime(elapsed)} with ${moves} moves, ${score} points.`
            : note ?? 'Flip two tiles to find a matching pair. Consecutive matches multiply your score.'}
        </p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   4. SCENARIO SPRINT, timed, one round at a time
   ═══════════════════════════════════════════════════════════════════════ */

const ROUND_SECONDS = 30;

function SprintArena({
  game,
  onProgress,
}: {
  game: ChallengeGame;
  onProgress: (fraction: number, xp?: number) => void;
}) {
  const rounds = game.rounds;
  const [round, setRound] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [locked, setLocked] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [points, setPoints] = useState(0);
  const [remaining, setRemaining] = useState(ROUND_SECONDS);
  const [finished, setFinished] = useState(false);
  const [log, setLog] = useState<boolean[]>([]);

  const current = rounds[round];

  const lockIn = useCallback(
    (choice: number | null) => {
      if (locked || !current) return;
      const right = choice === current.answerIndex;
      const timeBonus = right ? Math.round(remaining * 1.5) : 0;
      const streakBonus = right ? streak * 15 : 0;
      const gained = right ? 40 + timeBonus + streakBonus : 0;

      setPicked(choice);
      setLocked(true);
      setLog((prev) => [...prev, right]);
      setPoints((value) => value + gained);
      if (right) {
        setCorrectCount((value) => value + 1);
        setStreak((value) => {
          const next = value + 1;
          setBestStreak((best) => Math.max(best, next));
          return next;
        });
      } else {
        setStreak(0);
      }
      onProgress((round + 1) / rounds.length, gained);
    },
    [current, locked, onProgress, remaining, round, rounds.length, streak],
  );

  /* Round countdown — the tick that would take it below zero locks the round as a miss. */
  useEffect(() => {
    if (locked || finished) return;
    const id = setTimeout(() => {
      if (remaining <= 1) lockIn(null);
      else setRemaining(remaining - 1);
    }, 1000);
    return () => clearTimeout(id);
  }, [remaining, locked, finished, lockIn]);

  function next() {
    if (round + 1 >= rounds.length) {
      setFinished(true);
      return;
    }
    setRound((value) => value + 1);
    setPicked(null);
    setLocked(false);
    setRemaining(ROUND_SECONDS);
  }

  function restart() {
    setRound(0);
    setPicked(null);
    setLocked(false);
    setCorrectCount(0);
    setStreak(0);
    setBestStreak(0);
    setPoints(0);
    setRemaining(ROUND_SECONDS);
    setFinished(false);
    setLog([]);
  }

  if (finished) {
    const ratio = correctCount / rounds.length;
    const grade = ratio === 1 ? 'S' : ratio >= 0.75 ? 'A' : ratio >= 0.5 ? 'B' : 'C';
    return (
      <div className="arena relative overflow-hidden rounded-3xl p-6 sm:p-10" style={ch(CHANNEL.challengeGame)}>
        {ratio >= 0.75 && <Confetti seed={points} />}
        <div className="relative mx-auto max-w-lg text-center">
          <div className="ch-grad mx-auto flex h-24 w-24 items-center justify-center rounded-3xl text-4xl font-black text-white shadow-lg">
            {grade}
          </div>
          <h3 className="display mt-6 text-3xl text-ink">
            {ratio === 1 ? 'Perfect sprint' : ratio >= 0.5 ? 'Sprint complete' : 'Worth another run'}
          </h3>
          <p className="mt-2 text-muted">
            {correctCount} of {rounds.length} calls right · {points.toLocaleString()} points
            {bestStreak > 1 ? ` · best streak ${bestStreak}×` : ''}
          </p>
          <div className="mt-5 flex justify-center gap-1.5">
            {log.map((right, index) => (
              <span
                key={index}
                className={[
                  'pop-in flex h-8 w-8 items-center justify-center rounded-lg text-white',
                  right ? 'bg-success' : 'bg-danger',
                ].join(' ')}
                style={{ animationDelay: `${index * 90}ms` }}
              >
                {right ? <CheckIcon className="h-4 w-4" /> : <CloseIcon className="h-4 w-4" />}
              </span>
            ))}
          </div>
          <button
            type="button"
            onClick={restart}
            className="ring-focus press ch-fill ch-glow mt-7 inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold"
          >
            <RefreshIcon className="h-4 w-4" />
            Run it again
          </button>
        </div>
      </div>
    );
  }

  if (!current) return null;

  const urgent = remaining <= 8 && !locked;

  return (
    <div className="arena rounded-3xl p-4 sm:p-6" style={ch(CHANNEL.challengeGame)}>
      <ActivityHeader
        eyebrow="Scenario sprint"
        title={game.title}
        subtitle={game.premise}
        right={
          <div className="flex items-center gap-2">
            <StatChip icon={<AwardIcon className="h-3.5 w-3.5" />} label={`${points} pts`} highlight={points > 0} />
            {streak > 1 && <StatChip icon={<SparklesIcon className="h-3.5 w-3.5" />} label={`${streak}× streak`} highlight />}
          </div>
        }
      />

      {/* Round + timer */}
      <div className="mt-5 flex items-center gap-3">
        <div className="flex gap-1.5">
          {rounds.map((_, index) => (
            <span
              key={index}
              className={[
                'h-1.5 w-8 rounded-full transition-colors',
                index < round ? (log[index] ? 'bg-success' : 'bg-danger') : index === round ? 'ch-fill' : 'bg-line',
              ].join(' ')}
            />
          ))}
        </div>
        <span className="text-xs font-bold uppercase tracking-[0.14em] text-faint">
          Round {round + 1} of {rounds.length}
        </span>
        <span
          className={[
            'ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold tabular-nums transition-colors',
            locked ? 'bg-surface text-faint' : urgent ? 'bg-danger-soft text-danger' : 'ch-soft ch-text',
          ].join(' ')}
        >
          <ClockIcon className="h-3.5 w-3.5" />
          {locked ? '--' : `${remaining}s`}
        </span>
      </div>

      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
        <div
          className={['timer-track h-full rounded-full', urgent ? 'bg-danger' : 'ch-fill'].join(' ')}
          style={{ transform: `scaleX(${locked ? 0 : remaining / ROUND_SECONDS})` }}
        />
      </div>

      {/* Scenario */}
      <div key={round} className="pop-in mt-5 rounded-2xl border border-line bg-canvas p-5 sm:p-6">
        <p className="text-[1.05rem] font-semibold leading-7 text-ink sm:text-lg">{current.scenario}</p>

        <div className="mt-4 grid gap-2.5">
          {current.choices.map((choice, index) => {
            const isPicked = picked === index;
            const isRight = current.answerIndex === index;
            let cls = 'border-line bg-surface hover:-translate-y-0.5 hover:border-line-strong';
            if (locked) {
              if (isRight) cls = 'border-success bg-success-soft';
              else if (isPicked) cls = 'border-danger bg-danger-soft';
              else cls = 'border-line bg-surface opacity-55';
            } else if (isPicked) {
              cls = 'ch-border ch-soft';
            }
            return (
              <button
                key={index}
                type="button"
                disabled={locked}
                onClick={() => lockIn(index)}
                className={[
                  'ring-focus flex items-start gap-3 rounded-2xl border-2 px-4 py-3.5 text-left transition-all duration-200',
                  cls,
                ].join(' ')}
              >
                <span
                  className={[
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-black',
                    locked && isRight
                      ? 'bg-success text-white'
                      : locked && isPicked
                        ? 'bg-danger text-white'
                        : 'bg-canvas text-muted ring-1 ring-line',
                  ].join(' ')}
                >
                  {locked && isRight ? (
                    <CheckIcon className="h-4 w-4" />
                  ) : locked && isPicked ? (
                    <CloseIcon className="h-4 w-4" />
                  ) : (
                    String.fromCharCode(65 + index)
                  )}
                </span>
                <span className="text-sm font-medium leading-6 text-ink">{choice}</span>
              </button>
            );
          })}
        </div>

        {locked && (
          <div className="pop-in mt-4 flex items-start gap-2.5 rounded-2xl border border-line bg-surface px-4 py-3">
            {picked === current.answerIndex ? (
              <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            ) : (
              <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
            )}
            <div>
              <p className="text-sm font-bold text-ink">
                {picked === current.answerIndex
                  ? `Correct, +${40 + Math.round(remaining * 1.5)} points`
                  : picked === null
                    ? 'Time, the round locked itself'
                    : 'Not the best call'}
              </p>
              <p className="mt-0.5 text-sm leading-6 text-muted">{current.explanation}</p>
            </div>
          </div>
        )}
      </div>

      {locked && (
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={next}
            className="ring-focus press ch-fill ch-glow inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold"
          >
            {round + 1 >= rounds.length ? 'See results' : 'Next round'}
            <ArrowRightIcon className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Shared pieces
   ═══════════════════════════════════════════════════════════════════════ */

function ActivityHeader({
  eyebrow,
  title,
  subtitle,
  right,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="ch-text text-[11px] font-bold uppercase tracking-[0.18em]">{eyebrow}</p>
        <h2 className="mt-1.5 text-xl font-bold leading-snug text-ink sm:text-2xl">{title}</h2>
        <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted">{subtitle}</p>
      </div>
      {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
    </div>
  );
}

function StatChip({ icon, label, highlight }: { icon?: ReactNode; label: string; highlight?: boolean }) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold',
        highlight ? 'ch-border ch-soft ch-text' : 'border-line bg-canvas text-muted',
      ].join(' ')}
    >
      {icon}
      {label}
    </span>
  );
}

function ScoreCell({
  label,
  value,
  hint,
  accent,
  hot,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
  hot?: boolean;
}) {
  return (
    <div
      className={[
        'rounded-2xl border px-3.5 py-3 transition-colors',
        hot ? 'border-warn/45 bg-warn-soft' : accent ? 'ch-border ch-soft' : 'border-line bg-canvas',
      ].join(' ')}
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-faint">{label}</p>
      <p
        className={[
          'mt-1 text-xl font-black tabular-nums',
          hot ? 'text-warn' : accent ? 'ch-text' : 'text-ink',
        ].join(' ')}
      >
        {value}
      </p>
      {hint && <p className="text-[11px] text-faint">{hint}</p>}
    </div>
  );
}

function QuizLaunchPanel({
  quizCount,
  locked,
  ready,
  xp,
  onQuiz,
}: {
  quizCount: number;
  locked: boolean;
  ready: boolean;
  xp: number;
  onQuiz: () => void;
}) {
  return (
    <div
      className={[
        'mt-5 overflow-hidden rounded-3xl border p-6 transition-colors sm:p-7',
        ready ? 'border-success/40 bg-success-soft' : 'border-accent/25 bg-accent/[0.05]',
      ].join(' ')}
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          <span
            className={[
              'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white',
              ready ? 'bg-success' : 'bg-accent',
            ].join(' ')}
          >
            <QuizIcon className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-base font-bold text-ink">
              {ready ? 'Lab cleared, you are ready for the quiz' : 'Module quiz'}
            </h2>
            <p className="mt-1 max-w-xl text-sm leading-6 text-muted">
              {quizCount} questions on the same ideas you just practised
              {xp > 0 ? ` · ${xp} XP earned in this lab` : ''}.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onQuiz}
          disabled={locked || quizCount === 0}
          className={[
            'ring-focus press inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-6 py-3.5 text-sm font-bold text-white transition-all disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none',
            ready
              ? 'bg-success shadow-[0_14px_32px_-14px_rgba(5,150,105,0.9)]'
              : 'glow-accent bg-accent',
          ].join(' ')}
        >
          {locked ? 'Quiz locked' : 'Start the quiz'}
          <ArrowRightIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Utilities
   ═══════════════════════════════════════════════════════════════════════ */

function buildTiles(pairs: MemoryPair[]): MemoryTile[] {
  return pairs.flatMap((pair, pairIndex) => [
    { id: `${pairIndex}-p`, pairIndex, kind: 'prompt' as const, text: pair.prompt },
    { id: `${pairIndex}-m`, pairIndex, kind: 'match' as const, text: pair.match },
  ]);
}

/** Fisher–Yates with a seeded PRNG, so the first render is deterministic. */
function shuffle<T>(items: T[], seed: number): T[] {
  const random = mulberry32(seed || 1);
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function stableHash(value: string): number {
  let hash = 7;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 2147483647;
  }
  return hash;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 48);
}

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function mapPalette(index: number): string {
  return ['#7c3aed', '#0891b2', '#d97706', '#db2777', '#0d9488'][index % 5];
}

function wrapSvgText(value: string, maxChars: number, maxLines: number): string[] {
  const words = value.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  for (const word of words) {
    if (lines.length === 0) {
      lines.push(word);
      continue;
    }
    const current = lines[lines.length - 1] ?? '';
    if (`${current} ${word}`.length <= maxChars) {
      lines[lines.length - 1] = `${current} ${word}`;
    } else if (lines.length < maxLines) {
      lines.push(word);
    } else {
      lines[lines.length - 1] = `${lines[lines.length - 1].slice(0, maxChars - 3).trimEnd()}...`;
      break;
    }
  }
  if (lines.length === 0) return ['Module'];
  return lines.slice(0, maxLines);
}
