"""Activity component registry for the Python generation backend.

Kept in parity with ``src/lib/module-activity-catalog.ts``. The length budgets
below are the real limits of the components that render this content — a memory
tile is a small square, so a paragraph in ``prompt`` is a broken game, not a
verbose one. Change them here and there together.
"""

from __future__ import annotations


MODULE_ACTIVITY_REGISTRY = [
    {
        "id": "mindMap",
        "label": "Mind map",
        "purpose": "One central idea with 3-5 concept branches you can explore.",
    },
    {
        "id": "flashcards",
        "label": "Flashcards",
        "purpose": "4-6 recall cards for the terms, rules, and distinctions worth memorising.",
    },
    {
        "id": "memoryGame",
        "label": "Memory match",
        "purpose": "4-6 short pairs that connect a concept to its definition, outcome, or example.",
    },
    {
        "id": "challengeGame",
        "label": "Scenario sprint",
        "purpose": "2-3 timed decision rounds that make the learner apply the module under pressure.",
    },
]

# Hard limits the components can render without truncation or overflow.
ACTIVITY_LIMITS = {
    "centralIdea": 48,
    "branchTitle": 42,
    "branchSummary": 150,
    "branchPoint": 110,
    "cardFront": 110,
    "cardBack": 220,
    "cardHint": 110,
    "memoryPrompt": 44,
    "memoryMatch": 84,
    "memoryExplanation": 140,
    "scenario": 230,
    "choice": 120,
    "explanation": 180,
}


def module_activity_catalog_prompt(language: str | None) -> str:
    target = (language or "").strip()[:80] or "English"
    limits = ACTIVITY_LIMITS
    return "\n".join(
        [
            "Activity component registry for this module. Each component is rendered by a real UI with",
            "fixed space, so respect the length budgets — text that overflows gets truncated on screen.",
            "",
            f"- mindMap: one centralIdea (max {limits['centralIdea']} chars) plus 3-5 branches.",
            f"  Branch titles are noun phrases of 2-4 words (max {limits['branchTitle']} chars) taken from what the",
            '  module actually teaches — never generic labels like "Introduction", "Basics", or "Summary".',
            f"  Each branch: a one-sentence summary (max {limits['branchSummary']} chars) and 2-4 concrete points",
            f"  (max {limits['branchPoint']} chars each).",
            "",
            f"- flashcards: 4-6 cards. front = a question or term (max {limits['cardFront']} chars).",
            f"  back = the answer a learner should be able to say out loud (max {limits['cardBack']} chars).",
            f"  hint = a nudge that narrows the search WITHOUT containing the answer (max {limits['cardHint']} chars).",
            '  Cards must test recall of specific content, not "what is this module about".',
            "",
            "- memoryGame: 4-6 pairs shown as small square tiles. prompt is a term or short phrase",
            f"  (max {limits['memoryPrompt']} chars — this is a tight tile, keep it very short).",
            f"  match is its definition, result, or counterpart (max {limits['memoryMatch']} chars).",
            "  Every prompt must be unmistakably distinct from every other prompt, and no match may plausibly",
            "  fit two prompts — the game is unwinnable otherwise. explanation says why the pair belongs together.",
            "",
            "- challengeGame: 2-3 rounds, each a realistic situation someone would actually face",
            f"  (max {limits['scenario']} chars), with exactly 3 actions (max {limits['choice']} chars each).",
            "  All three must be tempting to someone who half-understands the module; exactly one is best.",
            "  Never make the wrong choices obviously absurd. explanation states why the best one wins.",
            "",
            f"Write every activity in {target}.",
            "All content must be specific to THIS module and answerable from the lessons you wrote.",
            "Do not reuse the quiz questions — the activities rehearse the same ideas a different way.",
        ]
    )
