import ast
import re
import tempfile
import unittest
from pathlib import Path
from store import SQLiteStore


class PropertyTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / 'db.sqlite3'
        self.store = SQLiteStore('tags', self.path, 'name')

    def tearDown(self):
        self.store.close()
        self.temp.cleanup()

    def test_merge_persistence_and_delete(self):
        self.store.set_tag_property('#project', 'url', 'https://example.com:8000/a')
        self.store.set_tag_property('#project', 'status', 'old')
        self.store.set_tag_property('#project', 'status', 'new\nparagraph\n\nnext')
        other = SQLiteStore('tags', self.path, 'name')
        try:
            self.assertEqual(other.get_tag_properties('#project'), [
                {'key': 'status', 'value': 'new\nparagraph\n\nnext'},
                {'key': 'url', 'value': 'https://example.com:8000/a'}])
            self.store.delete_tag_property('#project', 'url')
            self.assertEqual(len(other.get_tag_properties('#project')), 1)
        finally:
            other.close()

    def test_replace_and_validation_before_write(self):
        self.store.set_tag_property('#project', 'keep', 'yes')
        for invalid in (None, {}, [{'key': '', 'value': 'x'}],
                        [{'key': 'x', 'value': 1}],
                        [{'key': 'x', 'value': '1'}, {'key': ' x ', 'value': '2'}]):
            with self.assertRaises(ValueError):
                self.store.set_tag_properties('#project', invalid)
            self.assertEqual(self.store.get_tag_properties('#project'), [{'key': 'keep', 'value': 'yes'}])
        self.store.set_tag_properties('#project', [])
        self.assertEqual(self.store.get_tag_properties('#project'), [])

    def test_parser(self):
        tree = ast.parse(Path(__file__).with_name('app.py').read_text())
        function = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'parse_tag_property_syntax')
        namespace = {'re': re}
        exec(compile(ast.Module(body=[function], type_ignores=[]), '<parser>', 'exec'), namespace)
        parse = namespace['parse_tag_property_syntax']
        self.assertEqual(parse(' #project-a.b[ stato ] pronto!\n\nhttps://a:b '),
                         [('#project-a.b', 'stato', 'pronto!\n\nhttps://a:b')])
        for text in ('Nota con #tag[key] valore', '#tag[key]', '#tag[] valore', '#tag[key]  ', '#tag[key]\nvalore'):
            self.assertEqual(parse(text), [])


if __name__ == '__main__':
    unittest.main()
