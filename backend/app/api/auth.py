from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, Response

from ..core.config import SESSION_COOKIE
from ..core.security import clear_session_cookie, require_user, set_session_cookie
from ..services import accounts

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login")
async def login(body: dict, response: Response) -> dict:
    result = accounts.login_user(str(body.get("email") or "").strip().lower(), str(body.get("password") or ""))
    if not result:
        raise HTTPException(status_code=401, detail="Incorrect email or password.")
    user, token, expires = result
    set_session_cookie(response, token, expires)
    return {"user": {"id": user["id"], "email": user["email"], "role": user["role"]}}


@router.post("/signup")
async def signup(body: dict, response: Response) -> dict:
    result = accounts.signup_user(body)
    if isinstance(result, str):
        status = 403 if "code" in result.lower() else 409 if "already" in result.lower() else 400
        raise HTTPException(status_code=status, detail=result)
    user, token, expires = result
    set_session_cookie(response, token, expires)
    return {"user": {"id": user["id"], "email": user["email"], "role": user["role"]}}


@router.post("/logout")
async def logout(request: Request, response: Response) -> dict:
    accounts.delete_session(request.cookies.get(SESSION_COOKIE))
    clear_session_cookie(response)
    return {"ok": True}


@router.get("/me")
async def me(request: Request) -> dict:
    return {"user": require_user(request)}
