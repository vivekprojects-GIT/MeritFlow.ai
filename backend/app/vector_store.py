"""ChromaDB vector memory for course content.

This is the semantic layer, deliberately NOT the system of record. Postgres/PGlite
still owns users, courses, classes, progress, and payments; Chroma only holds
embeddings of course *text* so the tutor, the course editor, and search can find
the right passage without stuffing an entire course into a prompt.

Everything is scoped by ``courseId`` (and ``userId``) in metadata, so a query can
never leak across courses or accounts.

The chromadb import is deferred: the backend must still boot and generate courses
when the dependency isn't installed, just without retrieval.
"""

from __future__ import annotations

import os
import re
from functools import lru_cache
from typing import Any

COLLECTION_NAME = "course_chunks"
DEFAULT_PATH = "./chroma-data"

# A lesson section can be long; embedding models have a window. Split on sentence
# boundaries near this size rather than mid-word.
MAX_CHUNK_CHARS = 1400
CHUNK_OVERLAP_CHARS = 160


class VectorStoreUnavailable(RuntimeError):
    """Raised when chromadb is not installed or the store cannot be opened."""


@lru_cache(maxsize=1)
def _collection() -> Any:
    try:
        import chromadb  # imported lazily: optional dependency
    except ImportError as err:  # pragma: no cover - depends on the environment
        raise VectorStoreUnavailable(
            "chromadb is not installed. Run: python -m pip install -r backend/requirements.txt"
        ) from err

    path = os.getenv("CHROMA_PATH", DEFAULT_PATH)
    client = chromadb.PersistentClient(path=path)
    # Cosine matches how sentence-transformer embeddings are meant to be compared;
    # Chroma's default is L2, which ranks differently on unnormalised vectors.
    return client.get_or_create_collection(
        name=COLLECTION_NAME,
        metadata={"hnsw:space": "cosine"},
    )


def is_available() -> bool:
    try:
        _collection()
        return True
    except Exception:
        return False


# ── Chunking ──────────────────────────────────────────────────────────────


def _split(text: str) -> list[str]:
    """Split long text on sentence boundaries, with a little overlap for context."""
    clean = re.sub(r"\s+", " ", text or "").strip()
    if len(clean) <= MAX_CHUNK_CHARS:
        return [clean] if clean else []

    sentences = re.split(r"(?<=[.!?])\s+", clean)
    chunks: list[str] = []
    current = ""
    for sentence in sentences:
        if current and len(current) + len(sentence) + 1 > MAX_CHUNK_CHARS:
            chunks.append(current.strip())
            current = current[-CHUNK_OVERLAP_CHARS:] + " " + sentence
        else:
            current = f"{current} {sentence}".strip()
    if current.strip():
        chunks.append(current.strip())
    return chunks


def course_chunks(course: dict[str, Any], course_id: str, user_id: str) -> list[dict[str, Any]]:
    """Flatten a course into embeddable chunks with retrieval metadata.

    One chunk per teaching section (the natural semantic unit), plus a chunk for
    each lesson's framing, its takeaways, each quiz question, and each module
    summary. Ids are deterministic so re-indexing replaces rather than duplicates.
    """
    course_title = str(course.get("title") or "Untitled course")
    out: list[dict[str, Any]] = []

    def add(text: str, *, kind: str, m: int, l: int, module_title: str, lesson_title: str, slot: str) -> None:
        for index, piece in enumerate(_split(text)):
            out.append(
                {
                    "id": f"{course_id}:m{m}:l{l}:{slot}:{index}",
                    "document": piece,
                    "metadata": {
                        "userId": user_id,
                        "courseId": course_id,
                        "courseTitle": course_title,
                        "moduleIndex": m,
                        "lessonIndex": l,
                        "moduleTitle": module_title,
                        "lessonTitle": lesson_title,
                        "type": kind,
                    },
                }
            )

    for m, module in enumerate(course.get("modules") or []):
        module_title = str(module.get("title") or f"Module {m + 1}")
        summary = str(module.get("summary") or "")
        if summary:
            add(
                f"Module: {module_title}. {summary}",
                kind="module",
                m=m,
                l=-1,
                module_title=module_title,
                lesson_title="",
                slot="summary",
            )

        for l, lesson in enumerate(module.get("lessons") or []):
            lesson_title = str(lesson.get("title") or f"Lesson {l + 1}")
            common = dict(m=m, l=l, module_title=module_title, lesson_title=lesson_title)

            framing = " ".join(
                part for part in [str(lesson.get("objective") or ""), str(lesson.get("intro") or "")] if part
            )
            if framing:
                add(f"{lesson_title}. {framing}", kind="lesson", slot="intro", **common)

            for s, section in enumerate(lesson.get("sections") or []):
                heading = str(section.get("heading") or "")
                body = str(section.get("body") or "")
                if body:
                    add(f"{lesson_title} — {heading}. {body}", kind="lesson", slot=f"s{s}", **common)

            takeaways = " ".join(
                [
                    *(str(point) for point in (lesson.get("keyPoints") or [])),
                    *(f"Common mistake: {mistake}" for mistake in (lesson.get("commonMistakes") or [])),
                    str(lesson.get("practice") or ""),
                ]
            ).strip()
            if takeaways:
                add(f"{lesson_title} — key points. {takeaways}", kind="lesson", slot="key", **common)

            for c, example in enumerate(lesson.get("codeExamples") or []):
                code = str(example.get("code") or "")
                if code:
                    caption = str(example.get("caption") or "")
                    add(
                        f"{lesson_title} — code example ({example.get('language', 'code')}). {caption}\n{code}",
                        kind="code",
                        slot=f"code{c}",
                        **common,
                    )

        for q, question in enumerate(module.get("quiz") or []):
            text = str(question.get("question") or "")
            if text:
                add(
                    f"Quiz — {module_title}. {text} Answer: "
                    f"{(question.get('options') or [''])[int(question.get('answerIndex') or 0)]}. "
                    f"{question.get('explanation') or ''}",
                    kind="quiz",
                    m=m,
                    l=-1,
                    module_title=module_title,
                    lesson_title="",
                    slot=f"quiz{q}",
                )

    return out


