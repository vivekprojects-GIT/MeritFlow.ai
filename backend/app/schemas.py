from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="before")
    @classmethod
    def _trim_overlong_lists(cls, data: Any) -> Any:
        """Trim a list that came back longer than its cap, rather than rejecting it.

        The two bounds on these lists are not the same kind of rule. A minimum
        is a correctness requirement: a course with two outcomes has
        under-promised, and no amount of trimming fixes it, so too few must
        still fail. A maximum is a presentation choice about how much fits on a
        card.

        Enforcing the maximum by rejection threw away whole generated outlines
        over surplus. Asked for a structural analysis course, the model
        returned seven, then eight, then eight outcomes against a cap of six;
        all three attempts were discarded and the learner got the canned
        fallback outline instead of the good course that had been written three
        times. Keeping the first six costs nothing anyone can see.

        Only maximums are trimmed. Minimums are left to fail as before.
        """
        if not isinstance(data, dict):
            return data

        for name, field in cls.model_fields.items():
            cap = next(
                (m.max_length for m in field.metadata if getattr(m, "max_length", None) is not None),
                None,
            )
            if cap is None:
                continue
            value = data.get(name)
            if isinstance(value, list) and len(value) > cap:
                data[name] = value[:cap]

        return data


class CodeExample(StrictModel):
    language: str
    code: str
    caption: str


class LessonSection(StrictModel):
    # These descriptions are not documentation — they are shipped to the model as
    # the JSON schema for structured output, and they are the ONLY per-field
    # instruction it receives. A bare `body: str` gets a two-sentence answer.
    heading: str = Field(description="A short, specific subheading for this part of the lesson.")
    body: str = Field(
        description=(
            "THREE TO FIVE FULL PARAGRAPHS (roughly 250-450 words) teaching this subtopic the way a "
            "good textbook does. Follow this arc: state the idea plainly; explain why it works and why "
            "it matters; work through ONE concrete example in detail, with real numbers, real names, or "
            "real code, showing the reasoning step by step; then address where a learner typically goes "
            "wrong, or the limit of the idea. Flowing connected prose a reader can follow start to "
            "finish, never a list of assertions. Separate paragraphs with a blank line. "
            # Measured across the shipped library: 25 words per sentence median,
            # 27% over 30 words. Dense prose with no worked example is the exact
            # combination that loses a first-time reader, so the cap is explicit.
            "Keep most sentences under 20 words. If a sentence runs past 25, split it. "
            # The old instruction ended "No markdown." while also asking for real
            # code, so the model emitted unfenced source that rendered as a
            # run-on sentence. Fences are now required; everything else stays
            # plain, which is what that rule was actually for.
            "No markdown formatting for emphasis, headings, or lists. The ONE exception: when you "
            "show code, you MUST wrap it in a fenced block with its language, like ```python on its "
            "own line, the code with its real line breaks and indentation, then ``` on its own line. "
            "Never write code inline in a paragraph."
        )
    )

    # These two were previously one clause inside the body instruction above,
    # and the model dropped them: measured across the shipped library, only
    # about one section in twelve contained a worked example or a discussion of
    # what goes wrong. A required field is enforced by the schema; a sentence in
    # a prompt is a suggestion. Splitting them out is the fix.
    example: str = Field(
        description=(
            "ONE concrete worked example for THIS subtopic, 40-120 words, written so the reader can "
            "follow the reasoning step by step. Use real specifics: actual numbers, a named situation, "
            "or a short piece of code. Never restate the idea in the abstract, and never say 'for "
            "example' and then give another definition. If code makes the point best, use a fenced "
            "block exactly as described above."
        )
    )
    pitfall: str = Field(
        description=(
            "One short paragraph (30-80 words) naming the mistake a learner actually makes here, or "
            "the boundary where this idea stops holding. Say what the mistake looks like and what to "
            "do instead. Not a warning in general terms, and not a restatement of the rule."
        )
    )


class Lesson(StrictModel):
    title: str = Field(description="Short, specific lesson title.")
    objective: str = Field(description="One sentence: what the learner will be able to do afterwards.")
    intro: str = Field(
        description=(
            "TWO TO THREE PARAGRAPHS (150-250 words) opening the lesson: the concrete situation or "
            "question that makes this worth learning, why it matters to the reader, and what they will "
            "be able to do by the end. Open with something specific — a scenario, a problem, a "
            "surprising fact — not a definition. Plain prose."
        )
    )
    sections: list[LessonSection] = Field(
        min_length=3,
        max_length=6,
        description=(
            "3-6 substantial sections in a logical order, each building on the last. This is a textbook "
            "chapter, not a summary: the whole lesson should read as 900-2000 words of real teaching. "
            "If a section could be one sentence, merge it into another."
        ),
    )
    keyPoints: list[str] = Field(
        min_length=3, max_length=6, description="The most important things to remember."
    )
    codeExamples: list[CodeExample] = Field(
        description="Code snippets for technical lessons only. Empty array for non-technical lessons."
    )
    commonMistakes: list[str] = Field(
        description="Two to four real mistakes or misconceptions for this topic. Empty array if none fit."
    )
    practice: str = Field(description="One concrete exercise applying the lesson. Empty string if none fits.")
    needsVideo: bool = Field(description="True only when seeing something demonstrated clearly helps.")
    videoQuery: str = Field(description="A tight single-topic YouTube query when needsVideo is true, else empty.")


