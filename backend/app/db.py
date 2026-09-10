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
    display_order INTEGER DEFAULT 0,
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

CREATE TABLE IF NOT EXISTS camera_stream_state (
    camera_id      INTEGER PRIMARY KEY,
    live_since     INTEGER DEFAULT 0,
    last_cut_at    INTEGER DEFAULT 0,
    prev_bytes     INTEGER DEFAULT 0,
    stall          INTEGER DEFAULT 0,
    was_streaming  INTEGER DEFAULT 0,
    updated_at     TEXT DEFAULT (datetime('now'))
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
    _migrate()
    _seed_defaults()


def _migrate() -> None:
    """Migraciones incrementales seguras (ALTER TABLE IF)."""
    with get_db() as db:
        cols = {r[1] for r in db.execute("PRAGMA table_info(cameras)").fetchall()}
        if "display_order" not in cols:
            db.execute("ALTER TABLE cameras ADD COLUMN display_order INTEGER DEFAULT 0")
            # Solo inicializar display_order cuando se añade la columna por primera vez
            rows = db.execute("SELECT id FROM cameras ORDER BY id").fetchall()
            for i, r in enumerate(rows):
                db.execute("UPDATE cameras SET display_order=? WHERE id=?", (i, r["id"]))


def _seed_defaults() -> None:
    with get_db() as db:
        cur = db.execute("SELECT COUNT(*) FROM settings")
        if cur.fetchone()[0] == 0:
            db.execute("INSERT INTO settings (key, value) VALUES ('skin', 'dark')")
            db.execute("INSERT INTO settings (key, value) VALUES ('accent', '#22d3ee')")
            db.execute("INSERT INTO settings (key, value) VALUES ('grid_cols', '2')")
