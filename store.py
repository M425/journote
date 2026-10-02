import json
import logging
import sqlite3
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional


logger = logging.getLogger(__name__)


class SQLiteStore:
    def __init__(self, name: str, database_path: Path, search_key: str, legacy_path: Optional[Path] = None):
        self._name = name
        self._table = f"store_{name}"
        self._search_key = search_key
        self._lock = threading.RLock()
        self.database_path = Path(database_path)
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self._connection = sqlite3.connect(self.database_path, check_same_thread=False)
        self._connection.row_factory = sqlite3.Row
        with self._connection:
            self._connection.execute(
                f"CREATE TABLE IF NOT EXISTS {self._table} ("
                "entity_key TEXT PRIMARY KEY, payload TEXT NOT NULL)"
            )
        self._import_legacy(legacy_path)

    def _import_legacy(self, legacy_path: Optional[Path]) -> None:
        if not legacy_path or not legacy_path.is_file():
            return
        with self._lock, self._connection:
            count = self._connection.execute(
                f"SELECT COUNT(*) FROM {self._table}"
            ).fetchone()[0]
            if count:
                return
            with legacy_path.open("r", encoding="utf-8") as legacy_file:
                data = json.load(legacy_file)
            if not isinstance(data, list):
                raise ValueError(f"Legacy data in {legacy_path} must be a list")
            self._connection.executemany(
                f"INSERT INTO {self._table} (entity_key, payload) VALUES (?, ?)",
                [
                    (str(item[self._search_key]), json.dumps(item, ensure_ascii=False))
                    for item in data
                ],
            )
            logger.info("Imported %d %s records from %s", len(data), self._name, legacy_path)

    def _rows(self) -> List[Dict[str, Any]]:
        records = self._connection.execute(
            f"SELECT payload FROM {self._table} ORDER BY rowid"
        ).fetchall()
        return [json.loads(record["payload"]) for record in records]

    def find_by_id(self, value_to_search: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            record = self._connection.execute(
                f"SELECT payload FROM {self._table} WHERE entity_key = ?",
                (value_to_search,),
            ).fetchone()
            return json.loads(record["payload"]) if record else None

    def find_eq(self, key_to_search: str, value_to_search: Any) -> List[Dict[str, Any]]:
        with self._lock:
            return [item for item in self._rows() if item.get(key_to_search) == value_to_search]

    def find_in_list(self, key_to_search: str, value_to_search: Any) -> List[Dict[str, Any]]:
        with self._lock:
            return [item for item in self._rows() if value_to_search in item.get(key_to_search, [])]

    def find_any(self, key_to_search: str, values_to_search: List[Any]) -> List[Dict[str, Any]]:
        with self._lock:
            return [item for item in self._rows() if item.get(key_to_search) in values_to_search]

    def find_all(self) -> List[Dict[str, Any]]:
        with self._lock:
            return self._rows()

    def add(self, obj: Dict[str, Any]) -> Dict[str, Any]:
        key = str(obj[self._search_key])
        with self._lock, self._connection:
            self._connection.execute(
                f"INSERT INTO {self._table} (entity_key, payload) VALUES (?, ?)",
                (key, json.dumps(obj, ensure_ascii=False)),
            )
        return dict(obj)

    def delete(self, key: str) -> Dict[str, Any]:
        with self._lock, self._connection:
            record = self._connection.execute(
                f"SELECT payload FROM {self._table} WHERE entity_key = ?", (key,)
            ).fetchone()
            if record is None:
                raise KeyError("Object not found.")
            self._connection.execute(
                f"DELETE FROM {self._table} WHERE entity_key = ?", (key,)
            )
            return json.loads(record["payload"])

    def patch(self, key: str, obj: Dict[str, Any]) -> Dict[str, Any]:
        with self._lock, self._connection:
            record = self._connection.execute(
                f"SELECT payload FROM {self._table} WHERE entity_key = ?", (key,)
            ).fetchone()
            if record is None:
                raise KeyError("Object not found.")
            current = json.loads(record["payload"])
            current.update({k: v for k, v in obj.items() if k != self._search_key})
            self._connection.execute(
                f"UPDATE {self._table} SET payload = ? WHERE entity_key = ?",
                (json.dumps(current, ensure_ascii=False), key),
            )
            return current

    def re_id(self, old_key: str, new_key: str) -> Dict[str, Any]:
        with self._lock, self._connection:
            record = self._connection.execute(
                f"SELECT payload FROM {self._table} WHERE entity_key = ?", (old_key,)
            ).fetchone()
            if record is None:
                raise KeyError("Object not found.")
            updated = json.loads(record["payload"])
            updated[self._search_key] = new_key
            self._connection.execute(
                f"UPDATE {self._table} SET entity_key = ?, payload = ? WHERE entity_key = ?",
                (new_key, json.dumps(updated, ensure_ascii=False), old_key),
            )
            return updated

    def close(self) -> None:
        with self._lock:
            self._connection.close()