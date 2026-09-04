from __future__ import annotations

import re
import secrets
from typing import Any

from ..core.db import db
from ..core.security import new_id, now_ms

CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"


def slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:40]
    return slug or "university"


def university_for_admin(admin_id: str) -> dict[str, Any] | None:
    with db() as conn:
        row = conn.execute("SELECT * FROM universities WHERE admin_id = ?", (admin_id,)).fetchone()
    return _university(row) if row else None


def university_by_slug(slug: str) -> dict[str, Any] | None:
    with db() as conn:
        row = conn.execute("SELECT * FROM universities WHERE slug = ?", (slug,)).fetchone()
    return _university(row) if row else None


def create_university(admin_id: str, name: str, logo_url: str | None = None) -> dict[str, Any]:
    uni_id = new_id()
    slug = slugify(name)
    with db() as conn:
        suffix = 2
        candidate = slug
        while conn.execute("SELECT 1 FROM universities WHERE slug = ?", (candidate,)).fetchone():
            candidate = f"{slug}-{suffix}"
            suffix += 1
        conn.execute(
            "INSERT INTO universities (id, slug, name, logo_url, admin_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (uni_id, candidate, name.strip()[:120] or "University", logo_url, admin_id, now_ms()),
        )
        conn.execute("UPDATE users SET university_id = ? WHERE id = ?", (uni_id, admin_id))
    return {"id": uni_id, "slug": candidate, "name": name, "logoUrl": logo_url, "adminId": admin_id, "createdAt": now_ms()}


def update_university(admin_id: str, data: dict[str, Any]) -> dict[str, Any] | None:
    uni = university_for_admin(admin_id)
    if not uni:
        return None
    name = str(data.get("name") or uni["name"]).strip()[:120] or uni["name"]
    logo = data.get("logoUrl", uni.get("logoUrl"))
    with db() as conn:
        conn.execute("UPDATE universities SET name = ?, logo_url = ? WHERE id = ?", (name, logo, uni["id"]))
    uni.update({"name": name, "logoUrl": logo})
    return uni


def generate_professor_code(university_id: str, label: str = "") -> str:
    code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(7))
    with db() as conn:
        conn.execute(
            "INSERT INTO professor_codes (code, university_id, label, created_at) VALUES (?, ?, ?, ?)",
            (code, university_id, label.strip()[:80], now_ms()),
        )
    return code


def list_professor_codes(university_id: str) -> list[dict[str, Any]]:
    with db() as conn:
        rows = conn.execute(
            """
            SELECT pc.*, u.email AS used_by_email
              FROM professor_codes pc
              LEFT JOIN users u ON u.id = pc.used_by
             WHERE pc.university_id = ?
             ORDER BY pc.created_at DESC
            """,
            (university_id,),
        ).fetchall()
    return [
        {
            "code": row["code"],
            "label": row["label"],
            "usedByEmail": row["used_by_email"],
            "usedAt": row["used_at"],
            "createdAt": row["created_at"],
        }
        for row in rows
    ]


def revoke_professor_code(university_id: str, code: str) -> bool:
    with db() as conn:
        cur = conn.execute(
            "DELETE FROM professor_codes WHERE university_id = ? AND code = ? AND used_by IS NULL",
            (university_id, code),
        )
    return cur.rowcount > 0


def consume_professor_code(code: str, user_id: str) -> str | None:
    with db() as conn:
        row = conn.execute(
            "SELECT university_id FROM professor_codes WHERE code = ? AND used_by IS NULL",
            (code,),
        ).fetchone()
        if not row:
            return None
        conn.execute(
            "UPDATE professor_codes SET used_by = ?, used_at = ? WHERE code = ?",
            (user_id, now_ms(), code),
        )
        conn.execute("UPDATE users SET university_id = ? WHERE id = ?", (row["university_id"], user_id))
    return row["university_id"]


def overview(university_id: str) -> dict[str, Any]:
    with db() as conn:
        professors = conn.execute(
            """
            SELECT u.id, u.email,
                   (SELECT COUNT(*) FROM classes c WHERE c.instructor_id = u.id) AS classes,
                   (SELECT COUNT(*) FROM enrollments e JOIN classes c ON c.id = e.class_id WHERE c.instructor_id = u.id) AS students,
                   (SELECT COUNT(*) FROM enrollments e JOIN classes c ON c.id = e.class_id WHERE c.instructor_id = u.id AND e.completed_at IS NOT NULL) AS completions
              FROM users u
             WHERE u.university_id = ? AND u.role = 'instructor'
            """,
            (university_id,),
        ).fetchall()
        classes = conn.execute(
            """
            SELECT c.id, c.title, u.email AS professor_email,
                   (SELECT COUNT(*) FROM enrollments e WHERE e.class_id = c.id) AS enrolled,
                   (SELECT COUNT(*) FROM enrollments e WHERE e.class_id = c.id AND e.completed_at IS NOT NULL) AS completed,
                   c.exam_open
              FROM classes c
              JOIN users u ON u.id = c.instructor_id
             WHERE c.university_id = ?
             ORDER BY c.created_at DESC
            """,
            (university_id,),
        ).fetchall()
    prof_rows = [
        {
            "id": r["id"],
            "email": r["email"],
            "classes": int(r["classes"]),
            "students": int(r["students"]),
            "completions": int(r["completions"]),
        }
        for r in professors
    ]
    class_rows = [
        {
            "id": r["id"],
            "title": r["title"],
            "professorEmail": r["professor_email"],
            "enrolled": int(r["enrolled"]),
            "completed": int(r["completed"]),
            "examOpen": bool(r["exam_open"]),
        }
        for r in classes
    ]
    return {
        "totals": {
            "professors": len(prof_rows),
            "classes": len(class_rows),
            "students": sum(p["students"] for p in prof_rows),
            "completions": sum(p["completions"] for p in prof_rows),
        },
        "professors": prof_rows,
        "classes": class_rows,
    }


def _university(row: Any) -> dict[str, Any]:
    return {
        "id": row["id"],
        "slug": row["slug"],
        "name": row["name"],
        "logoUrl": row["logo_url"],
        "adminId": row["admin_id"],
        "createdAt": row["created_at"],
    }
