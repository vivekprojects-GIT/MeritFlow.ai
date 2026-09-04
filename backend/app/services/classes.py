from __future__ import annotations

import json
import secrets
from typing import Any

from ..core.config import JOIN_CODE_TTL_MS
from ..core.db import db
from ..core.security import new_id, now_ms
from .catalog import blank_course, count_lessons, course_from_library_id
from .courses import enrich_course

CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"


def random_code(length: int = 6) -> str:
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(length))


def create_class(instructor_id: str, course: dict[str, Any]) -> dict[str, Any]:
    course = enrich_course(course)
    class_id = new_id()
    code = random_code()
    expires = now_ms() + JOIN_CODE_TTL_MS
    with db() as conn:
        uni = conn.execute("SELECT university_id FROM users WHERE id = ?", (instructor_id,)).fetchone()
        conn.execute(
            """
            INSERT INTO classes (id, instructor_id, join_code, join_code_expires_at, title, subtitle, level, data, lesson_count, exam_open, university_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
            """,
            (
                class_id,
                instructor_id,
                code,
                expires,
                course.get("title", "Untitled course"),
                course.get("subtitle", ""),
                course.get("level", ""),
                json.dumps(course),
                count_lessons(course),
                uni["university_id"] if uni else None,
                now_ms(),
            ),
        )
    return {"id": class_id, "joinCode": code, "expiresAt": expires}


def create_class_from_request(instructor_id: str, data: dict[str, Any]) -> dict[str, Any]:
    if data.get("course") and isinstance(data["course"], dict):
        course = data["course"]
    elif data.get("blank"):
        course = blank_course()
    elif data.get("libraryId"):
        course = course_from_library_id(str(data["libraryId"]))
    else:
        course = blank_course()
    return create_class(instructor_id, course)


def class_summary(row: Any, enrolled: int = 0, completed: int = 0) -> dict[str, Any]:
    return {
        "id": row["id"],
        "joinCode": row["join_code"],
        "joinCodeExpiresAt": row["join_code_expires_at"],
        "title": row["title"],
        "subtitle": row["subtitle"],
        "level": row["level"],
        "lessonCount": int(row["lesson_count"]),
        "examOpen": bool(row["exam_open"]),
        "createdAt": int(row["created_at"]),
        "enrolledCount": enrolled,
        "completedCount": completed,
    }


def list_instructor_classes(instructor_id: str) -> list[dict[str, Any]]:
    with db() as conn:
        rows = conn.execute(
            """
            SELECT c.*,
                   (SELECT COUNT(*) FROM enrollments e WHERE e.class_id = c.id) AS enrolled,
                   (SELECT COUNT(*) FROM enrollments e WHERE e.class_id = c.id AND e.completed_at IS NOT NULL) AS completed
              FROM classes c
             WHERE c.instructor_id = ?
             ORDER BY c.created_at DESC
            """,
            (instructor_id,),
        ).fetchall()
    return [class_summary(row, int(row["enrolled"]), int(row["completed"])) for row in rows]


def get_class_row(class_id: str) -> Any | None:
    with db() as conn:
        return conn.execute("SELECT * FROM classes WHERE id = ?", (class_id,)).fetchone()


def get_instructor_class(instructor_id: str, class_id: str) -> dict[str, Any] | None:
    with db() as conn:
        row = conn.execute("SELECT * FROM classes WHERE id = ? AND instructor_id = ?", (class_id, instructor_id)).fetchone()
        if not row:
            return None
        roster = conn.execute(
            """
            SELECT u.id, u.email, e.enrolled_at, e.completed_at, e.exam_score, e.exam_total,
                   (SELECT COUNT(*) FROM class_progress p WHERE p.class_id = e.class_id AND p.student_id = e.student_id) AS completed_lessons
              FROM enrollments e
              JOIN users u ON u.id = e.student_id
             WHERE e.class_id = ?
             ORDER BY e.enrolled_at DESC
            """,
            (class_id,),
        ).fetchall()
    return {
        "klass": class_summary(row),
        "roster": [
            {
                "studentId": r["id"],
                "email": r["email"],
                "enrolledAt": r["enrolled_at"],
                "completedLessons": int(r["completed_lessons"]),
                "completedAt": r["completed_at"],
                "examScore": r["exam_score"],
                "examTotal": r["exam_total"],
            }
            for r in roster
        ],
    }


def delete_class(instructor_id: str, class_id: str) -> bool:
    with db() as conn:
        cur = conn.execute("DELETE FROM classes WHERE id = ? AND instructor_id = ?", (class_id, instructor_id))
    return cur.rowcount > 0


def set_exam_open(instructor_id: str, class_id: str, open_: bool) -> bool:
    with db() as conn:
        cur = conn.execute(
            "UPDATE classes SET exam_open = ? WHERE id = ? AND instructor_id = ?",
            (1 if open_ else 0, class_id, instructor_id),
        )
    return cur.rowcount > 0


