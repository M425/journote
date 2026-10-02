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