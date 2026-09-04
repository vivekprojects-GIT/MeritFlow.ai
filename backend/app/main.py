from __future__ import annotations

import hmac
import os

from fastapi import FastAPI, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

from .api import account, admin, auth, classes, courses, utilities
from . import vector_store
from .core.db import init_db
from .env import load_local_env
from .generator import (
    ContentRefused,
    ProviderRejected,
    generate_course,
    model_name,
    stream_generate_course,
)
from .schemas import (
    GenerateCourseRequest,
    GenerateCourseResponse,
    IndexCourseRequest,
    IndexCourseResponse,
    SearchRequest,
    SearchResponse,
)
from .vector_store import VectorStoreUnavailable

load_local_env()
init_db()

app = FastAPI(title="CourseAI Python Backend", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:3000", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def require_shared_secret(request: Request, call_next):
    """Refuse anything that cannot prove it is the app.

    This service has no user accounts, and its generate endpoints spend the
    operator's Anthropic credit — so whatever can reach it can spend money.
    Running it as a private service is the primary defence; this is the second,
    and it is what makes the deployment safe if it ever has to run as a public
    service because the plan has no private ones.

    Unset means unenforced, which is the right default for a backend on
    loopback in development. It is set in render.yaml for both services from
    one generated value, so the two always agree.

    `compare_digest` rather than `==` because a plain comparison returns as
    soon as two bytes differ, and the time it took is a measurement of how much
    of the secret was right.
    """
    expected = os.getenv("BACKEND_SHARED_SECRET", "").strip()
    if expected and request.url.path not in ("/", "/health"):
        supplied = request.headers.get("x-backend-secret", "")
        if not hmac.compare_digest(supplied, expected):
            return JSONResponse(status_code=401, content={"detail": "Not authorised for this backend."})
    return await call_next(request)


app.include_router(auth.router)
app.include_router(account.router)
app.include_router(courses.router)
app.include_router(classes.router)
app.include_router(admin.router)
app.include_router(utilities.router)


@app.exception_handler(HTTPException)
async def http_exception_handler(_request: Request, exc: HTTPException) -> JSONResponse:
    message = exc.detail if isinstance(exc.detail, str) else "Request failed."
    return JSONResponse({"error": message, "detail": exc.detail}, status_code=exc.status_code, headers=exc.headers)


@app.get("/health")
async def health() -> dict[str, str | bool]:
    return {
        "ok": True,
        "backend": "python-langgraph",
        "model": model_name(),
        "hasAnthropicKey": bool(os.getenv("ANTHROPIC_API_KEY")),
        "vectorStore": vector_store.is_available(),
    }


@app.post("/generate-course", response_model=GenerateCourseResponse)
async def generate_course_route(req: GenerateCourseRequest) -> GenerateCourseResponse:
    if not (req.apiKey or os.getenv("ANTHROPIC_API_KEY")):
        raise HTTPException(
            status_code=503,
            detail="No Anthropic key: add one in Settings, or configure ANTHROPIC_API_KEY for the backend.",
        )
    if not req.topic.strip() and not (req.sourceText or "").strip():
        raise HTTPException(status_code=400, detail="A topic or sourceText is required.")

    try:
        course = await generate_course(req)
    except ProviderRejected as rejected:
        # 401: the key is wrong, and the person who saved it is the only one who
        # can fix it. Anything else here reads as "the app is broken".
        raise HTTPException(status_code=401, detail=str(rejected)) from rejected
    except ContentRefused as refusal:
        # 422: the request was understood and deliberately declined, which the
        # client should show to the learner rather than treat as an outage.
        raise HTTPException(status_code=422, detail=refusal.verdict.reason) from refusal
    return GenerateCourseResponse(course=course)


@app.post("/generate-course/stream")
async def stream_generate_course_route(req: GenerateCourseRequest) -> StreamingResponse:
    if not (req.apiKey or os.getenv("ANTHROPIC_API_KEY")):
        raise HTTPException(
            status_code=503,
            detail="No Anthropic key: add one in Settings, or configure ANTHROPIC_API_KEY for the backend.",
        )
    if not req.topic.strip() and not (req.sourceText or "").strip():
        raise HTTPException(status_code=400, detail="A topic or sourceText is required.")

    return StreamingResponse(stream_generate_course(req), media_type="application/x-ndjson")


# ── Vector memory (ChromaDB) ──────────────────────────────────────────────
# Semantic layer only. Postgres/PGlite stays the system of record for users,
# courses, classes, progress, and payments; these endpoints just keep an
# embedding index of course TEXT so the tutor and editor can retrieve the right
# passage instead of being handed a whole course.


@app.post("/index-course", response_model=IndexCourseResponse)
async def index_course_route(req: IndexCourseRequest) -> IndexCourseResponse:
    """(Re)index one course. Safe to call repeatedly — chunks are replaced, not duplicated."""
    try:
        count = await run_in_threadpool(
            vector_store.index_course, req.course, req.courseId, req.userId
        )
    except VectorStoreUnavailable as err:
        raise HTTPException(status_code=503, detail=str(err)) from err
    return IndexCourseResponse(ok=True, chunks=count)


@app.post("/search", response_model=SearchResponse)
async def search_route(req: SearchRequest) -> SearchResponse:
    if not req.query.strip():
        raise HTTPException(status_code=400, detail="A query is required.")
    try:
        hits = await run_in_threadpool(
            vector_store.search,
            req.query,
            course_id=req.courseId,
            user_id=req.userId,
            module_index=req.moduleIndex,
            lesson_index=req.lessonIndex,
            kinds=req.kinds,
            limit=req.limit,
        )
    except VectorStoreUnavailable as err:
        raise HTTPException(status_code=503, detail=str(err)) from err
    return SearchResponse(hits=hits)


@app.delete("/index-course/{course_id}")
async def delete_course_index_route(course_id: str) -> dict[str, bool]:
    try:
        await run_in_threadpool(vector_store.delete_course, course_id)
    except VectorStoreUnavailable as err:
        raise HTTPException(status_code=503, detail=str(err)) from err
    return {"ok": True}


@app.get("/index-course/stats")
async def index_stats_route(courseId: str | None = None) -> dict[str, object]:
    try:
        return await run_in_threadpool(vector_store.stats, courseId)
    except VectorStoreUnavailable as err:
        raise HTTPException(status_code=503, detail=str(err)) from err