def regenerate_code(instructor_id: str, class_id: str) -> dict[str, Any] | None:
    code = random_code()
    expires = now_ms() + JOIN_CODE_TTL_MS
    with db() as conn:
        cur = conn.execute(
            "UPDATE classes SET join_code = ?, join_code_expires_at = ? WHERE id = ? AND instructor_id = ?",
            (code, expires, class_id, instructor_id),
        )
    return {"joinCode": code, "expiresAt": expires} if cur.rowcount else None


def class_course(instructor_id: str, class_id: str) -> dict[str, Any] | None:
    with db() as conn:
        row = conn.execute(
            "SELECT data FROM classes WHERE id = ? AND instructor_id = ?",
            (class_id, instructor_id),
        ).fetchone()
    return enrich_course(json.loads(row["data"])) if row else None


def update_class_course(instructor_id: str, class_id: str, course: dict[str, Any]) -> bool:
    course = enrich_course(course)
    with db() as conn:
        cur = conn.execute(
            """
            UPDATE classes
               SET title = ?, subtitle = ?, level = ?, data = ?, lesson_count = ?
             WHERE id = ? AND instructor_id = ?
            """,
            (
                course.get("title", "Untitled course"),
                course.get("subtitle", ""),
                course.get("level", ""),
                json.dumps(course),
                count_lessons(course),
                class_id,
                instructor_id,
            ),
        )
    return cur.rowcount > 0


def enroll(student_id: str, professor_email: str, code: str) -> dict[str, Any] | str:
    with db() as conn:
        row = conn.execute(
            """
            SELECT c.*, u.email AS professor_email
              FROM classes c
              JOIN users u ON u.id = c.instructor_id
             WHERE lower(u.email) = lower(?) AND upper(c.join_code) = upper(?)
            """,
            (professor_email, code),
        ).fetchone()
        if not row:
            return "Class not found. Check the professor email and class code."
        if row["join_code_expires_at"] and int(row["join_code_expires_at"]) < now_ms():
            return "That class code expired. Ask your professor for a new one."
        conn.execute(
            "INSERT OR IGNORE INTO enrollments (class_id, student_id, enrolled_at) VALUES (?, ?, ?)",
            (row["id"], student_id, now_ms()),
        )
    return {"id": row["id"], "title": row["title"]}


def list_student_classes(student_id: str) -> list[dict[str, Any]]:
    with db() as conn:
        rows = conn.execute(
            """
            SELECT c.*, u.email AS professor_email, e.completed_at,
                   (SELECT COUNT(*) FROM class_progress p WHERE p.class_id = c.id AND p.student_id = ?) AS completed_count
              FROM enrollments e
              JOIN classes c ON c.id = e.class_id
              JOIN users u ON u.id = c.instructor_id
             WHERE e.student_id = ?
             ORDER BY e.enrolled_at DESC
            """,
            (student_id, student_id),
        ).fetchall()
    return [
        {
            "id": r["id"],
            "title": r["title"],
            "subtitle": r["subtitle"],
            "level": r["level"],
            "professorEmail": r["professor_email"],
            "lessonCount": int(r["lesson_count"]),
            "completedCount": int(r["completed_count"]),
            "examOpen": bool(r["exam_open"]),
            "completedAt": r["completed_at"],
        }
        for r in rows
    ]


def enrolled_class(student_id: str, class_id: str) -> dict[str, Any] | None:
    with db() as conn:
        row = conn.execute(
            """
            SELECT c.*, e.completed_at, e.exam_score, e.exam_total
              FROM enrollments e
              JOIN classes c ON c.id = e.class_id
             WHERE e.student_id = ? AND e.class_id = ?
            """,
            (student_id, class_id),
        ).fetchone()
        if not row:
            return None
        progress = conn.execute(
            "SELECT lesson_key FROM class_progress WHERE student_id = ? AND class_id = ?",
            (student_id, class_id),
        ).fetchall()
    return {
        "course": enrich_course(json.loads(row["data"])),
        "completed": [r["lesson_key"] for r in progress],
        "examLocked": not bool(row["exam_open"]),
        "completedAt": row["completed_at"],
        "examScore": row["exam_score"],
        "examTotal": row["exam_total"],
    }


def set_class_progress(student_id: str, class_id: str, lesson_key: str, completed: bool) -> None:
    with db() as conn:
        if completed:
            conn.execute(
                "INSERT OR REPLACE INTO class_progress (class_id, student_id, lesson_key, updated_at) VALUES (?, ?, ?, ?)",
                (class_id, student_id, lesson_key, now_ms()),
            )
        else:
            conn.execute(
                "DELETE FROM class_progress WHERE class_id = ? AND student_id = ? AND lesson_key = ?",
                (class_id, student_id, lesson_key),
            )


def record_exam(student_id: str, class_id: str, score: int, total: int) -> None:
    with db() as conn:
        conn.execute(
            "UPDATE enrollments SET exam_score = ?, exam_total = ?, completed_at = ? WHERE class_id = ? AND student_id = ?",
            (score, total, now_ms(), class_id, student_id),
        )
