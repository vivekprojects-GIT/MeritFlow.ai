from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from ..core.security import require_user
from ..services import accounts

router = APIRouter(prefix="/api", tags=["account"])


@router.get("/profile")
async def profile(request: Request) -> dict:
    user = require_user(request)
    data = accounts.profile(user["id"])
    if not data:
        raise HTTPException(status_code=404, detail="Not found")
    return {"profile": data}


@router.patch("/profile")
async def update_profile(body: dict, request: Request) -> dict:
    user = require_user(request)
    try:
        return {"profile": accounts.update_profile(user["id"], body)}
    except ValueError as err:
        raise HTTPException(status_code=413, detail=str(err)) from err


@router.get("/billing")
async def billing(request: Request) -> dict:
    user = require_user(request)
    return accounts.billing_state(user["id"])


@router.post("/billing/subscribe")
async def subscribe(body: dict, request: Request) -> dict:
    user = require_user(request)
    return accounts.activate_subscription(user["id"], str(body.get("plan") or "pro_monthly"))


@router.post("/billing/cancel")
async def cancel(request: Request) -> dict:
    user = require_user(request)
    return accounts.cancel_subscription(user["id"])


@router.post("/library/{item_id}/purchase")
async def purchase(item_id: str, request: Request) -> dict:
    user = require_user(request)
    accounts.purchase_item(user["id"], item_id)
    return {"ok": True}
