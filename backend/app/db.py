"""Capa de persistencia SQLite (stdlib)."""
from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from typing import Iterator

from .config import DB_PATH

SCHEMA = """
CREATE TABLE IF NOT EXISTS cameras (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    location    TEXT DEFAULT '',
    ip          TEXT NOT NULL,
    mac         TEXT DEFAULT '',
    model       TEXT DEFAULT '',
    sn          TEXT DEFAULT '',
    username    TEXT DEFAULT '',          -- cifrado
    password    TEXT DEFAULT '',          -- cifrado
    main_stream TEXT DEFAULT '',
    sub_stream  TEXT DEFAULT '',
    snapshot    TEXT DEFAULT '',
    has_ptz     INTEGER DEFAULT 1,
    enabled     INTEGER DEFAULT 1,
    notes       TEXT DEFAULT '',
    created_at  TEXT DEFAULT (datetime('now')),
    updated_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
    key        TEXT PRIMARY KEY,
    value      TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    camera_id  INTEGER,
    ts         TEXT DEFAULT (datetime('now')),
    type       TEXT,
    payload    TEXT
);
"""


@contextmanager
def get_db() -> Iterator[sqlite3.Connection]:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    with get_db() as db:
        db.executescript(SCHEMA)
    _seed_defaults()


def _seed_defaults() -> None:
    with get_db() as db:
        cur = db.execute("SELECT COUNT(*) FROM settings")
        if cur.fetchone()[0] == 0:
            db.execute("INSERT INTO settings (key, value) VALUES ('skin', 'dark')")
            db.execute("INSERT INTO settings (key, value) VALUES ('accent', '#22d3ee')")
            db.execute("INSERT INTO settings (key, value) VALUES ('grid_cols', '2')")
