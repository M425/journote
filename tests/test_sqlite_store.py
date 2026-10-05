import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

from store import RelationalSQLiteStore, SQLiteStore


class SQLiteStoreTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.database_path = Path(self.temp_dir.name) / "data" / "journote.sqlite3"

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_crud_and_search_operations(self):
        store = SQLiteStore("notes", self.database_path, "id")
        note = {
            "id": "one",
            "timestamp": 1,
            "date": "2026-10-03",
            "text": "caffè",
            "tags": ["#work"],
            "task": "low",
            "duedate": None,
        }

        store.add(note)
        self.assertEqual(store.find_by_id("one"), note)
        self.assertEqual(store.find_eq("task", "low"), [note])
        self.assertEqual(store.find_in_list("tags", "#work"), [note])
        self.assertEqual(store.find_any("task", ["low", "high"]), [note])
        self.assertEqual(store.patch("one", {"text": "updated"})["text"], "updated")
        self.assertEqual(store.re_id("one", "two")["id"], "two")
        self.assertEqual(store.delete("two")["id"], "two")
        self.assertEqual(store.find_all(), [])
        store.close()

    def test_imports_legacy_json_once(self):
        legacy_path = Path(self.temp_dir.name) / "notes.json"
        legacy_records = [{
            "id": "legacy",
            "timestamp": 1,
            "date": "2026-10-03",
            "text": "legacy #old",
            "tags": ["#old"],
            "task": None,
            "duedate": None,
        }]
        legacy_path.write_text(json.dumps(legacy_records), encoding="utf-8")

        first = SQLiteStore("notes", self.database_path, "id", legacy_path)
        self.assertEqual(first.find_all(), legacy_records)
        first.close()

        legacy_path.write_text("[]", encoding="utf-8")
        second = SQLiteStore("notes", self.database_path, "id", legacy_path)
        self.assertEqual(second.find_all(), legacy_records)
        second.close()

    def test_relational_store_uses_columns_and_note_tag_relation(self):
        tags = RelationalSQLiteStore("tags", self.database_path, "name")
        notes = RelationalSQLiteStore("notes", self.database_path, "id")
        tags.add({"name": "#work", "category": "Projects", "treed": False, "parent": None, "content": ""})
        notes.add({
            "id": "one",
            "timestamp": 1,
            "date": "2026-10-03",
            "text": "note #work",
            "task": None,
            "duedate": None,
            "tags": ["#work"],
        })

        self.assertEqual(notes.find_by_id("one")["tags"], ["#work"])
        self.assertEqual(notes.find_in_list("tags", "#work")[0]["id"], "one")
        with sqlite3.connect(self.database_path) as connection:
            note_columns = {row[1] for row in connection.execute("PRAGMA table_info(notes)")}
            self.assertTrue({"id", "timestamp", "date", "text", "task", "duedate"}.issubset(note_columns))
            self.assertNotIn("payload", note_columns)
            self.assertEqual(
                connection.execute("SELECT note_id, tag_name FROM note_tags").fetchone(),
                ("one", "#work"),
            )
            indexes = {row[1] for row in connection.execute("PRAGMA index_list(note_tags)")}
            self.assertIn("idx_note_tags_tag_note", indexes)
        notes.close()
        tags.close()

    def test_migrates_payload_tables_and_creates_tag_relations(self):
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(self.database_path) as connection:
            connection.execute("CREATE TABLE store_tags (entity_key TEXT PRIMARY KEY, payload TEXT NOT NULL)")
            connection.execute("CREATE TABLE store_notes (entity_key TEXT PRIMARY KEY, payload TEXT NOT NULL)")
            connection.execute(
                "INSERT INTO store_tags VALUES (?, ?)",
                ("#legacy", json.dumps({"name": "#legacy", "category": "Projects", "treed": False, "parent": None, "content": ""})),
            )
            connection.execute(
                "INSERT INTO store_notes VALUES (?, ?)",
                ("legacy-note", json.dumps({
                    "id": "legacy-note",
                    "timestamp": 10,
                    "date": "2026-10-02",
                    "text": "legacy #legacy",
                    "task": None,
                    "duedate": None,
                    "tags": ["#legacy"],
                })),
            )

        tags = RelationalSQLiteStore("tags", self.database_path, "name")
        notes = RelationalSQLiteStore("notes", self.database_path, "id")
        self.assertEqual(notes.find_by_id("legacy-note")["tags"], ["#legacy"])
        with sqlite3.connect(self.database_path) as connection:
            legacy_tables = connection.execute(
                "SELECT name FROM sqlite_master WHERE name IN ('store_notes', 'store_tags')"
            ).fetchall()
            self.assertEqual(legacy_tables, [])
            self.assertEqual(
                connection.execute("SELECT note_id, tag_name FROM note_tags").fetchall(),
                [("legacy-note", "#legacy")],
            )
        notes.close()
        tags.close()


if __name__ == "__main__":
    unittest.main()