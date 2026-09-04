from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import PlainTextResponse

from ..core.security import require_role, require_user
from ..services import assignments, classes

router = APIRouter(prefix="/api", tags=["classes"])


@router.get("/classes")
async def list_classes(request: Request) -> dict:
    user = require_role(request, "instructor")
    return {"classes": classes.list_instructor_classes(user["id"])}


@router.post("/classes")
async def create_class(body: dict, request: Request) -> dict:
    user = require_role(request, "instructor")
    return classes.create_class_from_request(user["id"], body)


@router.post("/classes/generate")
async def create_class_with_ai(body: dict, request: Request) -> dict:
    from .courses import _generate_request
    from ..generator import generate_course

    user = require_role(request, "instructor")
    req = _generate_request(
        {
            "prompt": body.get("title") if body.get("mode") == "document" else body.get("prompt"),
            "level": body.get("level"),
            "language": body.get("language"),
            "sourceText": body.get("documentText") if body.get("mode") == "document" else None,
        }
    )
    course = (await generate_course(req)).model_dump(mode="json")
    result = classes.create_class(user["id"], course)
    result["title"] = course.get("title")
    result["videosPending"] = False
    return result


@router.get("/classes/{class_id}")
async def get_class(class_id: str, request: Request) -> dict:
    user = require_role(request, "instructor")
    data = classes.get_instructor_class(user["id"], class_id)
    if not data:
        raise HTTPException(status_code=404, detail="Not found")
    return data


@router.patch("/classes/{class_id}")
async def patch_class(class_id: str, body: dict, request: Request) -> dict:
    user = require_role(request, "instructor")
    if "examOpen" in body and not classes.set_exam_open(user["id"], class_id, bool(body["examOpen"])):
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}


@router.delete("/classes/{class_id}")
async def delete_class(class_id: str, request: Request) -> dict:
    user = require_role(request, "instructor")
    if not classes.delete_class(user["id"], class_id):
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}


@router.post("/classes/{class_id}/code")
async def regenerate_code(class_id: str, request: Request) -> dict:
    user = require_role(request, "instructor")
    result = classes.regenerate_code(user["id"], class_id)
    if not result:
        raise HTTPException(status_code=404, detail="Not found")
    return result


@router.get("/classes/{class_id}/course")
async def get_class_course(class_id: str, request: Request) -> dict:
    user = require_role(request, "instructor")
    course = classes.class_course(user["id"], class_id)
    if not course:
        raise HTTPException(status_code=404, detail="Not found")
    return {"course": course}


@router.put("/classes/{class_id}/course")
async def put_class_course(class_id: str, body: dict, request: Request) -> dict:
    user = require_role(request, "instructor")
    course = body.get("course")
    if not isinstance(course, dict) or not course.get("title") or not course.get("modules"):
        raise HTTPException(status_code=400, detail="A course with a title and at least one module is required.")
    if not classes.update_class_course(user["id"], class_id, course):
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}


@router.post("/enroll")
async def enroll(body: dict, request: Request) -> dict:
    user = require_user(request)
    result = classes.enroll(user["id"], str(body.get("professorEmail") or body.get("email") or ""), str(body.get("code") or ""))
    if isinstance(result, str):
        raise HTTPException(status_code=404, detail=result)
    return result


@router.get("/my-classes")
async def my_classes(request: Request) -> dict:
    user = require_user(request)
    return {"classes": classes.list_student_classes(user["id"])}


@router.get("/classes/{class_id}/learn")
async def class_learn(class_id: str, request: Request) -> dict:
    user = require_user(request)
    data = classes.enrolled_class(user["id"], class_id)
    if not data:
        raise HTTPException(status_code=404, detail="Not enrolled.")
    return data


@router.post("/classes/{class_id}/progress")
async def class_progress(class_id: str, body: dict, request: Request) -> dict:
    user = require_user(request)
    lesson_key = str(body.get("lessonKey") or "")
    if not lesson_key:
        raise HTTPException(status_code=400, detail="Missing lessonKey.")
    classes.set_class_progress(user["id"], class_id, lesson_key, bool(body.get("completed")))
    return {"ok": True}


@router.post("/classes/{class_id}/exam")
async def class_exam(class_id: str, body: dict, request: Request) -> dict:
    user = require_user(request)
    classes.record_exam(user["id"], class_id, int(body.get("score") or 0), int(body.get("total") or 0))
    return {"ok": True}


@router.get("/classes/{class_id}/assignments")
async def class_assignments(class_id: str, request: Request) -> dict:
    user = require_user(request)
    if user["role"] == "instructor":
        return {"assignments": assignments.list_for_instructor(user["id"], class_id)}
    return {"assignments": assignments.list_for_student(user["id"], class_id)}


@router.post("/classes/{class_id}/assignments")
async def create_assignment(class_id: str, body: dict, request: Request) -> dict:
    user = require_role(request, "instructor")
    assignment = assignments.create_assignment(user["id"], class_id, body)
    if not assignment:
        raise HTTPException(status_code=404, detail="Class not found.")
    return {"assignment": assignment}


@router.delete("/assignments/{assignment_id}")
async def delete_assignment(assignment_id: str, request: Request) -> dict:
    user = require_role(request, "instructor")
    if not assignments.delete_assignment(user["id"], assignment_id):
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}


@router.post("/assignments/{assignment_id}/submit")
async def submit_assignment(assignment_id: str, body: dict, request: Request) -> dict:
    user = require_user(request)
    if not assignments.submit_assignment(user["id"], assignment_id, body):
        raise HTTPException(status_code=404, detail="Assignment not found.")
    return {"ok": True}


@router.get("/assignments/{assignment_id}/submissions")
async def assignment_submissions(assignment_id: str, request: Request) -> dict:
    user = require_role(request, "instructor")
    rows = assignments.submissions(user["id"], assignment_id)
    if rows is None:
        raise HTTPException(status_code=404, detail="Not found")
    return {"submissions": rows}


@router.post("/assignments/{assignment_id}/grade")
async def assignment_grade(assignment_id: str, body: dict, request: Request) -> dict:
    user = require_role(request, "instructor")
    student_id = str(body.get("studentId") or "")
    if not assignments.grade_submission(user["id"], assignment_id, student_id, int(body.get("grade") or 0), str(body.get("feedback") or "")):
        raise HTTPException(status_code=404, detail="Submission not found.")
    return {"ok": True}


@router.get("/my-deadlines")
async def my_deadlines(request: Request) -> dict:
    user = require_user(request)
    return {"deadlines": assignments.upcoming(user["id"])}


@router.get("/classes/{class_id}/gradebook")
async def gradebook(class_id: str, request: Request, format: str | None = None):
    user = require_role(request, "instructor")
    data = classes.get_instructor_class(user["id"], class_id)
    if not data:
        raise HTTPException(status_code=404, detail="Not found")
    if format == "csv":
        return PlainTextResponse("Student,Completed Lessons\n" + "\n".join(f"{r['email']},{r['completedLessons']}" for r in data["roster"]))
    return {"gradebook": {"klass": data["klass"], "rows": data["roster"], "assignments": [], "averages": {}}}
