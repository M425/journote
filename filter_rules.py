import re
from typing import Any, Dict, List, Tuple


_TOKEN_PATTERN = re.compile(r"\s*(\(|\)|!|[^\s()!]+)")


def parse_filter_rule(rule: str) -> Tuple[Any, ...]:
    if not isinstance(rule, str) or not rule.strip():
        raise ValueError("Enter a filter rule.")

    tokens = []
    position = 0
    while position < len(rule):
        match = _TOKEN_PATTERN.match(rule, position)
        if not match:
            if rule[position:].strip() == "":
                break
            raise ValueError("Invalid character in filter rule.")
        tokens.append(match.group(1))
        position = match.end()

    class Parser:
        def __init__(self, values: List[str]):
            self.values = values
            self.index = 0

        def peek(self):
            return self.values[self.index] if self.index < len(self.values) else None

        def take(self):
            value = self.peek()
            if value is not None:
                self.index += 1
            return value

        def parse(self):
            expression = self.parse_or()
            if self.peek() is not None:
                raise ValueError(f"Unexpected token: {self.peek()}")
            return expression

        def parse_or(self):
            expression = self.parse_and()
            while self.peek() == "o":
                self.take()
                expression = ("or", expression, self.parse_and())
            return expression

        def parse_and(self):
            expression = self.parse_unary()
            while self.peek() == "e":
                self.take()
                expression = ("and", expression, self.parse_unary())
            return expression

        def parse_unary(self):
            token = self.take()
            if token is None:
                raise ValueError("Expected a tag or an opening parenthesis.")
            if token == "!":
                return ("not", self.parse_unary())
            if token == "(":
                expression = self.parse_or()
                if self.take() != ")":
                    raise ValueError("Missing closing parenthesis.")
                return expression
            if token.startswith(("#", "@", ">", "+")) and len(token) > 1:
                return ("tag", token)
            raise ValueError(f"Expected a tag, got: {token}")

    return Parser(tokens).parse()


def matches_filter_rule(note: Dict[str, Any], expression: Tuple[Any, ...]) -> bool:
    operator = expression[0]
    if operator == "tag":
        return expression[1] in note.get("tags", [])
    if operator == "not":
        return not matches_filter_rule(note, expression[1])
    if operator == "and":
        return matches_filter_rule(note, expression[1]) and matches_filter_rule(note, expression[2])
    if operator == "or":
        return matches_filter_rule(note, expression[1]) or matches_filter_rule(note, expression[2])
    raise ValueError(f"Unknown filter operator: {operator}")