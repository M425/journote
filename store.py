"""Lean SQLite persistence for notes, tags and tag properties.

The store is deliberately thin: callers write their own WHERE clauses and
pass them to ``select_notes`` / ``select_tags`` together with optional
query parameters and a limit.
"""
import sqlite3
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

TAG_CATEGORIES = {"#": "Projects", "@": "Persons", ">": "Events", "+": "Generic"}


def tag_category(tag: str) -> str:
    return TAG_CATEGORIES.get(tag[:1], "FullText")


def _as_bool(value: Any) -> bool:
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return bool(value)


class Store:
    def __init__(self, database_path: Path):
        self.database_path = Path(database_path)
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._connection = sqlite3.connect(self.database_path, check_same_thread=False)
        self._connection.row_factory = sqlite3.Row
        self._connection.execute("PRAGMA foreign_keys = ON")
        self._create_schema()

    def _create_schema(self) -> None:
        with self._lock, self._connection:
            self._connection.executescript(
                "CREATE TABLE IF NOT EXISTS notes ("
                "id TEXT PRIMARY KEY, timestamp INTEGER, date TEXT, "
                "text TEXT NOT NULL DEFAULT '', task TEXT, duedate TEXT, "
                "reply TEXT, replied_to TEXT, "
                "FOREIGN KEY (reply) REFERENCES notes(id) ON UPDATE CASCADE ON DELETE SET NULL, "
                "FOREIGN KEY (replied_to) REFERENCES notes(id) ON UPDATE CASCADE ON DELETE SET NULL);"
                "CREATE TABLE IF NOT EXISTS tags ("
                "name TEXT PRIMARY KEY, category TEXT NOT NULL DEFAULT 'Generic', "
                "treed INTEGER NOT NULL DEFAULT 0, parent TEXT, content TEXT NOT NULL DEFAULT '');"
                "CREATE TABLE IF NOT EXISTS tag_properties ("
                "tag_name TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, "
                "PRIMARY KEY (tag_name, key), "
                "FOREIGN KEY (tag_name) REFERENCES tags(name) ON UPDATE CASCADE ON DELETE CASCADE);"
                "CREATE TABLE IF NOT EXISTS note_tags ("
                "note_id TEXT NOT NULL, tag_name TEXT NOT NULL, position INTEGER NOT NULL, "
                "PRIMARY KEY (note_id, tag_name), "
                "FOREIGN KEY (note_id) REFERENCES notes(id) ON UPDATE CASCADE ON DELETE CASCADE, "
                "FOREIGN KEY (tag_name) REFERENCES tags(name) ON UPDATE CASCADE ON DELETE CASCADE);"
                "CREATE INDEX IF NOT EXISTS idx_notes_date ON notes(date);"
                "CREATE INDEX IF NOT EXISTS idx_notes_task ON notes(task);"
                "CREATE INDEX IF NOT EXISTS idx_notes_duedate ON notes(duedate);"
                "CREATE INDEX IF NOT EXISTS idx_notes_reply ON notes(reply);"
                "CREATE INDEX IF NOT EXISTS idx_notes_replied_to ON notes(replied_to);"
                "CREATE INDEX IF NOT EXISTS idx_notes_reply ON notes(reply);"
                "CREATE INDEX IF NOT EXISTS idx_notes_replied_to ON notes(replied_to);"
                "CREATE INDEX IF NOT EXISTS idx_tags_parent ON tags(parent);"
                "CREATE INDEX IF NOT EXISTS idx_note_tags_tag_note ON note_tags(tag_name, note_id);"
                "CREATE INDEX IF NOT EXISTS idx_note_tags_note_position ON note_tags(note_id, position);"
            )
            # Migration: add reply / replied_to columns to pre-existing notes tables.
            existing_columns = {
                row["name"]
                for row in self._connection.execute("PRAGMA table_info(notes)").fetchall()
            }
            for column in ("reply", "replied_to"):
                if column not in existing_columns:
                    self._connection.execute(f"ALTER TABLE notes ADD COLUMN {column} TEXT")
            # Migration: shrink note ids to the last 12 characters of the uuid.
            # Rebuild the notes table (SQLite cannot alter column types in place)
            # and remap references in note_tags and reply/replied_to columns.
            id_lengths = {
                row["length"]
                for row in self._connection.execute(
                    "SELECT DISTINCT length(id) AS length FROM notes"
                ).fetchall()
            }
            if id_lengths - {12}:
                self._connection.execute("PRAGMA foreign_keys = OFF")
                self._connection.executescript(
                    "CREATE TABLE notes_new ("
                    "id TEXT PRIMARY KEY, timestamp INTEGER, date TEXT, "
                    "text TEXT NOT NULL DEFAULT '', task TEXT, duedate TEXT, "
                    "reply TEXT, replied_to TEXT, "
                    "FOREIGN KEY (reply) REFERENCES notes(id) ON UPDATE CASCADE ON DELETE SET NULL, "
                    "FOREIGN KEY (replied_to) REFERENCES notes(id) ON UPDATE CASCADE ON DELETE SET NULL);"
                    "INSERT INTO notes_new (id, timestamp, date, text, task, duedate, reply, replied_to) "
                    "SELECT substr(id, -12), timestamp, date, text, task, duedate, "
                    "CASE WHEN reply IS NULL THEN NULL ELSE substr(reply, -12) END, "
                    "CASE WHEN replied_to IS NULL THEN NULL ELSE substr(replied_to, -12) END "
                    "FROM notes GROUP BY substr(id, -12);"
                    "UPDATE note_tags SET note_id = substr(note_id, -12);"
                    "DROP TABLE notes;"
                    "ALTER TABLE notes_new RENAME TO notes;"
                    "CREATE INDEX IF NOT EXISTS idx_notes_date ON notes(date);"
                    "CREATE INDEX IF NOT EXISTS idx_notes_task ON notes(task);"
                    "CREATE INDEX IF NOT EXISTS idx_notes_duedate ON notes(duedate);"
                    "CREATE INDEX IF NOT EXISTS idx_notes_reply ON notes(reply);"
                    "CREATE INDEX IF NOT EXISTS idx_notes_replied_to ON notes(replied_to);"
                )
                self._connection.execute("PRAGMA foreign_keys = ON")

    # ------------------------------------------------------------------ notes

    def select_notes(self, where: str = "", params: Tuple[Any, ...] = (), limit: Optional[int] = None,
                     order_by: str = "n.date, n.timestamp") -> List[Dict[str, Any]]:
        """Select notes. ``where`` is a raw SQL clause on ``notes AS n``,
        e.g. ``"date = ?"`` or ``"task IN ('low', 'mid', 'high')"``."""
        sql = (
            "SELECT n.id, n.timestamp, n.date, n.text, n.task, n.duedate, n.reply, n.replied_to, nt.tag_name "
            "FROM notes AS n LEFT JOIN note_tags AS nt ON nt.note_id = n.id"
        )
        if where:
            sql += f" WHERE {where}"
        sql += f" ORDER BY {order_by}, nt.position"
        if limit is not None:
            sql += f" LIMIT {int(limit)}"
        with self._lock:
            rows = self._connection.execute(sql, params).fetchall()
        notes: Dict[str, Dict[str, Any]] = {}
        for row in rows:
            note = notes.get(row["id"])
            if note is None:
                note = {
                    "id": row["id"],
                    "timestamp": row["timestamp"],
                    "date": row["date"],
                    "text": row["text"],
                    "task": row["task"],
                    "duedate": row["duedate"],
                    "reply": row["reply"],
                    "replied_to": row["replied_to"],
                    "tags": [],
                }
                notes[row["id"]] = note
            if row["tag_name"] is not None:
                note["tags"].append(row["tag_name"])
        return list(notes.values())

    def get_note(self, note_id: str) -> Optional[Dict[str, Any]]:
        notes = self.select_notes("n.id = ?", (note_id,))
        return notes[0] if notes else None

    def add_note(self, note: Dict[str, Any]) -> Dict[str, Any]:
        with self._lock, self._connection:
            self._connection.execute(
                "INSERT INTO notes (id, timestamp, date, text, task, duedate, reply, replied_to) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    str(note["id"]),
                    note.get("timestamp"),
                    note.get("date"),
                    note.get("text") or "",
                    note.get("task"),
                    note.get("duedate"),
                    note.get("reply"),
                    note.get("replied_to"),
                ),
            )
            self._attach_tags(str(note["id"]), note.get("tags") or [])
        return dict(note)

    def patch_note(self, note_id: str, changes: Dict[str, Any]) -> Dict[str, Any]:
        with self._lock, self._connection:
            current = self.get_note(note_id)
            if current is None:
                raise KeyError("Note not found.")
            current.update({field: value for field, value in changes.items() if field != "id"})
            self._connection.execute(
                "UPDATE notes SET timestamp = ?, date = ?, text = ?, task = ?, duedate = ?, "
                "reply = ?, replied_to = ? WHERE id = ?",
                tuple(current.get(field) for field in ("timestamp", "date", "text", "task", "duedate", "reply", "replied_to")) + (note_id,),
            )
            if "tags" in changes:
                self._connection.execute("DELETE FROM note_tags WHERE note_id = ?", (note_id,))
                self._attach_tags(note_id, current.get("tags") or [])
        return self.get_note(note_id) or current

    def delete_note(self, note_id: str) -> Dict[str, Any]:
        with self._lock, self._connection:
            note = self.get_note(note_id)
            if note is None:
                raise KeyError("Note not found.")
            self._connection.execute("DELETE FROM notes WHERE id = ?", (note_id,))
            return note

    def count_notes_by_date(self, start_date: str, end_date: str) -> Dict[str, int]:
        with self._lock:
            rows = self._connection.execute(
                "SELECT date, COUNT(*) AS note_count FROM notes "
                "WHERE date >= ? AND date <= ? GROUP BY date",
                (start_date, end_date),
            ).fetchall()
            return {row["date"]: row["note_count"] for row in rows}

    def _attach_tags(self, note_id: str, tags: List[str]) -> None:
        for position, tag in enumerate(dict.fromkeys(tags)):
            self._connection.execute(
                "INSERT OR IGNORE INTO tags (name, category) VALUES (?, ?)",
                (tag, tag_category(tag)),
            )
            self._connection.execute(
                "INSERT INTO note_tags (note_id, tag_name, position) VALUES (?, ?, ?)",
                (note_id, tag, position),
            )

    # ------------------------------------------------------------------- tags

    def select_tags(self, where: str = "", params: Tuple[Any, ...] = (), limit: Optional[int] = None) -> List[Dict[str, Any]]:
        """Select tags. ``where`` is a raw SQL clause on ``tags``, e.g. ``"parent = ?"``."""
        sql = "SELECT name, category, treed, parent, content FROM tags"
        if where:
            sql += f" WHERE {where}"
        sql += " ORDER BY rowid"
        if limit is not None:
            sql += f" LIMIT {int(limit)}"
        with self._lock:
            rows = self._connection.execute(sql, params).fetchall()
        return [{**dict(row), "treed": bool(row["treed"])} for row in rows]

    def get_tag(self, name: str) -> Optional[Dict[str, Any]]:
        tags = self.select_tags("name = ?", (name,))
        return tags[0] if tags else None

    def add_tag(self, tag: Dict[str, Any]) -> Dict[str, Any]:
        record = {
            "name": str(tag["name"]),
            "category": tag.get("category") or tag_category(str(tag["name"])),
            "treed": _as_bool(tag.get("treed", False)),
            "parent": tag.get("parent"),
            "content": tag.get("content") or "",
        }
        with self._lock, self._connection:
            self._connection.execute(
                "INSERT INTO tags (name, category, treed, parent, content) VALUES (?, ?, ?, ?, ?)",
                (record["name"], record["category"], int(record["treed"]), record["parent"], record["content"]),
            )
        return record

    def patch_tag(self, name: str, changes: Dict[str, Any]) -> Dict[str, Any]:
        with self._lock, self._connection:
            current = self.get_tag(name)
            if current is None:
                raise KeyError("Tag not found.")
            fields = {key: current[key] for key in ("category", "treed", "parent", "content")}
            if "category" in changes:
                fields["category"] = changes["category"]
            if "treed" in changes:
                fields["treed"] = _as_bool(changes["treed"])
            if "parent" in changes:
                fields["parent"] = changes["parent"]
            if "content" in changes:
                fields["content"] = changes["content"]
            self._connection.execute(
                "UPDATE tags SET category = ?, treed = ?, parent = ?, content = ? WHERE name = ?",
                (fields["category"], int(fields["treed"]), fields["parent"], fields["content"], name),
            )
        return self.get_tag(name) or current

    def delete_tag(self, name: str) -> Dict[str, Any]:
        with self._lock, self._connection:
            tag = self.get_tag(name)
            if tag is None:
                raise KeyError("Tag not found.")
            self._connection.execute("DELETE FROM tags WHERE name = ?", (name,))
            return tag

    def rename_tag(self, old_name: str, new_name: str) -> Dict[str, Any]:
        with self._lock, self._connection:
            if self.get_tag(old_name) is None:
                raise KeyError("Tag not found.")
            self._connection.execute("UPDATE tags SET name = ? WHERE name = ?", (new_name, old_name))
            self._connection.execute("UPDATE note_tags SET tag_name = ? WHERE tag_name = ?", (new_name, old_name))
        return self.get_tag(new_name)

    # ---------------------------------------------------------- tag properties

    def get_tag_properties(self, tag_name: str) -> List[Dict[str, Any]]:
        with self._lock:
            rows = self._connection.execute(
                "SELECT key, value FROM tag_properties WHERE tag_name = ? ORDER BY key",
                (tag_name,),
            ).fetchall()
            return [{"key": row["key"], "value": row["value"]} for row in rows]

    def set_tag_properties(self, tag_name: str, properties, replace: bool = True) -> None:
        """Validate first, then create the tag and write properties in one transaction."""
        if not isinstance(properties, list):
            raise ValueError("properties must be an array of {key, value} objects")
        normalized = []
        seen = set()
        for prop in properties:
            if not isinstance(prop, dict) or not isinstance(prop.get("key"), str) or not isinstance(prop.get("value"), str):
                raise ValueError("Each property requires a string key and a string value")
            key = prop["key"].strip()
            if not key or any(char in key for char in "[]\r\n"):
                raise ValueError("Property keys must be non-empty and cannot contain brackets or newlines")
            if key in seen:
                raise ValueError("Duplicate property key: " + key)
            seen.add(key)
            normalized.append((tag_name, key, prop["value"]))
        with self._lock, self._connection:
            self._connection.execute(
                "INSERT OR IGNORE INTO tags (name, category) VALUES (?, ?)",
                (tag_name, tag_category(tag_name)),
            )
            if replace:
                self._connection.execute("DELETE FROM tag_properties WHERE tag_name = ?", (tag_name,))
            self._connection.executemany(
                "INSERT INTO tag_properties (tag_name, key, value) VALUES (?, ?, ?) "
                "ON CONFLICT(tag_name, key) DO UPDATE SET value = excluded.value", normalized,
            )

    def set_tag_property(self, tag_name: str, key: str, value: str) -> None:
        self.set_tag_properties(tag_name, [{"key": key, "value": value}], replace=False)

    def delete_tag_property(self, tag_name: str, key: str) -> None:
        with self._lock, self._connection:
            self._connection.execute(
                "DELETE FROM tag_properties WHERE tag_name = ? AND key = ?",
                (tag_name, key),
            )

    def close(self) -> None:
        with self._lock:
            self._connection.close()
