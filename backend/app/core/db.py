from __future__ import annotations

import sqlite3
import threading
from collections.abc import Iterator
from contextlib import contextmanager

from .config import SQLITE_PATH

_init_lock = threading.Lock()
_initialized = False


def connect() -> sqlite3.Connection:
    SQLITE_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(SQLITE_PATH, timeout=30, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


@contextmanager
def db() -> Iterator[sqlite3.Connection]:
    init_db()
    conn = connect()
    try:
        yield conn
    finally:
        conn.close()


def init_db() -> None:
    global _initialized
    if _initialized:
        return
    with _init_lock:
        if _initialized:
            return
        SQLITE_PATH.parent.mkdir(parents=True, exist_ok=True)
        conn = connect()
        try:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS users (
                  id TEXT PRIMARY KEY,
                  email TEXT UNIQUE NOT NULL,
                  password_hash TEXT NOT NULL,
                  created_at INTEGER NOT NULL,
                  role TEXT NOT NULL DEFAULT 'student',
                  university_id TEXT,
                  name TEXT,
                  avatar_url TEXT,
                  headline TEXT,
                  bio TEXT
                );

                CREATE TABLE IF NOT EXISTS sessions (
                  token TEXT PRIMARY KEY,
                  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                  expires_at INTEGER NOT NULL
                );

                CREATE TABLE IF NOT EXISTS courses (
                  id TEXT PRIMARY KEY,
                  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                  title TEXT NOT NULL,
                  subtitle TEXT NOT NULL DEFAULT '',
                  level TEXT NOT NULL DEFAULT '',
                  prompt TEXT NOT NULL DEFAULT '',
                  data TEXT NOT NULL,
                  lesson_count INTEGER NOT NULL DEFAULT 0,
                  created_at INTEGER NOT NULL
                );

                CREATE TABLE IF NOT EXISTS course_progress (
                  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
                  lesson_key TEXT NOT NULL,
                  updated_at INTEGER NOT NULL,
                  PRIMARY KEY (user_id, course_id, lesson_key)
                );

                CREATE TABLE IF NOT EXISTS course_playlists (
                  id TEXT PRIMARY KEY,
                  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                  name TEXT NOT NULL,
                  created_at INTEGER NOT NULL
                );

                CREATE TABLE IF NOT EXISTS course_playlist_items (
                  playlist_id TEXT NOT NULL REFERENCES course_playlists(id) ON DELETE CASCADE,
                  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
                  added_at INTEGER NOT NULL,
                  PRIMARY KEY (playlist_id, course_id)
                );

                CREATE TABLE IF NOT EXISTS course_favorites (
                  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
                  created_at INTEGER NOT NULL,
                  PRIMARY KEY (user_id, course_id)
                );

                CREATE TABLE IF NOT EXISTS notifications (
                  id TEXT PRIMARY KEY,
                  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                  tone TEXT NOT NULL DEFAULT 'info',
                  title TEXT NOT NULL,
                  message TEXT NOT NULL DEFAULT '',
                  href TEXT NOT NULL DEFAULT '',
                  read_at INTEGER,
                  created_at INTEGER NOT NULL
                );

                CREATE TABLE IF NOT EXISTS subscriptions (
                  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                  plan TEXT NOT NULL,
                  status TEXT NOT NULL,
                  current_period_end INTEGER NOT NULL,
                  created_at INTEGER NOT NULL
                );

                CREATE TABLE IF NOT EXISTS purchases (
                  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                  item_id TEXT NOT NULL,
                  created_at INTEGER NOT NULL,
                  PRIMARY KEY (user_id, item_id)
                );

                CREATE TABLE IF NOT EXISTS tutor_usage (
                  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                  day TEXT NOT NULL,
                  count INTEGER NOT NULL DEFAULT 0,
                  PRIMARY KEY (user_id, day)
                );

                CREATE TABLE IF NOT EXISTS certificates (
                  id TEXT PRIMARY KEY,
                  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                  course_id TEXT NOT NULL DEFAULT '',
                  course_title TEXT NOT NULL,
                  recipient TEXT NOT NULL,
                  score INTEGER NOT NULL,
                  total INTEGER NOT NULL,
                  issued_at INTEGER NOT NULL
                );

                CREATE TABLE IF NOT EXISTS classes (
                  id TEXT PRIMARY KEY,
                  instructor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                  join_code TEXT UNIQUE NOT NULL,
                  join_code_expires_at INTEGER,
                  title TEXT NOT NULL,
                  subtitle TEXT NOT NULL DEFAULT '',
                  level TEXT NOT NULL DEFAULT '',
                  data TEXT NOT NULL,
                  lesson_count INTEGER NOT NULL DEFAULT 0,
                  exam_open INTEGER NOT NULL DEFAULT 0,
                  university_id TEXT,
                  created_at INTEGER NOT NULL
                );

                CREATE TABLE IF NOT EXISTS enrollments (
                  class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
                  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                  enrolled_at INTEGER NOT NULL,
                  completed_at INTEGER,
                  exam_score INTEGER,
                  exam_total INTEGER,
                  PRIMARY KEY (class_id, student_id)
                );

                CREATE TABLE IF NOT EXISTS class_progress (
                  class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
                  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                  lesson_key TEXT NOT NULL,
                  updated_at INTEGER NOT NULL,
                  PRIMARY KEY (class_id, student_id, lesson_key)
                );

                CREATE TABLE IF NOT EXISTS assignments (
                  id TEXT PRIMARY KEY,
                  class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
                  title TEXT NOT NULL,
                  instructions TEXT NOT NULL DEFAULT '',
                  rubric TEXT NOT NULL DEFAULT '',
                  points INTEGER NOT NULL DEFAULT 100,
                  due_at INTEGER,
                  created_at INTEGER NOT NULL
                );

                CREATE TABLE IF NOT EXISTS submissions (
                  assignment_id TEXT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
                  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                  text TEXT NOT NULL DEFAULT '',
                  link TEXT NOT NULL DEFAULT '',
                  file_name TEXT,
                  file_data TEXT,
                  submitted_at INTEGER NOT NULL,
                  grade INTEGER,
                  feedback TEXT,
                  graded_at INTEGER,
                  PRIMARY KEY (assignment_id, student_id)
                );

                CREATE TABLE IF NOT EXISTS universities (
                  id TEXT PRIMARY KEY,
                  slug TEXT UNIQUE NOT NULL,
                  name TEXT NOT NULL,
                  logo_url TEXT,
                  admin_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                  created_at INTEGER NOT NULL
                );

                CREATE TABLE IF NOT EXISTS professor_codes (
                  code TEXT PRIMARY KEY,
                  university_id TEXT NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
                  label TEXT NOT NULL DEFAULT '',
                  used_by TEXT REFERENCES users(id) ON DELETE SET NULL,
                  used_at INTEGER,
                  created_at INTEGER NOT NULL
                );
                """
            )
            _initialized = True
        finally:
            conn.close()
