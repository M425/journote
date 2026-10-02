import os
import tempfile
import unittest


_data_directory = tempfile.TemporaryDirectory()
os.environ["JOURNOTE_DATA_DIR"] = _data_directory.name

from app import DATABASE_PATH, STORE_NOTES, STORE_TAGS, STORE_USERS, _TOKENS, app


class SQLiteApiTests(unittest.TestCase):
    def setUp(self):
        for store in (STORE_NOTES, STORE_TAGS, STORE_USERS):
            for record in store.find_all():
                key = record["id"] if "id" in record else record["name"] if "name" in record else record["username"]
                store.delete(key)
        _TOKENS.clear()
        self.client = app.test_client()

    def test_first_run_setup_and_tag_aggregation(self):
        self.assertFalse(self.client.get("/api/auth/status").json["initialized"])
        invalid_setup = self.client.post("/api/auth/setup", json={
            "username": "local-user",
            "password": "short",
        })
        self.assertEqual(invalid_setup.status_code, 400)

        setup = self.client.post("/api/auth/setup", json={
            "username": "local-user",
            "password": "portable-password",
        })
        self.assertEqual(setup.status_code, 201)
        self.assertEqual(
            self.client.post("/api/auth/setup", json={
                "username": "another-user",
                "password": "portable-password",
            }).status_code,
            409,
        )

        signin = self.client.post("/api/auth/signin", json={
            "username": "local-user",
            "password": "portable-password",
        })
        self.assertEqual(signin.status_code, 201)
        headers = {"Authorization": f"Bearer {signin.json['token']}"}
        created = self.client.post("/api/notes", headers=headers, json={
            "text": "quick note #work",
            "date": "2026-10-02",
        })
        self.assertEqual(created.status_code, 201)

        aggregate = self.client.get("/api/notes/Projects/work", headers=headers)
        self.assertEqual(aggregate.status_code, 200)
        self.assertEqual([note["text"] for note in aggregate.json], ["quick note #work"])
        self.assertTrue(DATABASE_PATH.is_file())


if __name__ == "__main__":
    unittest.main()