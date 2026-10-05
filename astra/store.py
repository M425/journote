import json
import logging
import sqlite3
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional


logger = logging.getLogger(__name__)


class SQLiteStore:
    def __init__(self, name: str, database_path: Path, search_key: str, legacy_path: Optional[Path] = None):
        if name not in {"notes", "tags"}:
            raise ValueError("SQLiteStore supports notes and tags.")
        self._name = name
        self._search_key = search_key
        self.database_path = Path(database_path)
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._connection = sqlite3.connect(self.database_path, check_same_thread=False)
        self._connection.row_factory = sqlite3.Row
        self._connection.execute("PRAGMA foreign_keys = ON")
        self._initialize_schema()
        self._migrate_payload_table()
        self._import_legacy(legacy_path)

    def _initialize_schema(self) -> None:
        with self._lock, self._connection:
            self._connection.executescript(
                "CREATE TABLE IF NOT EXISTS notes ("
                "id TEXT PRIMARY KEY, timestamp INTEGER, date TEXT, "
                "text TEXT NOT NULL DEFAULT '', task TEXT, duedate TEXT);"
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
                "CREATE INDEX IF NOT EXISTS idx_tags_parent ON tags(parent);"
                "CREATE INDEX IF NOT EXISTS idx_note_tags_tag_note ON note_tags(tag_name, note_id);"
                "CREATE INDEX IF NOT EXISTS idx_note_tags_note_position ON note_tags(note_id, position);"
            )

    def _migrate_payload_table(self) -> None:
        legacy_table = f"store_{self._name}"
        exists = self._connection.execute(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
            (legacy_table,),
        ).fetchone()
        if not exists:
            return
        columns = {
            row["name"]
            for row in self._connection.execute(f'PRAGMA table_info("{legacy_table}")')
        }
        if not {"entity_key", "payload"}.issubset(columns):
            return

        records = self._connection.execute(
            f'SELECT entity_key, payload FROM "{legacy_table}" ORDER BY rowid'
        ).fetchall()
        with self._lock, self._connection:
            for row in records:
                if self._record_exists(row["entity_key"]):
                    continue
                self._insert_record(json.loads(row["payload"]))
            self._connection.execute(f'DROP TABLE "{legacy_table}"')
        logger.info("Migrated %d records from %s to relational tables", len(records), legacy_table)

    def _import_legacy(self, legacy_path: Optional[Path]) -> None:
        if not legacy_path or not legacy_path.is_file():
            return
        target_table = self._name
        count = self._connection.execute(f"SELECT COUNT(*) FROM {target_table}").fetchone()[0]
        if count:
            return
        with legacy_path.open("r", encoding="utf-8") as legacy_file:
            records = json.load(legacy_file)
        if not isinstance(records, list):
            raise ValueError(f"Legacy data in {legacy_path} must be a list")
        with self._lock, self._connection:
            for record in records:
                self._insert_record(record)
        logger.info("Imported %d %s records from %s", len(records), self._name, legacy_path)

    def _record_exists(self, key: str) -> bool:
        column = "id" if self._name == "notes" else "name"
        return self._connection.execute(
            f"SELECT 1 FROM {self._name} WHERE {column} = ?", (key,)
        ).fetchone() is not None

    @staticmethod
    def _tag_category(tag: str) -> str:
        return {"#": "Projects", "@": "Persons", ">": "Events", "+": "Generic"}.get(tag[:1], "FullText")

    @staticmethod
    def _as_bool(value: Any) -> int:
        if isinstance(value, str):
            return int(value.strip().lower() in {"1", "true", "yes", "on"})
        return int(bool(value))

    def _insert_record(self, record: Dict[str, Any]) -> None:
        if self._name == "tags":
            self._connection.execute(
                "INSERT INTO tags (name, category, treed, parent, content) VALUES (?, ?, ?, ?, ?)",
                (
                    str(record["name"]),
                    record.get("category") or self._tag_category(str(record["name"])),
                    self._as_bool(record.get("treed", False)),
                    record.get("parent"),
                    record.get("content") or "",
                ),
            )
            return

        self._connection.execute(
            "INSERT INTO notes (id, timestamp, date, text, task, duedate) VALUES (?, ?, ?, ?, ?, ?)",
            (
                str(record["id"]),
                record.get("timestamp"),
                record.get("date"),
                record.get("text") or "",
                record.get("task"),
                record.get("duedate"),
            ),
        )
        for position, tag in enumerate(dict.fromkeys(record.get("tags") or [])):
            self._connection.execute(
                "INSERT OR IGNORE INTO tags (name, category) VALUES (?, ?)",
                (tag, self._tag_category(tag)),
            )
            self._connection.execute(
                "INSERT INTO note_tags (note_id, tag_name, position) VALUES (?, ?, ?)",
                (str(record["id"]), tag, position),
            )

    def _fetch_notes(self, where: str = "", params: tuple = (), order_by: str = "n.rowid") -> List[Dict[str, Any]]:
        rows = self._connection.execute(
            "SELECT n.id, n.timestamp, n.date, n.text, n.task, n.duedate, nt.tag_name "
            "FROM notes AS n LEFT JOIN note_tags AS nt ON nt.note_id = n.id "
            f"{where} ORDER BY {order_by}, nt.position",
            params,
        ).fetchall()
        notes = {}
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
                    "tags": [],
                }
                notes[row["id"]] = note
            if row["tag_name"] is not None:
                note["tags"].append(row["tag_name"])
        return list(notes.values())

    @staticmethod
    def _tag_record(row: sqlite3.Row) -> Dict[str, Any]:
        return {
            "name": row["name"],
            "category": row["category"],
            "treed": bool(row["treed"]),
            "parent": row["parent"],
            "content": row["content"],
        }

    def find_by_id(self, value_to_search: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            if self._name == "notes":
                notes = self._fetch_notes("WHERE n.id = ?", (value_to_search,))
                return notes[0] if notes else None
            record = self._connection.execute(
                "SELECT name, category, treed, parent, content FROM tags WHERE name = ?",
                (value_to_search,),
            ).fetchone()
            return self._tag_record(record) if record else None

    def find_eq(self, key_to_search: str, value_to_search: Any) -> List[Dict[str, Any]]:
        with self._lock:
            if self._name == "notes":
                if key_to_search == "tags":
                    return self.find_in_list("tags", value_to_search)
                if key_to_search not in {"id", "timestamp", "date", "text", "task", "duedate"}:
                    return []
                return self._fetch_notes(f"WHERE n.{key_to_search} = ?", (value_to_search,))
            if key_to_search not in {"name", "category", "treed", "parent", "content"}:
                return []
            value = self._as_bool(value_to_search) if key_to_search == "treed" else value_to_search
            rows = self._connection.execute(
                f"SELECT name, category, treed, parent, content FROM tags WHERE {key_to_search} = ? ORDER BY rowid",
                (value,),
            ).fetchall()
            return [self._tag_record(row) for row in rows]

    def find_in_list(self, key_to_search: str, value_to_search: Any) -> List[Dict[str, Any]]:
        if self._name != "notes" or key_to_search != "tags":
            return []
        with self._lock:
            return self._fetch_notes(
                "WHERE EXISTS (SELECT 1 FROM note_tags AS filter_tags "
                "WHERE filter_tags.note_id = n.id AND filter_tags.tag_name = ?)",
                (value_to_search,),
            )

    def find_any(self, key_to_search: str, values_to_search: List[Any]) -> List[Dict[str, Any]]:
        if self._name != "notes" or key_to_search not in {"id", "timestamp", "date", "text", "task", "duedate"} or not values_to_search:
            return []
        placeholders = ", ".join("?" for _ in values_to_search)
        with self._lock:
            return self._fetch_notes(f"WHERE n.{key_to_search} IN ({placeholders})", tuple(values_to_search))

    def find_by_tag_expression(self, expression: tuple) -> List[Dict[str, Any]]:
        def compile_node(node):
            operator = node[0]
            if operator == "tag":
                return (
                    "EXISTS (SELECT 1 FROM note_tags AS filter_tags "
                    "WHERE filter_tags.note_id = n.id AND filter_tags.tag_name = ?)",
                    [node[1]],
                )
            if operator == "not":
                clause, params = compile_node(node[1])
                return f"NOT ({clause})", params
            if operator in {"and", "or"}:
                left, left_params = compile_node(node[1])
                right, right_params = compile_node(node[2])
                return f"({left} {operator.upper()} {right})", left_params + right_params
            raise ValueError(f"Unknown filter operator: {operator}")

        clause, params = compile_node(expression)
        with self._lock:
            return self._fetch_notes(f"WHERE {clause}", tuple(params), "n.date, n.timestamp")

    def find_all(self) -> List[Dict[str, Any]]:
        with self._lock:
            if self._name == "notes":
                return self._fetch_notes()
            rows = self._connection.execute(
                "SELECT name, category, treed, parent, content FROM tags ORDER BY rowid"
            ).fetchall()
            return [self._tag_record(row) for row in rows]

    def count_by_date_range(self, start_date: str, end_date: str) -> Dict[str, int]:
        if self._name != "notes":
            return {}
        with self._lock:
            rows = self._connection.execute(
                "SELECT date, COUNT(*) AS note_count FROM notes "
                "WHERE date >= ? AND date <= ? GROUP BY date",
                (start_date, end_date),
            ).fetchall()
            return {row["date"]: row["note_count"] for row in rows}

    def add(self, obj: Dict[str, Any]) -> Dict[str, Any]:
        with self._lock, self._connection:
            self._insert_record(obj)
        return dict(obj)

    def delete(self, key: str) -> Dict[str, Any]:
        with self._lock, self._connection:
            record = self.find_by_id(key)
            if record is None:
                raise KeyError("Object not found.")
            column = "id" if self._name == "notes" else "name"
            self._connection.execute(f"DELETE FROM {self._name} WHERE {column} = ?", (key,))
            return record

    def patch(self, key: str, obj: Dict[str, Any]) -> Dict[str, Any]:
        with self._lock, self._connection:
            current = self.find_by_id(key)
            if current is None:
                raise KeyError("Object not found.")
            current.update({field: value for field, value in obj.items() if field != self._search_key})
            if self._name == "notes":
                fields = ("timestamp", "date", "text", "task", "duedate")
                self._connection.execute(
                    "UPDATE notes SET timestamp = ?, date = ?, text = ?, task = ?, duedate = ? WHERE id = ?",
                    tuple(current.get(field) for field in fields) + (key,),
                )
                if "tags" in obj:
                    self._connection.execute("DELETE FROM note_tags WHERE note_id = ?", (key,))
                    for position, tag in enumerate(dict.fromkeys(current.get("tags") or [])):
                        self._connection.execute(
                            "INSERT OR IGNORE INTO tags (name, category) VALUES (?, ?)",
                            (tag, self._tag_category(tag)),
                        )
                        self._connection.execute(
                            "INSERT INTO note_tags (note_id, tag_name, position) VALUES (?, ?, ?)",
                            (key, tag, position),
                        )
            else:
                self._connection.execute(
                    "UPDATE tags SET category = ?, treed = ?, parent = ?, content = ? WHERE name = ?",
                    (
                        current.get("category") or self._tag_category(key),
                        self._as_bool(current.get("treed", False)),
                        current.get("parent"),
                        current.get("content") or "",
                        key,
                    ),
                )
            return self.find_by_id(key) or current

    def get_tag_properties(self, tag_name: str) -> List[Dict[str, Any]]:
        """Get all properties for a specific tag."""
        with self._lock:
            rows = self._connection.execute(
                "SELECT key, value FROM tag_properties WHERE tag_name = ? ORDER BY key",
                (tag_name,)
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
                (tag_name, self._tag_category(tag_name)),
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
        """Delete a property for a specific tag."""
        with self._lock, self._connection:
            self._connection.execute(
                "DELETE FROM tag_properties WHERE tag_name = ? AND key = ?",
                (tag_name, key)
            )

    def get_tag_property_count(self, tag_name: str) -> int:
        """Get the count of properties for a specific tag."""
        with self._lock, self._connection:
            row = self._connection.execute(
                "SELECT COUNT(*) as count FROM tag_properties WHERE tag_name = ?",
                (tag_name,)
            ).fetchone()
            return row["count"] if row else 0

    def re_id(self, old_key: str, new_key: str) -> Dict[str, Any]:
        with self._lock, self._connection:
            current = self.find_by_id(old_key)
            if current is None:
                raise KeyError("Object not found.")
            column = "id" if self._name == "notes" else "name"
            self._connection.execute(
                f"UPDATE {self._name} SET {column} = ? WHERE {column} = ?",
                (new_key, old_key),
            )
            current[self._search_key] = new_key
            return current

    def close(self) -> None:
        with self._lock:
            self._connection.close()


RelationalSQLiteStore = SQLiteStore