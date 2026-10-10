import tempfile
import unittest
from pathlib import Path

from store import Store


class StoreTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.database_path = Path(self.temp_dir.name) / "data" / "journote.sqlite3"

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_note_crud_and_select(self):
        store = Store(self.database_path)
        note = {
            "id": "one",
            "timestamp": 1,
            "date": "2026-10-03",
            "text": "caffè #work",
            "tags": ["#work"],
            "task": "low",
            "duedate": None,
            "reply": None,
            "replied_to": None,
        }

        store.add_note(note)
        self.assertEqual(store.get_note("one"), note)
        self.assertEqual(store.select_notes("task = ?", ("low",)), [note])
        self.assertEqual(store.select_notes(
            "EXISTS (SELECT 1 FROM note_tags AS filter_tags "
            "WHERE filter_tags.note_id = n.id AND filter_tags.tag_name = ?)", ("#work",),
        ), [note])
        self.assertEqual(store.select_notes("task IN ('low', 'high')"), [note])
        self.assertEqual(store.select_notes("date = ?", ("2026-10-03",)), [note])
        self.assertEqual(store.select_notes(limit=0), [])
        self.assertEqual(store.patch_note("one", {"text": "updated"})["text"], "updated")
        self.assertEqual(store.get_note("one")["text"], "updated")
        self.assertEqual(store.delete_note("one")["id"], "one")
        self.assertEqual(store.select_notes(), [])
        store.close()

    def test_select_notes_orders_and_aggregates_tags(self):
        store = Store(self.database_path)
        store.add_note({"id": "a", "timestamp": 1, "date": "2026-10-02", "text": "a", "tags": ["#x", "#y"]})
        store.add_note({"id": "b", "timestamp": 1, "date": "2026-10-01", "text": "b", "tags": []})

        notes = store.select_notes()
        self.assertEqual([note["id"] for note in notes], ["b", "a"])
        self.assertEqual(notes[1]["tags"], ["#x", "#y"])
        self.assertEqual(store.select_notes(
            "EXISTS (SELECT 1 FROM note_tags AS filter_tags "
            "WHERE filter_tags.note_id = n.id AND filter_tags.tag_name = ?)", ("#y",),
        )[0]["id"], "a")
        store.close()

    def test_tag_crud_rename_and_properties(self):
        store = Store(self.database_path)
        store.add_tag({"name": "#work", "category": "Projects", "treed": False, "parent": None, "content": ""})
        self.assertEqual(store.get_tag("#work")["category"], "Projects")
        self.assertEqual(store.select_tags("parent IS NULL")[0]["name"], "#work")
        self.assertEqual(store.select_tags("parent = ?", ("#missing",)), [])

        store.patch_tag("#work", {"treed": "true", "parent": "#root"})
        self.assertEqual(store.get_tag("#work")["treed"], True)
        self.assertEqual(store.get_tag("#work")["parent"], "#root")

        renamed = store.rename_tag("#work", "#job")
        self.assertEqual(renamed["name"], "#job")
        self.assertIsNone(store.get_tag("#work"))

        store.set_tag_property("#job", "url", "https://example.com")
        self.assertEqual(store.get_tag_properties("#job"), [{"key": "url", "value": "https://example.com"}])
        store.delete_tag_property("#job", "url")
        self.assertEqual(store.get_tag_properties("#job"), [])

        self.assertEqual(store.delete_tag("#job")["name"], "#job")
        self.assertEqual(store.select_tags(), [])
        store.close()

    def test_add_note_creates_tags_and_relations(self):
        store = Store(self.database_path)
        store.add_note({"id": "one", "timestamp": 1, "date": "2026-10-03", "text": "x", "tags": ["#work", "@sam"]})
        self.assertEqual({tag["name"] for tag in store.select_tags()}, {"#work", "@sam"})
        self.assertEqual(store.get_tag("#work")["category"], "Projects")
        self.assertEqual(store.get_tag("@sam")["category"], "Persons")
        self.assertEqual(store.get_note("one")["tags"], ["#work", "@sam"])

        store.patch_note("one", {"tags": ["#work"]})
        self.assertEqual(store.get_note("one")["tags"], ["#work"])
        self.assertEqual(store.count_notes_by_date("2026-10-01", "2026-10-30"), {"2026-10-03": 1})
        store.close()

    def test_missing_records_raise_key_error(self):
        store = Store(self.database_path)
        with self.assertRaises(KeyError):
            store.delete_note("missing")
        with self.assertRaises(KeyError):
            store.patch_note("missing", {"text": "x"})
        with self.assertRaises(KeyError):
            store.delete_tag("#missing")
        with self.assertRaises(KeyError):
            store.patch_tag("#missing", {"content": "x"})
        with self.assertRaises(KeyError):
            store.rename_tag("#missing", "#other")
        self.assertIsNone(store.get_note("missing"))
        self.assertIsNone(store.get_tag("#missing"))
        store.close()


if __name__ == "__main__":
    unittest.main()
