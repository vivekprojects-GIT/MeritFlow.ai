from __future__ import annotations

import asyncio
import csv
import io
import subprocess
import tempfile
from pathlib import Path
from typing import Any

from fastapi import APIRouter, File, HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse

from ..core.db import db
from ..core.security import new_id, now_ms, require_user

router = APIRouter(prefix="/api", tags=["utilities"])

PASS_THRESHOLD = 0.7


@router.post("/tutor")
async def tutor(body: dict, request: Request) -> StreamingResponse:
    require_user(request)
    lesson = body.get("lesson") if isinstance(body.get("lesson"), dict) else {}
    messages = body.get("messages") if isinstance(body.get("messages"), list) else []
    last = next((m for m in reversed(messages) if m.get("role") == "user"), {})
    question = str(last.get("content") or "Explain this lesson.")
    lesson_title = str(lesson.get("lessonTitle") or lesson.get("title") or "this lesson")
    objective = str(lesson.get("objective") or "")
    text = (
        f"Let's work through {lesson_title}. "
        f"{objective + ' ' if objective else ''}"
        f"For your question, {question[:180]}, focus on the core idea first, then test it with a small example. "
        "If you want, ask me to quiz you and I will turn the lesson into short practice questions."
    )

    async def stream():
        for token in text.split(" "):
            yield token + " "
            await asyncio.sleep(0.015)

    return StreamingResponse(stream(), media_type="text/plain", headers={"X-Tutor-Remaining": "-1"})


@router.post("/visualize")
async def visualize(body: dict, request: Request) -> dict:
    require_user(request)
    lesson = body.get("lesson") if isinstance(body.get("lesson"), dict) else {}
    title = str(lesson.get("lessonTitle") or "Concept map")[:80]
    objective = str(lesson.get("objective") or "Understand the core concept.")
    sections = lesson.get("sections") if isinstance(lesson.get("sections"), list) else []
    steps = []
    for section in sections[:5]:
        if isinstance(section, dict):
            steps.append(
                {
                    "label": str(section.get("heading") or "Concept")[:36],
                    "detail": str(section.get("body") or objective)[:160],
                }
            )
    while len(steps) < 3:
        labels = ["Start", "Practice", "Apply"]
        steps.append({"label": labels[len(steps)], "detail": objective[:160]})
    return {
        "blocks": [
            {
                "type": "flow",
                "title": title,
                "summary": objective[:180],
                "steps": steps[:6],
            }
        ]
    }


@router.post("/run")
async def run_code(body: dict, request: Request) -> dict:
    require_user(request)
    language = str(body.get("language") or "").lower()
    code = str(body.get("code") or "")
    stdin = str(body.get("stdin") or "")
    if not code.strip():
        raise HTTPException(status_code=400, detail="Nothing to run.")
    if len(code) > 50_000:
        raise HTTPException(status_code=413, detail="Code is too long.")
    if language not in {"python", "py", "javascript", "js", "node"}:
        raise HTTPException(status_code=400, detail=f"Unsupported language: {language}")
    suffix = ".py" if language in {"python", "py"} else ".js"
    runner = ["python"] if suffix == ".py" else ["node"]
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / f"main{suffix}"
        path.write_text(code, encoding="utf-8")
        try:
            proc = subprocess.run(
                [*runner, str(path)],
                input=stdin,
                text=True,
                capture_output=True,
                timeout=8,
            )
        except subprocess.TimeoutExpired:
            return {"stdout": "", "stderr": "Timed out after 8 seconds.", "code": 124}
    return {"stdout": proc.stdout, "stderr": proc.stderr, "code": proc.returncode}


@router.post("/parse-document")
async def parse_document(request: Request, file: UploadFile = File(...)) -> dict:
    user = require_user(request)
    if user["role"] != "instructor":
        raise HTTPException(status_code=403, detail="Forbidden")
    raw = await file.read()
    if len(raw) > 12 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="That file is too large (max 12 MB).")
    name = file.filename or "document.txt"
    if not (
        name.lower().endswith((".txt", ".md", ".markdown", ".csv"))
        or (file.content_type or "").startswith("text/")
    ):
        raise HTTPException(status_code=415, detail="Python parser currently accepts text, Markdown, and CSV files.")
    text = raw.decode("utf-8", errors="ignore").strip()[:200_000]
    if len(text) < 20:
        raise HTTPException(status_code=422, detail="Could not read meaningful text from that file.")
    return {"text": text, "chars": len(text), "name": name}


@router.post("/certificates")
async def certificate(body: dict, request: Request) -> dict:
    user = require_user(request)
    course_title = str(body.get("courseTitle") or "").strip()[:200]
    course_id = str(body.get("courseId") or "")[:200]
    score = int(body.get("score") or 0)
    total = int(body.get("total") or 0)
    if not course_title or total < 4:
        raise HTTPException(status_code=400, detail="A certificate needs a valid exam result.")
    if score / total < PASS_THRESHOLD:
        raise HTTPException(status_code=400, detail="You need at least 70% to earn a certificate.")
    cert_id = new_id()
    recipient = str(body.get("recipient") or user["email"].split("@")[0] or "MeritFlow Learner")[:80]
    with db() as conn:
        conn.execute(
            """
            INSERT INTO certificates (id, user_id, course_id, course_title, recipient, score, total, issued_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (cert_id, user["id"], course_id, course_title, recipient, score, total, now_ms()),
        )
    return {"id": cert_id}


@router.get("/certificates/{cert_id}")
async def get_certificate(cert_id: str) -> dict:
    with db() as conn:
        row = conn.execute("SELECT * FROM certificates WHERE id = ?", (cert_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Certificate not found")
    return {
        "certificate": {
            "id": row["id"],
            "userId": row["user_id"],
            "courseId": row["course_id"],
            "courseTitle": row["course_title"],
            "recipient": row["recipient"],
            "score": row["score"],
            "total": row["total"],
            "issuedAt": row["issued_at"],
        }
    }
