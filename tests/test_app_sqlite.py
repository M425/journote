import os
import tempfile
import unittest


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


if __name__ == "__main__":
    unittest.main()