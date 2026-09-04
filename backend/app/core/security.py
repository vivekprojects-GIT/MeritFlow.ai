from __future__ import annotations

import hashlib
import hmac
import secrets
import time
from typing import Any

from fastapi import HTTPException, Request, Response

from .config import DEV_ADOPT_SESSION, DEV_PRO, SESSION_COOKIE, SESSION_MS
from .db import db


def now_ms() -> int:
    return int(time.time() * 1000)


def new_id() -> str:
    return secrets.token_hex(16)


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    key = hashlib.scrypt(password.encode("utf-8"), salt=bytes.fromhex(salt), n=16384, r=8, p=1, dklen=64)
    return f"{salt}:{key.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt, key_hex = stored.split(":", 1)
        expected = bytes.fromhex(key_hex)
        actual = hashlib.scrypt(password.encode("utf-8"), salt=bytes.fromhex(salt), n=16384, r=8, p=1, dklen=64)
        return hmac.compare_digest(actual, expected)
    except Exception:
        return False


def set_session_cookie(response: Response, token: str, expires_at: int) -> None:
    max_age = max(0, int((expires_at - now_ms()) / 1000))
    response.set_cookie(
        SESSION_COOKIE,
        token,
        httponly=True,
        samesite="lax",
        secure=False,
        path="/",
        max_age=max_age,
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE, path="/")


def create_session(user_id: str, token: str | None = None) -> tuple[str, int]:
    value = token or secrets.token_hex(32)
    expires_at = now_ms() + SESSION_MS
    with db() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)",
            (value, user_id, expires_at),
        )
    return value, expires_at


def current_user(request: Request) -> dict[str, Any] | None:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        return None
    with db() as conn:
        row = conn.execute(
            """
            SELECT u.id, u.email, u.role, u.university_id
              FROM sessions s
              JOIN users u ON u.id = s.user_id
             WHERE s.token = ? AND s.expires_at > ?
            """,
            (token, now_ms()),
        ).fetchone()
        if row:
            return {
                "id": row["id"],
                "email": row["email"],
                "role": row["role"] or "student",
                "universityId": row["university_id"],
            }

    if DEV_ADOPT_SESSION:
        return adopt_dev_session(token)
    return None


def require_user(request: Request) -> dict[str, Any]:
    user = current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return user


def require_role(request: Request, *roles: str) -> dict[str, Any]:
    user = require_user(request)
    if user["role"] not in roles:
        raise HTTPException(status_code=403, detail="Forbidden")
    return user


def adopt_dev_session(token: str) -> dict[str, Any]:
    user_id = "dev-student"
    now = now_ms()
    with db() as conn:
        conn.execute(
            """
            INSERT OR IGNORE INTO users (id, email, password_hash, created_at, role, name)
            VALUES (?, ?, ?, ?, 'student', 'Student')
            """,
            (user_id, "student@meritflow.local", hash_password("password123"), now),
        )
        conn.execute(
            "INSERT OR REPLACE INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)",
            (token, user_id, now + SESSION_MS),
        )
        if DEV_PRO:
            conn.execute(
                """
                INSERT OR REPLACE INTO subscriptions (user_id, plan, status, current_period_end, created_at)
                VALUES (?, 'pro_monthly', 'active', ?, ?)
                """,
                (user_id, now + 30 * 86_400_000, now),
            )
    return {"id": user_id, "email": "student@meritflow.local", "role": "student", "universityId": None}
