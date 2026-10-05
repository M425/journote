"""API tests; the unattached filter_rules module is stubbed, never exercised."""
import os
import sys
import tempfile
import types
import unittest

runtime = tempfile.TemporaryDirectory()
os.environ['JOURNOTE_DATA_DIR'] = runtime.name
try:
    import filter_rules
except ModuleNotFoundError:
    stub = types.ModuleType('filter_rules')
    def unavailable(*args):
        raise AssertionError('Filter module is outside these tests')
    stub.parse_filter_rule = unavailable
    sys.modules['filter_rules'] = stub
import app


class APITests(unittest.TestCase):
    def test_end_to_end(self):
        client = app.app.test_client()
        for value in ('uno!', 'due: tre\n\nquattro'):
            response = client.post('/api/notes', json={'text': '#demo[stato] ' + value})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json['kind'], 'tag_property')
            self.assertIsNone(response.json['note'])
            self.assertEqual(app.STORE_NOTES.find_all(), [])
        url = '/api/tags/Projects/demo/properties'
        self.assertEqual(client.get(url).json['properties'], [{'key': 'stato', 'value': 'due: tre\n\nquattro'}])
        self.assertEqual(client.patch(url, json={'properties': [{'key': 'url', 'value': 'https://a:b'}]}).status_code, 200)
        self.assertEqual(len(client.get(url).json['properties']), 2)
        self.assertEqual(client.put(url, json={'properties': [{'key': 'bad', 'value': 1}]}).status_code, 400)
        self.assertEqual(len(client.get(url).json['properties']), 2)
        self.assertEqual(client.get('/api/tags').json[0]['property_count'], 2)
        self.assertEqual(client.post('/api/notes', json={'text': 'Nota con #demo[stato] valore'}).status_code, 201)
        self.assertEqual(len(app.STORE_NOTES.find_all()), 1)
        self.assertEqual(client.post('/api/notes', json={'text': None}).status_code, 400)
        self.assertEqual(client.get('/api/tags/Unknown/demo/properties').status_code, 400)
        self.assertEqual(client.get('/api/tags/Projects/missing/properties').status_code, 404)
        self.assertEqual(client.put(url, json={'properties': []}).status_code, 200)
        self.assertEqual(client.get(url).json['properties'], [])


if __name__ == '__main__':
    try:
        unittest.main()
    finally:
        app.STORE_TAGS.close()
        app.STORE_NOTES.close()
        runtime.cleanup()
