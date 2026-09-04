from __future__ import annotations

from typing import Any

from ..core.db import db
from ..core.security import new_id, now_ms


def create_assignment(instructor_id: str, class_id: str, data: dict[str, Any]) -> dict[str, Any] | None:
    with db() as conn:
        owns = conn.execute("SELECT 1 FROM classes WHERE id = ? AND instructor_id = ?", (class_id, instructor_id)).fetchone()
        if not owns:
            return None
        assignment_id = new_id()
        row = {
            "id": assignment_id,
            "classId": class_id,
            "title": str(data.get("title") or "Assignment").strip()[:120],
            "instructions": str(data.get("instructions") or "").strip()[:5000],
            "rubric": str(data.get("rubric") or "").strip()[:3000],
            "points": int(data.get("points") or 100),
            "dueAt": data.get("dueAt") if isinstance(data.get("dueAt"), int) else None,
            "createdAt": now_ms(),
        }
        conn.execute(
            """
            INSERT INTO assignments (id, class_id, title, instructions, rubric, points, due_at, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                row["id"],
                row["classId"],
                row["title"],
                row["instructions"],
                row["rubric"],
                row["points"],
                row["dueAt"],
                row["createdAt"],
            ),
        )
    return row


def list_for_instructor(instructor_id: str, class_id: str) -> list[dict[str, Any]]:
    with db() as conn:
        rows = conn.execute(
            """
            SELECT a.*,
                   (SELECT COUNT(*) FROM submissions s WHERE s.assignment_id = a.id) AS submission_count,
                   (SELECT COUNT(*) FROM submissions s WHERE s.assignment_id = a.id AND s.grade IS NOT NULL) AS graded_count
              FROM assignments a
              JOIN classes c ON c.id = a.class_id
             WHERE a.class_id = ? AND c.instructor_id = ?
             ORDER BY a.created_at DESC
            """,
            (class_id, instructor_id),
        ).fetchall()
    return [_assignment(row) | {"submissionCount": int(row["submission_count"]), "gradedCount": int(row["graded_count"])} for row in rows]


def list_for_student(student_id: str, class_id: str) -> list[dict[str, Any]]:
    with db() as conn:
        rows = conn.execute(
            """
            SELECT a.*, s.text, s.link, s.file_name, s.file_data, s.submitted_at, s.grade, s.feedback, s.graded_at
              FROM assignments a
              JOIN enrollments e ON e.class_id = a.class_id AND e.student_id = ?
              LEFT JOIN submissions s ON s.assignment_id = a.id AND s.student_id = ?
             WHERE a.class_id = ?
             ORDER BY a.created_at DESC
            """,
            (student_id, student_id, class_id),
        ).fetchall()
    return [_assignment(row) | {"submission": _submission(row)} for row in rows]


def delete_assignment(instructor_id: str, assignment_id: str) -> bool:
    with db() as conn:
        cur = conn.execute(
            """
            DELETE FROM assignments
             WHERE id = ? AND class_id IN (SELECT id FROM classes WHERE instructor_id = ?)
            """,
            (assignment_id, instructor_id),
        )
    return cur.rowcount > 0


def submit_assignment(student_id: str, assignment_id: str, data: dict[str, Any]) -> bool:
    with db() as conn:
        enrolled = conn.execute(
            """
            SELECT 1
              FROM assignments a
              JOIN enrollments e ON e.class_id = a.class_id AND e.student_id = ?
             WHERE a.id = ?
            """,
            (student_id, assignment_id),
        ).fetchone()
        if not enrolled:
            return False
        conn.execute(
            """
            INSERT OR REPLACE INTO submissions (assignment_id, student_id, text, link, file_name, file_data, submitted_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                assignment_id,
                student_id,
                str(data.get("text") or "")[:20_000],
                str(data.get("link") or "")[:600],
                data.get("fileName") if isinstance(data.get("fileName"), str) else None,
                data.get("fileData") if isinstance(data.get("fileData"), str) else None,
                now_ms(),
            ),
        )
    return True


def submissions(instructor_id: str, assignment_id: str) -> list[dict[str, Any]] | None:
    with db() as conn:
        owns = conn.execute(
            """
            SELECT 1 FROM assignments a
            JOIN classes c ON c.id = a.class_id
            WHERE a.id = ? AND c.instructor_id = ?
            """,
            (assignment_id, instructor_id),
        ).fetchone()
        if not owns:
            return None
        rows = conn.execute(
            """
            SELECT u.id, u.email, s.*
              FROM submissions s
              JOIN users u ON u.id = s.student_id
             WHERE s.assignment_id = ?
             ORDER BY s.submitted_at DESC
            """,
            (assignment_id,),
        ).fetchall()
    return [
        {
            "studentId": row["id"],
            "email": row["email"],
            "text": row["text"],
            "link": row["link"],
            "fileName": row["file_name"],
            "fileData": row["file_data"],
            "submittedAt": row["submitted_at"],
            "grade": row["grade"],
            "feedback": row["feedback"],
            "gradedAt": row["graded_at"],
        }
        for row in rows
    ]


def grade_submission(instructor_id: str, assignment_id: str, student_id: str, grade: int, feedback: str) -> bool:
    if submissions(instructor_id, assignment_id) is None:
        return False
    with db() as conn:
        cur = conn.execute(
            "UPDATE submissions SET grade = ?, feedback = ?, graded_at = ? WHERE assignment_id = ? AND student_id = ?",
            (grade, feedback[:3000], now_ms(), assignment_id, student_id),
        )
    return cur.rowcount > 0


def upcoming(student_id: str) -> list[dict[str, Any]]:
    with db() as conn:
        rows = conn.execute(
            """
            SELECT a.id, a.class_id, c.title AS class_title, a.title, a.points, a.due_at,
                   s.submitted_at, s.grade
              FROM assignments a
              JOIN classes c ON c.id = a.class_id
              JOIN enrollments e ON e.class_id = c.id AND e.student_id = ?
              LEFT JOIN submissions s ON s.assignment_id = a.id AND s.student_id = ?
             WHERE a.due_at IS NOT NULL
             ORDER BY a.due_at ASC
             LIMIT 20
            """,
            (student_id, student_id),
        ).fetchall()
    return [
        {
            "id": r["id"],
            "classId": r["class_id"],
            "classTitle": r["class_title"],
            "title": r["title"],
            "points": r["points"],
            "dueAt": r["due_at"],
            "submittedAt": r["submitted_at"],
            "graded": r["grade"] is not None,
            "grade": r["grade"],
        }
        for r in rows
    ]


def _assignment(row: Any) -> dict[str, Any]:
    return {
        "id": row["id"],
        "classId": row["class_id"],
        "title": row["title"],
        "instructions": row["instructions"],
        "rubric": row["rubric"],
        "points": row["points"],
        "dueAt": row["due_at"],
        "createdAt": row["created_at"],
    }


def _submission(row: Any) -> dict[str, Any] | None:
    if row["submitted_at"] is None:
        return None
    return {
        "text": row["text"],
        "link": row["link"],
        "fileName": row["file_name"],
        "fileData": row["file_data"],
        "submittedAt": row["submitted_at"],
        "grade": row["grade"],
        "feedback": row["feedback"],
        "gradedAt": row["graded_at"],
    }
