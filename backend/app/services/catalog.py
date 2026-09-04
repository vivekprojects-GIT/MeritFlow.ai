from __future__ import annotations

from typing import Any


def count_lessons(course: dict[str, Any]) -> int:
    return sum(len(module.get("lessons") or []) for module in course.get("modules") or [])


def infer_course_category(title: str, subtitle: str = "", prompt: str = "") -> str:
    text = f"{title} {subtitle} {prompt}".lower()
    if any(word in text for word in ("ai", "artificial intelligence", "machine learning", "ml", "llm", "agent")):
        return "AI & ML"
    if any(word in text for word in ("python", "javascript", "typescript", "react", "web", "code", "programming", "sql")):
        return "Programming"
    if any(word in text for word in ("ui", "ux", "design", "figma", "prototype")):
        return "Design"
    if any(word in text for word in ("finance", "invest", "money", "stock", "budget")):
        return "Finance"
    if any(word in text for word in ("speak", "story", "communication", "writing", "presentation")):
        return "Communication"
    if any(word in text for word in ("business", "startup", "management", "marketing")):
        return "Business"
    return "General"


def blank_lesson() -> dict[str, Any]:
    return {
        "title": "",
        "objective": "",
        "intro": "",
        "sections": [{"heading": "", "body": ""}],
        "keyPoints": [""],
        "codeExamples": [],
        "commonMistakes": [],
        "practice": "",
        "needsVideo": False,
        "videoQuery": "",
        "video": None,
    }


def blank_module(n: int = 1) -> dict[str, Any]:
    return {"title": f"Module {n}", "summary": "", "lessons": [blank_lesson()], "quiz": []}


def blank_course() -> dict[str, Any]:
    return {
        "title": "Untitled course",
        "subtitle": "",
        "description": "",
        "level": "All levels",
        "estimatedHours": 1,
        "prerequisites": [],
        "outcomes": [],
        "modules": [blank_module(1)],
    }


def course_from_library_id(library_id: str) -> dict[str, Any]:
    title = library_id.replace("-", " ").replace("_", " ").strip().title() or "Library Course"
    course = blank_course()
    course.update(
        {
            "title": title,
            "subtitle": "Library course",
            "description": "A starter course created from the library catalog.",
            "level": "Beginner",
            "outcomes": ["Understand the foundations", "Practice the core workflow", "Apply the ideas in a project"],
        }
    )
    course["modules"] = [
        {
            "title": "Foundations",
            "summary": "Core ideas and vocabulary.",
            "lessons": [
                {
                    **blank_lesson(),
                    "title": "Start here",
                    "objective": "Understand the course goal and core concepts.",
                    "intro": "This lesson introduces the foundation for the course.",
                    "sections": [
                        {"heading": "Core idea", "body": "Learn the main idea and why it matters."},
                        {"heading": "First practice", "body": "Apply the idea in a small, concrete example."},
                    ],
                    "keyPoints": ["Know the goal", "Learn the vocabulary", "Try one example"],
                    "practice": "Write down one place where you can apply this topic.",
                }
            ],
            "quiz": [],
        }
    ]
    return course
