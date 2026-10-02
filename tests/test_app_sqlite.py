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

        aggregate = self.client.get("/api/notes/Projects/work")
        self.assertEqual(aggregate.status_code, 200)
        self.assertEqual([note["text"] for note in aggregate.json], ["quick note #work"])
        self.assertEqual(self.client.get("/api/tags").status_code, 200)
        self.assertTrue(DATABASE_PATH.is_file())


if __name__ == "__main__":
    unittest.main()