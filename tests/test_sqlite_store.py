import json
import tempfile
import unittest
from pathlib import Path

from store import SQLiteStore


class SQLiteStoreTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.database_path = Path(self.temp_dir.name) / "data" / "journote.sqlite3"

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_crud_and_search_operations(self):
        store = SQLiteStore("notes", self.database_path, "id")
        note = {"id": "one", "text": "caffè", "tags": ["#work"], "task": "low"}

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
        legacy_records = [{"id": "legacy", "tags": ["#old"]}]
        legacy_path.write_text(json.dumps(legacy_records), encoding="utf-8")

        first = SQLiteStore("notes", self.database_path, "id", legacy_path)
        self.assertEqual(first.find_all(), legacy_records)
        first.close()

        legacy_path.write_text("[]", encoding="utf-8")
        second = SQLiteStore("notes", self.database_path, "id", legacy_path)
        self.assertEqual(second.find_all(), legacy_records)
        second.close()


if __name__ == "__main__":
    unittest.main()