# ── Index / query ─────────────────────────────────────────────────────────


def index_course(course: dict[str, Any], course_id: str, user_id: str) -> int:
    """(Re)index one course. Existing chunks for the course are replaced."""
    collection = _collection()
    chunks = course_chunks(course, course_id, user_id)

    delete_course(course_id)
    if not chunks:
        return 0

    # Chroma batches are bounded; stay well inside any server-side limit.
    batch = 200
    for start in range(0, len(chunks), batch):
        window = chunks[start : start + batch]
        collection.add(
            ids=[chunk["id"] for chunk in window],
            documents=[chunk["document"] for chunk in window],
            metadatas=[chunk["metadata"] for chunk in window],
        )
    return len(chunks)


def delete_course(course_id: str) -> None:
    try:
        _collection().delete(where={"courseId": course_id})
    except Exception:
        # A missing collection or an empty match is not an error worth failing on.
        pass


def search(
    query: str,
    *,
    course_id: str,
    user_id: str | None = None,
    module_index: int | None = None,
    lesson_index: int | None = None,
    kinds: list[str] | None = None,
    limit: int = 6,
) -> list[dict[str, Any]]:
    """Similarity search inside one course, with optional metadata narrowing."""
    collection = _collection()

    clauses: list[dict[str, Any]] = [{"courseId": course_id}]
    if user_id:
        clauses.append({"userId": user_id})
    if module_index is not None:
        clauses.append({"moduleIndex": module_index})
    if lesson_index is not None:
        clauses.append({"lessonIndex": lesson_index})
    if kinds:
        clauses.append({"type": {"$in": kinds}})

    # Chroma only accepts a bare single-key filter; anything more needs $and.
    where = clauses[0] if len(clauses) == 1 else {"$and": clauses}

    result = collection.query(
        query_texts=[query],
        n_results=max(1, min(limit, 20)),
        where=where,
        include=["documents", "metadatas", "distances"],
    )

    documents = (result.get("documents") or [[]])[0]
    metadatas = (result.get("metadatas") or [[]])[0]
    distances = (result.get("distances") or [[]])[0]

    hits: list[dict[str, Any]] = []
    for index, document in enumerate(documents):
        meta = metadatas[index] if index < len(metadatas) else {}
        distance = distances[index] if index < len(distances) else None
        hits.append(
            {
                "text": document,
                "moduleIndex": meta.get("moduleIndex"),
                "lessonIndex": meta.get("lessonIndex"),
                "moduleTitle": meta.get("moduleTitle"),
                "lessonTitle": meta.get("lessonTitle"),
                "type": meta.get("type"),
                # Cosine distance → a 0..1 similarity that reads the right way round.
                "score": None if distance is None else round(max(0.0, 1.0 - float(distance)), 4),
            }
        )
    return hits


def stats(course_id: str | None = None) -> dict[str, Any]:
    collection = _collection()
    if course_id:
        found = collection.get(where={"courseId": course_id}, include=[])
        return {"courseId": course_id, "chunks": len(found.get("ids") or [])}
    return {"chunks": collection.count()}
