from __future__ import annotations

import json
import time
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from ..core.security import require_user
from ..generator import generate_course, stream_generate_course
from ..schemas import GenerateCourseRequest
from ..services import accounts
from ..services import courses as course_store

router = APIRouter(prefix="/api", tags=["courses"])


@router.get("/courses")
async def list_courses(request: Request) -> dict:
    user = require_user(request)
    return {"courses": course_store.list_courses(user["id"])}


@router.get("/courses/{course_id}")
async def get_course(course_id: str, request: Request) -> dict:
    user = require_user(request)
    course = course_store.get_course(user["id"], course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Not found")
    return {"course": course, "completed": course_store.completed_lessons(user["id"], course_id)}


@router.put("/courses/{course_id}")
async def put_course(course_id: str, body: dict, request: Request) -> dict:
    user = require_user(request)
    course = body.get("course")
    if not isinstance(course, dict) or not course.get("title") or not course.get("modules"):
        raise HTTPException(status_code=400, detail="That is not a course.")
    if not course_store.update_course(user["id"], course_id, course):
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}


@router.delete("/courses/{course_id}")
async def delete_course(course_id: str, request: Request) -> dict:
    user = require_user(request)
    course_store.delete_course(user["id"], course_id)
    return {"ok": True}


@router.post("/courses/{course_id}/progress")
async def course_progress(course_id: str, body: dict, request: Request) -> dict:
    user = require_user(request)
    lesson_key = str(body.get("lessonKey") or "")
    if not lesson_key:
        raise HTTPException(status_code=400, detail="Missing lessonKey.")
    if not course_store.user_owns_course(user["id"], course_id):
        raise HTTPException(status_code=404, detail="Not found")
    course_store.set_lesson_completed(user["id"], course_id, lesson_key, bool(body.get("completed")))
    return {"ok": True}


@router.post("/courses/{course_id}/favorite")
async def favorite_course(course_id: str, body: dict, request: Request) -> dict:
    user = require_user(request)
    favorite = bool(body.get("favorite", True))
    if not course_store.set_favorite(user["id"], course_id, favorite):
        raise HTTPException(status_code=404, detail="Course not found.")
    return {"ok": True, "favorite": favorite}


@router.get("/playlists")
async def playlists(request: Request) -> dict:
    user = require_user(request)
    return {"playlists": course_store.list_playlists(user["id"])}


@router.post("/playlists")
async def create_playlist(body: dict, request: Request) -> dict:
    user = require_user(request)
    name = str(body.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Playlist name is required.")
    return {"playlist": course_store.create_playlist(user["id"], name)}


@router.post("/playlists/{playlist_id}/courses")
async def add_playlist_course(playlist_id: str, body: dict, request: Request) -> dict:
    user = require_user(request)
    course_id = str(body.get("courseId") or "").strip()
    if not course_id:
        raise HTTPException(status_code=400, detail="Course id is required.")
    if not course_store.add_course_to_playlist(user["id"], playlist_id, course_id):
        raise HTTPException(status_code=404, detail="Playlist or course not found.")
    return {"ok": True}


@router.get("/notifications")
async def notifications(request: Request) -> dict:
    user = require_user(request)
    return {"notifications": course_store.list_notifications(user["id"])}


@router.post("/notifications")
async def create_notification(body: dict, request: Request) -> dict:
    user = require_user(request)
    if not str(body.get("title") or "").strip():
        raise HTTPException(status_code=400, detail="Title is required.")
    return {"notification": course_store.create_notification(user["id"], body)}


@router.patch("/notifications")
async def mark_notifications(body: dict | None, request: Request) -> dict:
    user = require_user(request)
    course_store.mark_notifications_read(user["id"], (body or {}).get("id"))
    return {"ok": True}


@router.post("/generate")
async def generate(body: dict, request: Request) -> dict:
    user = require_user(request)
    if not accounts.billing_state(user["id"])["isPro"]:
        raise HTTPException(status_code=402, detail="Generating courses is a Pro feature.")
    req = _generate_request(body)
    started = time.perf_counter()
    course = (await generate_course(req)).model_dump(mode="json")
    course = course_store.enrich_course(course)
    course_id = course_store.save_course(user["id"], course, req.topic)
    return {"course": course, "id": course_id, "videosPending": False, "elapsedMs": int((time.perf_counter() - started) * 1000)}


@router.post("/generate/stream")
async def generate_stream(body: dict, request: Request) -> StreamingResponse:
    user = require_user(request)
    if not accounts.billing_state(user["id"])["isPro"]:
        raise HTTPException(status_code=402, detail="Generating courses is a Pro feature.")
    req = _generate_request(body)

    async def events():
        async for line in stream_generate_course(req):
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                yield line
                continue
            if event.get("type") == "course":
                course = course_store.enrich_course(event["course"])
                course_id = course_store.save_course(user["id"], course, req.topic)
                yield json.dumps(
                    {
                        "type": "course",
                        "course": course,
                        "id": course_id,
                        "videosPending": False,
                        "elapsedMs": event.get("elapsedMs"),
                    },
                    ensure_ascii=False,
                ) + "\n"
                yield json.dumps({"type": "done"}) + "\n"
            else:
                yield line

    return StreamingResponse(events(), media_type="application/x-ndjson")


@router.post("/courses/chat")
async def course_chat(body: dict, request: Request) -> dict:
    user = require_user(request)
    course_id = body.get("courseId")
    course = course_store.get_course(user["id"], course_id) if isinstance(course_id, str) else body.get("course")
    if not course:
        raise HTTPException(status_code=404, detail="That course could not be found.")
    messages = body.get("messages") if isinstance(body.get("messages"), list) else []
    last = next((m for m in reversed(messages) if m.get("role") == "user"), {})
    text = str(last.get("content") or "")
    return {
        "reply": f"I can help with this course. You asked: {text[:180]}",
        "course": None,
        "changes": [],
        "canEdit": bool(course_id),
        "remaining": -1,
    }


def _generate_request(body: dict[str, Any]) -> GenerateCourseRequest:
    prompt = str(body.get("prompt") or body.get("topic") or "").strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="Please describe what you want to learn.")
    level = body.get("level") if body.get("level") in {"Beginner", "Intermediate", "Advanced"} else None
    return GenerateCourseRequest(
        topic=prompt,
        level=level,
        known=str(body.get("known") or "")[:400],
        language=str(body.get("language") or "")[:80],
        sourceText=body.get("sourceText") if isinstance(body.get("sourceText"), str) else None,
    )