class QuizQuestion(StrictModel):
    question: str
    options: list[str] = Field(min_length=4, max_length=4)
    answerIndex: int = Field(ge=0, le=3)
    explanation: str


class ModuleMindMapBranch(StrictModel):
    title: str
    summary: str
    points: list[str] = Field(min_length=2, max_length=4)


class ModuleMindMap(StrictModel):
    centralIdea: str
    branches: list[ModuleMindMapBranch] = Field(min_length=3, max_length=5)


class Flashcard(StrictModel):
    front: str
    back: str
    hint: str


class MemoryPair(StrictModel):
    prompt: str
    match: str
    explanation: str


class MemoryGame(StrictModel):
    title: str
    instructions: str
    pairs: list[MemoryPair] = Field(min_length=4, max_length=6)


class ChallengeRound(StrictModel):
    scenario: str
    choices: list[str] = Field(min_length=3, max_length=3)
    answerIndex: int = Field(ge=0, le=2)
    explanation: str


class ChallengeGame(StrictModel):
    title: str
    premise: str
    rounds: list[ChallengeRound] = Field(min_length=2, max_length=3)


class ModuleActivities(StrictModel):
    mindMap: ModuleMindMap
    flashcards: list[Flashcard] = Field(min_length=4, max_length=6)
    memoryGame: MemoryGame
    challengeGame: ChallengeGame


class Module(StrictModel):
    title: str
    summary: str
    lessons: list[Lesson] = Field(min_length=2, max_length=6)
    quiz: list[QuizQuestion] = Field(min_length=3, max_length=4)
    activities: ModuleActivities | None = None


class Course(StrictModel):
    title: str
    subtitle: str
    description: str
    level: Literal["Beginner", "Intermediate", "Advanced", "All levels"]
    estimatedHours: float
    prerequisites: list[str]
    outcomes: list[str] = Field(min_length=3, max_length=6)
    modules: list[Module] = Field(min_length=3, max_length=7)


class LessonBrief(StrictModel):
    title: str
    objective: str
    teachingNotes: str
    needsVideo: bool
    videoQuery: str


class ModuleBrief(StrictModel):
    title: str
    summary: str
    teachingFocus: str
    lessons: list[LessonBrief] = Field(min_length=2, max_length=6)


class CourseOutline(StrictModel):
    title: str
    subtitle: str
    description: str
    level: Literal["Beginner", "Intermediate", "Advanced", "All levels"]
    estimatedHours: float
    prerequisites: list[str]
    outcomes: list[str] = Field(min_length=3, max_length=6)
    modules: list[ModuleBrief] = Field(min_length=3, max_length=7)


class ModuleDraft(StrictModel):
    title: str
    summary: str
    lessons: list[Lesson] = Field(min_length=2, max_length=6)
    quiz: list[QuizQuestion] = Field(min_length=3, max_length=4)
    activities: ModuleActivities


# Textbook-depth lessons and the assessment apparatus are written in two passes.
# Asking for all of it in one structured response meant the lessons consumed the
# response and `quiz`/`activities` were simply missing, failing validation.
class ModuleLessonsDraft(StrictModel):
    title: str
    summary: str
    lessons: list[Lesson] = Field(min_length=2, max_length=6)


class ModuleAssessmentDraft(StrictModel):
    quiz: list[QuizQuestion] = Field(min_length=3, max_length=4)
    activities: ModuleActivities


class GenerateCourseRequest(StrictModel):
    topic: str
    level: Literal["Beginner", "Intermediate", "Advanced"] | None = None
    known: str = ""
    language: str = ""
    sourceText: str | None = None
    # The learner's own Anthropic key and model, when they supplied one in
    # settings. Absent means fall back to the operator's environment.
    #
    # It travels in the request body because this backend is a separate process
    # with its own environment, and a per-user key cannot live there. That is
    # acceptable for a backend reached over the loopback interface; exposing
    # this service on a network would need TLS before it is acceptable there.
    apiKey: str | None = None
    model: str | None = None


class GenerateCourseResponse(StrictModel):
    course: Course
    backend: Literal["python-langgraph"] = "python-langgraph"


# ── Vector memory (ChromaDB) ──────────────────────────────────────────────
# These take the course as a raw dict on purpose: what the Next app stores is an
# ENRICHED course (videos, lock flags) that the strict Course model above would
# reject. Indexing only reads text, so it does not need the strict contract.


class IndexCourseRequest(BaseModel):
    courseId: str
    userId: str
    course: dict[str, Any]


class IndexCourseResponse(BaseModel):
    ok: bool
    chunks: int


class SearchRequest(BaseModel):
    query: str
    courseId: str
    userId: str | None = None
    moduleIndex: int | None = None
    lessonIndex: int | None = None
    kinds: list[str] | None = None
    limit: int = Field(default=6, ge=1, le=20)


class SearchHit(BaseModel):
    text: str
    moduleIndex: int | None = None
    lessonIndex: int | None = None
    moduleTitle: str | None = None
    lessonTitle: str | None = None
    type: str | None = None
    score: float | None = None


class SearchResponse(BaseModel):
    hits: list[SearchHit]
