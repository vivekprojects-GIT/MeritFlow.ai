from __future__ import annotations

import json
from typing import Any

from ..core.db import db
from ..core.security import new_id, now_ms
from .catalog import count_lessons, infer_course_category


def enrich_course(course: dict[str, Any]) -> dict[str, Any]:
    for module in course.get("modules") or []:
        for lesson in module.get("lessons") or []:
            lesson.setdefault("video", None)
    return course


def save_course(user_id: str, course: dict[str, Any], prompt: str = "") -> str:
    course = enrich_course(course)
    course_id = new_id()
    with db() as conn:
        conn.execute(
            """
            INSERT INTO courses (id, user_id, title, subtitle, level, prompt, data, lesson_count, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                course_id,
                user_id,
                course.get("title", "Untitled course"),
                course.get("subtitle", ""),
                course.get("level", ""),
                prompt,
                json.dumps(course),
                count_lessons(course),
                now_ms(),
            ),
        )
    return course_id


def list_courses(user_id: str) -> list[dict[str, Any]]:
    with db() as conn:
        rows = conn.execute(
            """
            SELECT c.*,
                   (SELECT COUNT(*) FROM course_progress p WHERE p.user_id = ? AND p.course_id = c.id) AS completed_count,
                   EXISTS(SELECT 1 FROM course_favorites f WHERE f.user_id = ? AND f.course_id = c.id) AS favorite
              FROM courses c
             WHERE c.user_id = ?
             ORDER BY c.created_at DESC
            """,
            (user_id, user_id, user_id),
        ).fetchall()
        playlist_rows = conn.execute(
            """
            SELECT i.course_id, i.playlist_id
              FROM course_playlist_items i
              JOIN course_playlists p ON p.id = i.playlist_id
             WHERE p.user_id = ?
            """,
            (user_id,),
        ).fetchall()
    playlist_map: dict[str, list[str]] = {}
    for row in playlist_rows:
        playlist_map.setdefault(row["course_id"], []).append(row["playlist_id"])
    return [
        {
            "id": row["id"],
            "title": row["title"],
            "subtitle": row["subtitle"],
            "level": row["level"],
            "category": infer_course_category(row["title"], row["subtitle"], row["prompt"]),
            "favorite": bool(row["favorite"]),
            "playlistIds": playlist_map.get(row["id"], []),
            "createdAt": int(row["created_at"]),
            "lessonCount": int(row["lesson_count"]),
            "completedCount": int(row["completed_count"]),
        }
        for row in rows
    ]


def get_course(user_id: str, course_id: str) -> dict[str, Any] | None:
    with db() as conn:
        row = conn.execute("SELECT data FROM courses WHERE id = ? AND user_id = ?", (course_id, user_id)).fetchone()
    return enrich_course(json.loads(row["data"])) if row else None


def update_course(user_id: str, course_id: str, course: dict[str, Any]) -> bool:
    course = enrich_course(course)
    with db() as conn:
        cur = conn.execute(
            """
            UPDATE courses
               SET title = ?, subtitle = ?, level = ?, data = ?, lesson_count = ?
             WHERE id = ? AND user_id = ?
            """,
            (
                course.get("title", "Untitled course"),
                course.get("subtitle", ""),
                course.get("level", ""),
                json.dumps(course),
                count_lessons(course),
                course_id,
                user_id,
            ),
        )
    return cur.rowcount > 0


def delete_course(user_id: str, course_id: str) -> None:
    with db() as conn:
        conn.execute("DELETE FROM courses WHERE id = ? AND user_id = ?", (course_id, user_id))


def user_owns_course(user_id: str, course_id: str) -> bool:
    with db() as conn:
        row = conn.execute("SELECT 1 FROM courses WHERE id = ? AND user_id = ?", (course_id, user_id)).fetchone()
    return row is not None


def completed_lessons(user_id: str, course_id: str) -> list[str]:
    with db() as conn:
        rows = conn.execute(
            "SELECT lesson_key FROM course_progress WHERE user_id = ? AND course_id = ? ORDER BY lesson_key",
            (user_id, course_id),
        ).fetchall()
    return [row["lesson_key"] for row in rows]


def set_lesson_completed(user_id: str, course_id: str, lesson_key: str, completed: bool) -> None:
    with db() as conn:
        if completed:
            conn.execute(
                """
                INSERT OR REPLACE INTO course_progress (user_id, course_id, lesson_key, updated_at)
                VALUES (?, ?, ?, ?)
                """,
                (user_id, course_id, lesson_key, now_ms()),
            )
        else:
            conn.execute(
                "DELETE FROM course_progress WHERE user_id = ? AND course_id = ? AND lesson_key = ?",
                (user_id, course_id, lesson_key),
            )


def set_favorite(user_id: str, course_id: str, favorite: bool) -> bool:
    if not user_owns_course(user_id, course_id):
        return False
    with db() as conn:
        if favorite:
            conn.execute(
                "INSERT OR IGNORE INTO course_favorites (user_id, course_id, created_at) VALUES (?, ?, ?)",
                (user_id, course_id, now_ms()),
            )
        else:
            conn.execute("DELETE FROM course_favorites WHERE user_id = ? AND course_id = ?", (user_id, course_id))
    return True


def list_playlists(user_id: str) -> list[dict[str, Any]]:
    with db() as conn:
        rows = conn.execute(
            """
            SELECT p.id, p.name, p.created_at, COUNT(i.course_id) AS course_count
              FROM course_playlists p
              LEFT JOIN course_playlist_items i ON i.playlist_id = p.id
             WHERE p.user_id = ?
             GROUP BY p.id
             ORDER BY p.created_at DESC
            """,
            (user_id,),
        ).fetchall()
    return [
        {"id": row["id"], "name": row["name"], "createdAt": int(row["created_at"]), "courseCount": int(row["course_count"])}
        for row in rows
    ]


def create_playlist(user_id: str, name: str) -> dict[str, Any]:
    playlist_id = new_id()
    clean = name.strip()[:80] or "New playlist"
    created = now_ms()
    with db() as conn:
        conn.execute(
            "INSERT INTO course_playlists (id, user_id, name, created_at) VALUES (?, ?, ?, ?)",
            (playlist_id, user_id, clean, created),
        )
    return {"id": playlist_id, "name": clean, "createdAt": created, "courseCount": 0}


def add_course_to_playlist(user_id: str, playlist_id: str, course_id: str) -> bool:
    with db() as conn:
        row = conn.execute(
            """
            SELECT 1
              FROM course_playlists p
              JOIN courses c ON c.id = ? AND c.user_id = p.user_id
             WHERE p.id = ? AND p.user_id = ?
            """,
            (course_id, playlist_id, user_id),
        ).fetchone()
        if not row:
            return False
        conn.execute(
            "INSERT OR REPLACE INTO course_playlist_items (playlist_id, course_id, added_at) VALUES (?, ?, ?)",
            (playlist_id, course_id, now_ms()),
        )
    return True


def list_notifications(user_id: str) -> list[dict[str, Any]]:
    with db() as conn:
        rows = conn.execute(
            """
            SELECT id, tone, title, message, href, read_at, created_at
              FROM notifications
             WHERE user_id = ?
             ORDER BY created_at DESC
             LIMIT 20
            """,
            (user_id,),
        ).fetchall()
    return [
        {
            "id": row["id"],
            "tone": row["tone"],
            "title": row["title"],
            "message": row["message"],
            "href": row["href"],
            "readAt": row["read_at"],
            "createdAt": int(row["created_at"]),
        }
        for row in rows
    ]


def create_notification(user_id: str, data: dict[str, Any]) -> dict[str, Any]:
    tone = data.get("tone") if data.get("tone") in {"info", "success", "warning", "error"} else "info"
    notification = {
        "id": new_id(),
        "tone": tone,
        "title": str(data.get("title") or "Update").strip()[:120],
        "message": str(data.get("message") or "").strip()[:300],
        "href": str(data.get("href") or "").strip()[:240],
        "readAt": None,
        "createdAt": now_ms(),
    }
    with db() as conn:
        conn.execute(
            """
            INSERT INTO notifications (id, user_id, tone, title, message, href, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                notification["id"],
                user_id,
                notification["tone"],
                notification["title"],
                notification["message"],
                notification["href"],
                notification["createdAt"],
            ),
        )
    return notification


def mark_notifications_read(user_id: str, notification_id: str | None = None) -> None:
    with db() as conn:
        if notification_id:
            conn.execute(
                "UPDATE notifications SET read_at = ? WHERE user_id = ? AND id = ?",
                (now_ms(), user_id, notification_id),
            )
        else:
            conn.execute("UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL", (now_ms(), user_id))
