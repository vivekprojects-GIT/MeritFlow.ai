from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from ..core.security import require_role
from ..services import admin

router = APIRouter(prefix="/api", tags=["admin"])


@router.get("/admin/university")
async def get_university(request: Request) -> dict:
    user = require_role(request, "admin")
    return {"university": admin.university_for_admin(user["id"])}


@router.post("/admin/university")
async def create_university(body: dict, request: Request) -> dict:
    user = require_role(request, "admin")
    name = str(body.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="University name is required.")
    return {"university": admin.create_university(user["id"], name, body.get("logoUrl"))}


@router.patch("/admin/university")
async def update_university(body: dict, request: Request) -> dict:
    user = require_role(request, "admin")
    uni = admin.update_university(user["id"], body)
    if not uni:
        raise HTTPException(status_code=404, detail="Create a university first.")
    return {"university": uni}


@router.get("/admin/codes")
async def list_codes(request: Request) -> dict:
    user = require_role(request, "admin")
    uni = admin.university_for_admin(user["id"])
    if not uni:
        return {"codes": []}
    return {"codes": admin.list_professor_codes(uni["id"])}


@router.post("/admin/codes")
async def create_code(body: dict, request: Request) -> dict:
    user = require_role(request, "admin")
    uni = admin.university_for_admin(user["id"])
    if not uni:
        raise HTTPException(status_code=404, detail="Create a university first.")
    code = admin.generate_professor_code(uni["id"], str(body.get("label") or ""))
    return {"code": code}


@router.delete("/admin/codes")
async def revoke_code(body: dict, request: Request) -> dict:
    user = require_role(request, "admin")
    uni = admin.university_for_admin(user["id"])
    if not uni:
        raise HTTPException(status_code=404, detail="Create a university first.")
    if not admin.revoke_professor_code(uni["id"], str(body.get("code") or "")):
        raise HTTPException(status_code=404, detail="Code not found.")
    return {"ok": True}


@router.get("/admin/overview")
async def overview(request: Request) -> dict:
    user = require_role(request, "admin")
    uni = admin.university_for_admin(user["id"])
    if not uni:
        return {"overview": {"totals": {"professors": 0, "classes": 0, "students": 0, "completions": 0}, "professors": [], "classes": []}}
    return {"overview": admin.overview(uni["id"])}


@router.get("/admin/classes/{class_id}")
async def admin_class(class_id: str, request: Request) -> dict:
    user = require_role(request, "admin")
    uni = admin.university_for_admin(user["id"])
    if not uni:
        raise HTTPException(status_code=404, detail="Create a university first.")
    data = admin.overview(uni["id"])
    row = next((item for item in data["classes"] if item["id"] == class_id), None)
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    return {"klass": row, "roster": []}


@router.get("/branding")
async def branding(university: str | None = None) -> dict:
    uni = admin.university_by_slug(university or "") if university else None
    return {"brand": uni}
