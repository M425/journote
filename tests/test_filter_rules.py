import unittest

from filter_rules import matches_filter_rule, parse_filter_rule


class FilterRuleTests(unittest.TestCase):
    def test_boolean_precedence_and_person_tags(self):
        expression = parse_filter_rule("#work e !@sam o (#home e @sam)")

        self.assertTrue(matches_filter_rule({"tags": ["#work"]}, expression))
        self.assertFalse(matches_filter_rule({"tags": ["#work", "@sam"]}, expression))
        self.assertTrue(matches_filter_rule({"tags": ["#home", "@sam"]}, expression))

    def test_nested_negation(self):
        expression = parse_filter_rule("!(#work o @sam)")

        self.assertTrue(matches_filter_rule({"tags": ["#home"]}, expression))
        self.assertFalse(matches_filter_rule({"tags": ["#work"]}, expression))

    def test_rejects_incomplete_or_invalid_rules(self):
        for rule in ("", "#work e", "#work o)", "(#work", "work", "#work #home"):
            with self.subTest(rule=rule), self.assertRaises(ValueError):
                parse_filter_rule(rule)


if __name__ == "__main__":
    unittest.main()