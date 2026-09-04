from __future__ import annotations

import os

from typing import Any

from ..core.config import ADMIN_SIGNUP_CODE, DEV_PRO
from ..core.db import db
from ..core.security import create_session, hash_password, new_id, now_ms, verify_password

MS_DAY = 86_400_000
AVATAR_MAX_CHARS = 900_000


def find_user_by_email(email: str) -> dict[str, Any] | None:
    with db() as conn:
        row = conn.execute(
            "SELECT id, email, password_hash, role, university_id FROM users WHERE email = ?",
            (email.lower(),),
        ).fetchone()
    return dict(row) if row else None


def create_user(email: str, password: str, role: str = "student", university_id: str | None = None) -> dict[str, Any]:
    user_id = new_id()
    with db() as conn:
        conn.execute(
            """
            INSERT INTO users (id, email, password_hash, created_at, role, university_id, name)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (user_id, email.lower(), hash_password(password), now_ms(), role, university_id, email.split("@")[0]),
        )
        if DEV_PRO:
            conn.execute(
                """
                INSERT OR REPLACE INTO subscriptions (user_id, plan, status, current_period_end, created_at)
                VALUES (?, 'pro_monthly', 'active', ?, ?)
                """,
                (user_id, now_ms() + 30 * MS_DAY, now_ms()),
            )
    return {"id": user_id, "email": email.lower(), "role": role, "universityId": university_id}


def login_user(email: str, password: str) -> tuple[dict[str, Any], str, int] | None:
    user = find_user_by_email(email)
    if not user or not verify_password(password, user["password_hash"]):
        return None
    token, expires = create_session(user["id"])
    return (
        {"id": user["id"], "email": user["email"], "role": user["role"], "universityId": user["university_id"]},
        token,
        expires,
    )


# Institutional email suffixes. `.edu` covers most, and INSTITUTIONAL_EMAIL_DOMAINS
# lets a deployment add its own (".ac.uk", ".edu.au", a private domain) as a
# comma-separated list.
INSTITUTIONAL_DOMAINS = [
    suffix.strip().lower()
    for suffix in (os.getenv("INSTITUTIONAL_EMAIL_DOMAINS") or ".edu,.ac.uk,.edu.au,.edu.in,.ac.in").split(",")
    if suffix.strip()
]


def is_institutional_email(email: str) -> bool:
    domain = email.rsplit("@", 1)[-1].lower()
    return any(domain == suffix.lstrip(".") or domain.endswith(suffix) for suffix in INSTITUTIONAL_DOMAINS)


def signup_user(data: dict[str, Any]) -> tuple[dict[str, Any], str, int] | str:
    email = str(data.get("email") or "").strip().lower()
    password = str(data.get("password") or "")
    role_req = str(data.get("role") or "student")
    access_code = str(data.get("accessCode") or "").strip()
    if "@" not in email or "." not in email:
        return "Please enter a valid email address."
    if len(password) < 8:
        return "Password must be at least 8 characters."
    if find_user_by_email(email):
        return "An account with that email already exists."
    if role_req == "admin" and access_code != ADMIN_SIGNUP_CODE:
        return "That admin access code is not valid."

    role = "admin" if role_req == "admin" else "instructor" if role_req == "instructor" else "student"

    # `role` arrives from the request body, so without a check anyone could sign
    # up as an instructor and gain a professor's view of other people's classes.
    # An institutional address is what makes the claim mean something: required
    # for every professor, and for students joining through a university.
    # Individual learners are unaffected — they have no university context.
    joining_university = bool(str(data.get("universitySlug") or "").strip()) or bool(access_code)
    if role == "instructor" or (role == "student" and joining_university):
        if not is_institutional_email(email):
            who = "Professor" if role == "instructor" else "University student"
            return f"{who} accounts need an institutional email address (for example name{INSTITUTIONAL_DOMAINS[0]})."
    user = create_user(email, password, role)
    token, expires = create_session(user["id"])
    return user, token, expires


def delete_session(token: str | None) -> None:
    if not token:
        return
    with db() as conn:
        conn.execute("DELETE FROM sessions WHERE token = ?", (token,))


def profile(user_id: str) -> dict[str, Any] | None:
    with db() as conn:
        row = conn.execute(
            "SELECT id, email, role, name, avatar_url, headline, bio FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
    if not row:
        return None
    return {
        "id": row["id"],
        "email": row["email"],
        "role": row["role"],
        "name": row["name"] or row["email"].split("@")[0],
        "avatarUrl": row["avatar_url"],
        "headline": row["headline"] or "",
        "bio": row["bio"] or "",
    }


def update_profile(user_id: str, fields: dict[str, Any]) -> dict[str, Any]:
    allowed = {
        "name": ("name", lambda v: str(v).strip()[:80]),
        "headline": ("headline", lambda v: str(v).strip()[:120]),
        "bio": ("bio", lambda v: str(v).strip()[:800]),
        "avatarUrl": ("avatar_url", lambda v: None if v is None else str(v)),
    }
    sets: list[str] = []
    values: list[Any] = []
    for key, (column, clean) in allowed.items():
        if key in fields:
            value = clean(fields[key])
            if key == "avatarUrl" and value is not None and len(value) > AVATAR_MAX_CHARS:
                raise ValueError("Image is too large.")
            sets.append(f"{column} = ?")
            values.append(value)
    if sets:
        values.append(user_id)
        with db() as conn:
            conn.execute(f"UPDATE users SET {', '.join(sets)} WHERE id = ?", values)
    return profile(user_id) or {}


def billing_state(user_id: str) -> dict[str, Any]:
    with db() as conn:
        sub = conn.execute(
            "SELECT plan, status, current_period_end FROM subscriptions WHERE user_id = ?",
            (user_id,),
        ).fetchone()
        purchases = conn.execute("SELECT item_id FROM purchases WHERE user_id = ?", (user_id,)).fetchall()
    end = int(sub["current_period_end"]) if sub else None
    is_pro = bool(sub and sub["status"] == "active" and (end or 0) > now_ms()) or DEV_PRO
    return {
        "isPro": is_pro,
        "plan": sub["plan"] if sub else ("pro_monthly" if DEV_PRO else None),
        "status": sub["status"] if sub else ("active" if DEV_PRO else None),
        "currentPeriodEnd": end if sub else (now_ms() + 30 * MS_DAY if DEV_PRO else None),
        "purchases": [row["item_id"] for row in purchases],
    }


def activate_subscription(user_id: str, plan: str) -> dict[str, Any]:
    plan = plan if plan in {"pro_monthly", "pro_yearly"} else "pro_monthly"
    end = now_ms() + (365 if plan == "pro_yearly" else 30) * MS_DAY
    with db() as conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO subscriptions (user_id, plan, status, current_period_end, created_at)
            VALUES (?, ?, 'active', ?, ?)
            """,
            (user_id, plan, end, now_ms()),
        )
    return billing_state(user_id)


def cancel_subscription(user_id: str) -> dict[str, Any]:
    with db() as conn:
        conn.execute("UPDATE subscriptions SET status = 'canceled' WHERE user_id = ?", (user_id,))
    return billing_state(user_id)


def purchase_item(user_id: str, item_id: str) -> None:
    with db() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO purchases (user_id, item_id, created_at) VALUES (?, ?, ?)",
            (user_id, item_id, now_ms()),
        )
