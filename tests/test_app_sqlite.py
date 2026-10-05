import os
import tempfile
import unittest
from io import BytesIO


_data_directory = tempfile.TemporaryDirectory()
os.environ["JOURNOTE_DATA_DIR"] = _data_directory.name

from app import DATABASE_PATH, STORE_NOTES, STORE_TAGS, app


def tearDownModule():
    for store in (STORE_NOTES, STORE_TAGS):
        store.close()
    _data_directory.cleanup()


class SQLiteApiTests(unittest.TestCase):
    def setUp(self):
        for store in (STORE_NOTES, STORE_TAGS):
            for record in store.find_all():
                key = record["id"] if "id" in record else record["name"]
                store.delete(key)
        self.client = app.test_client()

    def test_tag_aggregation_works_without_authentication(self):
        created = self.client.post("/api/notes", json={
            "text": "quick note #work",
            "date": "2026-10-02",
        })
        self.assertEqual(created.status_code, 201)
        with_person = self.client.post("/api/notes", json={
            "text": "team note #work @sam",
            "date": "2026-10-02",
        })
        self.assertEqual(with_person.status_code, 201)

        aggregate = self.client.get("/api/notes/Projects/work")
        self.assertEqual(aggregate.status_code, 200)
        self.assertEqual(len(aggregate.json), 2)
        filtered = self.client.post("/api/notes/filter", json={"rule": "#work e !@sam"})
        self.assertEqual(filtered.status_code, 200)
        self.assertEqual([note["text"] for note in filtered.json], ["quick note #work"])
        or_filtered = self.client.post("/api/notes/filter", json={"rule": "#work o @sam"})
        self.assertEqual(or_filtered.status_code, 200)
        self.assertEqual(len(or_filtered.json), 2)
        invalid_filter = self.client.post("/api/notes/filter", json={"rule": "#work e"})
        self.assertEqual(invalid_filter.status_code, 400)
        tags = self.client.get("/api/tags")
        self.assertEqual(tags.status_code, 200)
        self.assertTrue({"#work", "@sam"}.issubset({tag["name"] for tag in tags.json}))

        orphaned_tag_note = self.client.post("/api/notes", json={
            "text": "one-off #delete-me",
            "date": "2026-10-02",
        })
        deleted = self.client.delete(f"/api/notes/{orphaned_tag_note.json['note']['id']}")
        self.assertEqual(deleted.status_code, 200)
        self.assertIn("#delete-me", deleted.json["removed_tags"])
        self.assertTrue(DATABASE_PATH.is_file())

    def test_explorer_lists_tables_and_rejects_write_queries(self):
        created = self.client.post("/api/notes", json={
            "text": "explorer note #read-only",
            "date": "2026-10-03",
        })
        self.assertEqual(created.status_code, 201)

        tables = self.client.get("/api/explorer/tables")
        self.assertEqual(tables.status_code, 200)
        self.assertEqual(tables.json, ["note_tags", "notes", "tags"])

        selected = self.client.post("/api/explorer/query", json={
            "query": "SELECT n.id, n.text, t.name FROM notes n "
                     "JOIN note_tags nt ON nt.note_id = n.id "
                     "JOIN tags t ON t.name = nt.tag_name",
        })
        self.assertEqual(selected.status_code, 200)
        self.assertEqual(selected.json["columns"], ["id", "text", "name"])
        self.assertEqual(len(selected.json["rows"]), 1)
        self.assertEqual(selected.json["rows"][0][1:], ["explorer note #read-only", "#read-only"])

        deleted = self.client.post("/api/explorer/query", json={
            "query": "DELETE FROM notes",
        })
        self.assertEqual(deleted.status_code, 400)
        self.assertEqual(len(STORE_NOTES.find_all()), 1)

    def test_renaming_tag_updates_note_text_and_relation(self):
        created = self.client.post("/api/notes", json={
            "text": "rename this #old-name",
            "date": "2026-10-03",
        })
        note_id = created.json["note"]["id"]

        renamed = self.client.patch("/api/tags/Projects/old-name", json={
            "treed": "false",
            "parent": "",
            "content": "",
            "rename": "#new-name",
        })
        self.assertEqual(renamed.status_code, 200)
        note = STORE_NOTES.find_by_id(note_id)
        self.assertIn("#new-name", note["text"])
        self.assertEqual(note["tags"], ["#new-name"])
        self.assertEqual(STORE_NOTES.find_in_list("tags", "#old-name"), [])
        self.assertEqual(STORE_TAGS.find_by_id("#new-name")["treed"], False)

    def test_clipboard_image_upload_and_retrieval(self):
        image_bytes = b"\x89PNG\r\n\x1a\nclipboard-image-test"
        uploaded = self.client.post("/api/images", data={
            "image": (BytesIO(image_bytes), "clipboard.png", "image/png"),
        })
        self.assertEqual(uploaded.status_code, 201)
        self.assertRegex(uploaded.json["id"], r"^[0-9a-f]{12}$")
        self.assertEqual(uploaded.json["markdown"], f"![Immagine]({uploaded.json['url']})")
        image_path = DATABASE_PATH.parent / "img" / f"{uploaded.json['id']}.png"
        self.assertTrue(image_path.is_file())

        retrieved = self.client.get(uploaded.json["url"])
        try:
            self.assertEqual(retrieved.status_code, 200)
            self.assertEqual(retrieved.mimetype, "image/png")
            self.assertEqual(retrieved.data, image_bytes)
        finally:
            retrieved.close()

        legacy_id = "00000000-0000-4000-8000-000000000001"
        legacy_path = image_path.parent / f"{legacy_id}.png"
        legacy_path.write_bytes(image_bytes)
        legacy = self.client.get(f"/api/images/{legacy_id}")
        try:
            self.assertEqual(legacy.status_code, 200)
            self.assertEqual(legacy.data, image_bytes)
        finally:
            legacy.close()

        invalid = self.client.post("/api/images", data={
            "image": (BytesIO(b"not an image"), "clipboard.png", "image/png"),
        })
        self.assertEqual(invalid.status_code, 400)
        unsupported = self.client.post("/api/images", data={
            "image": (BytesIO(b"data"), "clipboard.txt", "text/plain"),
        })
        self.assertEqual(unsupported.status_code, 415)
        self.assertEqual(self.client.get("/api/images/not-a-uuid").status_code, 404)

    def test_markdown_image_marker_is_not_task_priority(self):
        image_markdown = "![Immagine](/api/images/00000000-0000-0000-0000-000000000000)"
        created = self.client.post("/api/notes", json={"text": image_markdown})

        self.assertEqual(created.status_code, 201)
        self.assertIsNone(created.json["note"]["task"])
        self.assertEqual(created.json["note"]["text"], image_markdown)

        task = self.client.post("/api/notes", json={"text": "! standard task"})
        self.assertEqual(task.status_code, 201)
        self.assertEqual(task.json["note"]["task"], "low")
        self.assertEqual(task.json["note"]["text"], "standard task")


if __name__ == "__main__":
    unittest.main()