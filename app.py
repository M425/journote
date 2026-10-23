from __future__ import annotations

import subprocess
from flask import Flask, request, jsonify, abort, render_template, send_from_directory, send_file
from flask_cors import CORS
import os, time, uuid, sys
from pathlib import Path
from datetime import datetime, timedelta, timezone
import logging
import re
import sqlite3
from typing import Any, Dict
from filter_rules import parse_filter_rule
from store import Store


# ---------------------------
# Logging setup
# ---------------------------
logging.basicConfig(
    level=logging.DEBUG,  # Default logging level
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

APP_DIR = Path(__file__).resolve().parent
RESOURCE_DIR = Path(getattr(sys, "_MEIPASS", APP_DIR))
PORTABLE_DIR = Path(sys.executable).resolve().parent if getattr(sys, "frozen", False) else APP_DIR
DATA_DIR = Path(os.getenv("JOURNOTE_DATA_DIR", PORTABLE_DIR / "data"))
DATABASE_PATH = DATA_DIR / "journote.sqlite3"

app = Flask(__name__, static_folder=str(RESOURCE_DIR / "static"), static_url_path="")
CORS(app)
MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024
SHORT_IMAGE_ID_LENGTH = 12
SHORT_NOTE_ID_LENGTH = 12
app.config["MAX_CONTENT_LENGTH"] = MAX_IMAGE_SIZE_BYTES + 64 * 1024

IMAGE_FORMATS = {
    "image/png": (".png", lambda data: data.startswith(b"\x89PNG\r\n\x1a\n")),
    "image/jpeg": (".jpg", lambda data: data.startswith(b"\xff\xd8\xff")),
    "image/gif": (".gif", lambda data: data.startswith((b"GIF87a", b"GIF89a"))),
    "image/webp": (".webp", lambda data: len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP"),
    "image/bmp": (".bmp", lambda data: data.startswith(b"BM")),
}

CATEGORIES = {
    "Projects": "#",
    "Persons": "@",
    "Events": ">",
    "Generic": "+",
    "Journal": ""
}
# ------------------ Data ------------------
STORE = Store(DATABASE_PATH)

# ------------------ Utilities ------------------

def last_n_days(n=20):
    today = datetime.now().date()
    return [(today - timedelta(days=i)).isoformat() for i in range(n)]

def categorize_tag(tag: str):
    """Return category name and clean tag string"""
    logger.debug(f"Categorizing tag: {tag}")
    if not tag:
        return None, None
    if tag.startswith("#"):
        return "Projects"
    if tag.startswith("@"):
        return "Persons"
    if tag.startswith(">"):
        return "Events"
    if tag.startswith("+"):
        return "Generic"
    raise ValueError("Invalid tag format")

def find_tag_in_text(text: str):
    """Return all found tags in text"""
    # Find all tags that start with #, @, >, or +
    tags = []
    words = text.split()
    for word in words:
        if word.startswith(("#", "@", ">", "+")):
            # Check if it's a valid tag (contains alphanumeric, underscore, hyphen, or dot)
            import re
            if re.match(r'^[#@>\+][A-Za-z0-9_\-\.]+$', word):
                tags.append(word)
    return tags

def extract_task_priority(text):
    """Detect task priority and remove leading or space-preceded exclamation marks from text."""
    cleaned = text
    priority = None
    duedate = None

    # Regex: match '!!!', '!!', or '!' at start or after a space
    match = re.search(r'(^|\s)(!{1,3})(?!\[)(\d\d-\d\d-\d\d|\d\d\d\d-\d\d-\d\d|\d\d-\d\d|today|tomorrow|week)?', text)
    if match:
        excl = match.group(2)
        if excl == "!!!":
            priority = "high"
        elif excl == "!!":
            priority = "mid"
        elif excl == "!":
            priority = "low"
        # Remove only the matched exclamation marks (preserve others)
        match_duedate = match.group(3)
        if match_duedate:
            if match_duedate == "today":
                duedate = datetime.now().date().isoformat()[:10]
            elif match_duedate == "tomorrow":
                duedate = (datetime.now().date() + timedelta(days=1)).isoformat()[:10]
            elif match_duedate == "week":
                duedate = (datetime.now().date() + timedelta(days=7)).isoformat()[:10]
            elif len(match_duedate) == 5:
                duedate = f'{datetime.now().year}-{match_duedate}'
            elif len(match_duedate) == 8:
                duedate = datetime.strptime(match_duedate, '%y-%m-%d').isoformat()[:10]
            elif len(match_duedate) == 10:
                duedate = datetime.strptime(match_duedate, '%Y-%m-%d').isoformat()[:10]

        cleaned = re.sub(r'(^|\s)(!{1,3})(?!\[)(\d\d-\d\d-\d\d|\d\d\d\d-\d\d-\d\d|\d\d-\d\d|today|tomorrow|week)?', lambda m: m.group(1), text, count=1)
        # cleaned += ' ' + match.group(0).strip()
    cleaned = cleaned.strip()

    return priority, duedate, cleaned

def extract_reply_reference(text):
    """Detect a reply reference like ``<R:<note-id>`` in the text.

    Returns ``(parent_note_id, cleaned_text)``. The reference marker is
    removed from the text; ``parent_note_id`` is ``None`` when no valid
    reference to an existing note is found.
    """
    match = re.search(r'<R:([a-zA-Z0-9-]+)', text)
    if not match:
        return None, text
    parent_id = match.group(1)
    cleaned = (text[:match.start()] + text[match.end():]).strip()
    if STORE.get_note(parent_id) is None:
        return None, cleaned
    return parent_id, cleaned

def compare_tags(tags_before, tags_after):
    tags_before = set(tags_before)
    tags_after = set(tags_after)
    new_tags = tags_after - tags_before
    removed_tags = tags_before - tags_after
    return list(new_tags), list(removed_tags)

def parse_tag_property_syntax(text):
    """A whole input is one assignment; subsequent lines belong to its value."""
    match = re.fullmatch(r"(#[A-Za-z0-9_.-]+)\[([^\[\]\r\n]+)\][ \t]+(\S[\s\S]*)", text.strip())
    if not match or not match[2].strip():
        return []
    return [(match[1], match[2].strip(), match[3].strip())]

def compile_tag_expression(expression):
    """Compile a filter_rules expression tree into a SQL where clause + params."""
    operator = expression[0]
    if operator == "tag":
        return (
            "EXISTS (SELECT 1 FROM note_tags AS filter_tags "
            "WHERE filter_tags.note_id = n.id AND filter_tags.tag_name = ?)",
            [expression[1]],
        )
    if operator == "not":
        clause, params = compile_tag_expression(expression[1])
        return f"NOT ({clause})", params
    if operator in {"and", "or"}:
        left, left_params = compile_tag_expression(expression[1])
        right, right_params = compile_tag_expression(expression[2])
        return f"({left} {operator.upper()} {right})", left_params + right_params
    raise ValueError(f"Unknown filter operator: {operator}")

# ------------------ Routes ------------------
def require_json() -> Dict[str, Any]:
    """Return JSON body or abort 400 with helpful message."""
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        abort(json_error(400, "Expected JSON object in request body."))
    return data

def json_error(status: int, message: str):
    """Helper for consistent JSON errors via abort()."""
    response = jsonify({"error": {"status": status, "message": message}})
    response.status_code = status
    return response

def open_explorer_database():
    connection = sqlite3.connect(
        f"{DATABASE_PATH.resolve().as_uri()}?mode=ro",
        uri=True,
        timeout=5,
    )
    connection.row_factory = sqlite3.Row
    allowed_actions = {
        sqlite3.SQLITE_SELECT,
        sqlite3.SQLITE_READ,
        sqlite3.SQLITE_FUNCTION,
    }
    if hasattr(sqlite3, "SQLITE_RECURSIVE"):
        allowed_actions.add(sqlite3.SQLITE_RECURSIVE)
    connection.set_authorizer(
        lambda action, _arg1, _arg2, _database, _source:
            sqlite3.SQLITE_OK if action in allowed_actions else sqlite3.SQLITE_DENY
    )
    return connection

@app.get("/api/explorer/tables")
def api_explorer_tables():
    connection = open_explorer_database()
    try:
        tables = connection.execute(
            "SELECT name FROM sqlite_master "
            "WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        ).fetchall()
        return jsonify([row["name"] for row in tables])
    except sqlite3.Error as error:
        return jsonify({"error": {"message": str(error)}}), 500
    finally:
        connection.close()

@app.post("/api/explorer/query")
def api_explorer_query():
    data = request.get_json(silent=True)
    query = data.get("query") if isinstance(data, dict) else None
    if not isinstance(query, str) or not query.strip():
        return json_error(400, "A SQL query is required.")
    if len(query) > 20000:
        return json_error(400, "The SQL query is too long.")

    connection = open_explorer_database()
    try:
        cursor = connection.execute(query)
        if cursor.description is None:
            return json_error(400, "The query must return rows.")

        columns = [column[0] for column in cursor.description]
        fetched = cursor.fetchmany(501)
        rows = [
            [
                {"blob_hex": value.hex()} if isinstance(value, bytes) else value
                for value in row
            ]
            for row in fetched[:500]
        ]
        return jsonify({
            "columns": columns,
            "rows": rows,
            "truncated": len(fetched) > 500,
        })
    except sqlite3.Error as error:
        return jsonify({"error": {"message": str(error)}}), 400
    finally:
        connection.close()

@app.route("/")
def api_serve_index():
    return send_from_directory(RESOURCE_DIR / "static", "index.html")


@app.route("/api/health", methods=["GET"])
def health():
    """Health check endpoint."""
    logger.info("Health check requested")
    return jsonify({"status": "ok", "time": datetime.now(timezone.utc).astimezone(timezone.utc).isoformat()})

def get_children(tag):
    children = [x['name'] for x in STORE.select_tags("parent = ?", (tag,))]
    for c in children:
        children += get_children(c)
    return children

@app.post("/api/notes/filter")
def api_filter_notes():
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or not isinstance(data.get("rule"), str):
        return jsonify({"error": {"status": 400, "message": "A filter rule is required."}}), 400
    try:
        expression = parse_filter_rule(data["rule"])
    except ValueError as error:
        return jsonify({"error": {"status": 400, "message": str(error)}}), 400

    where, params = compile_tag_expression(expression)
    notes = STORE.select_notes(where, tuple(params))
    return jsonify(notes)

@app.post("/api/images")
def api_upload_image():
    uploaded = request.files.get("image")
    if uploaded is None:
        return jsonify({"error": {"status": 400, "message": "An image file is required."}}), 400

    image_format = IMAGE_FORMATS.get(uploaded.mimetype)
    if image_format is None:
        return jsonify({"error": {"status": 415, "message": "Unsupported image format."}}), 415

    contents = uploaded.stream.read(MAX_IMAGE_SIZE_BYTES + 1)
    if not contents:
        return jsonify({"error": {"status": 400, "message": "The image file is empty."}}), 400
    if len(contents) > MAX_IMAGE_SIZE_BYTES:
        return jsonify({"error": {"status": 413, "message": "Images must be 10 MB or smaller."}}), 413
    if not image_format[1](contents):
        return jsonify({"error": {"status": 400, "message": "The uploaded file is not a valid image."}}), 400

    image_dir = DATA_DIR / "img"
    image_dir.mkdir(parents=True, exist_ok=True)
    while True:
        image_id = uuid.uuid4().hex[-SHORT_IMAGE_ID_LENGTH:]
        if not any((image_dir / f"{image_id}{extension}").exists() for extension, _ in IMAGE_FORMATS.values()):
            break
    (image_dir / f"{image_id}{image_format[0]}").write_bytes(contents)
    image_url = f"/api/images/{image_id}"
    return jsonify({
        "id": image_id,
        "url": image_url,
        "markdown": f"![Immagine]({image_url})",
    }), 201

@app.get("/api/images/<image_id>")
def api_get_image(image_id):
    is_short_id = re.fullmatch(r"[0-9a-f]{12}", image_id) is not None
    is_legacy_uuid = False
    if not is_short_id:
        try:
            is_legacy_uuid = str(uuid.UUID(image_id)) == image_id
        except ValueError:
            pass
    if not is_short_id and not is_legacy_uuid:
        abort(404)

    image_dir = DATA_DIR / "img"
    for mimetype, (extension, _) in IMAGE_FORMATS.items():
        image_path = image_dir / f"{image_id}{extension}"
        if image_path.is_file():
            return send_file(image_path, mimetype=mimetype, as_attachment=False, conditional=True)
    abort(404)

@app.route("/api/notes/<category>/<anonTag>", methods=["GET"])
def api_get_tagged_notes(category, anonTag):
    logger.debug(f"Getting notes for category {category} and tag {anonTag}")
    if category == "Journal":
        try:
            datetime.strptime(anonTag, "%Y-%m-%d")
        except ValueError:
            return jsonify({"error": "Invalid date format, expected YYYY-MM-DD"}), 400
        return jsonify({"notes": STORE.select_notes("date = ?", (anonTag,)), "events": []})
    if category not in CATEGORIES:
        return jsonify({"error": "Invalid category"}), 400
    tag = CATEGORIES[category] + anonTag
    children = set(get_children(tag))
    tag_names = [tag] + list(children)
    placeholders = ", ".join("?" for _ in tag_names)
    notes = STORE.select_notes(
        "EXISTS (SELECT 1 FROM note_tags AS filter_tags "
        f"WHERE filter_tags.note_id = n.id AND filter_tags.tag_name IN ({placeholders}))",
        tuple(tag_names),
    )
    events = []
    for child in children:
        print(f"Checking child tag: {child}")
        child_obj = STORE.get_tag(child)
        if child_obj and child_obj['category'] == "Events":
            events.append(child_obj)
    return jsonify({"notes": notes, "events": events})

@app.route("/api/notes/<note_id>", methods=["GET"])
def api_get_note(note_id):
    note = STORE.get_note(note_id)
    if not note:
        return jsonify({"error": "Not found"}), 404
    return jsonify(note)

@app.route("/api/notes", methods=["POST"])
def api_add_note():
    data = require_json()
    if not isinstance(data.get("text"), str) or not data["text"].strip():
        return json_error(400, "text must be a non-empty string")
    tags = find_tag_in_text(data["text"])
    priority, duedate, cleaned_text = extract_task_priority(data["text"])
    parent_id, cleaned_text = extract_reply_reference(cleaned_text)

    note_id = uuid.uuid4().hex[-SHORT_NOTE_ID_LENGTH:]
    while STORE.get_note(note_id) is not None:
        note_id = uuid.uuid4().hex[-SHORT_NOTE_ID_LENGTH:]

    note = {
        "id": note_id,
        "timestamp": int(time.time() * 1000),
        "date": data.get("date") or datetime.now().date().isoformat(),
        "text": cleaned_text,
        "task": priority,
        "tags": tags,
        "duedate": duedate,
        "replied_to": parent_id,
    }
    STORE.add_note(note)
    if parent_id:
        STORE.patch_note(parent_id, {"reply": note["id"]})

    # Process regular tags
    for tag in tags:
        if STORE.get_tag(tag) is None:
            STORE.add_tag({
                "name": tag,
                "category": categorize_tag(tag),
                "treed": False,
                "parent": None,
                "date": data.get("date") or None
            })
    return jsonify({"status": "created", "note": note}), 201

@app.route("/api/notes/<note_id>", methods=["DELETE"])
def api_delete_note(note_id):
    note = STORE.delete_note(note_id)
    removed_tags = []
    for tag in note['tags']:
        tag_record = STORE.get_tag(tag)
        if not STORE.select_notes(
            "EXISTS (SELECT 1 FROM note_tags AS filter_tags "
            "WHERE filter_tags.note_id = n.id AND filter_tags.tag_name = ?)", (tag,), limit=1,
        ) and tag_record and tag_record.get('content', '') == '':
            removed_tags.append(tag)
            STORE.delete_tag(tag)
    return jsonify({"status": "deleted", "removed_tags": removed_tags})

@app.route("/api/notes/<note_id>", methods=["PATCH"])
def api_patch_note(note_id):
    data = request.get_json()
    if not data or "text" not in data:
        return jsonify({"error": "Missing text"}), 400
    note = STORE.get_note(note_id)
    if not note:
        return jsonify({"error": "Not found"}), 404

    priority, duedate, cleaned_text = extract_task_priority(data["text"])
    parent_id, cleaned_text = extract_reply_reference(cleaned_text)
    note["task"] = priority
    note['duedate'] = duedate
    note["replied_to"] = parent_id

    old_text = note["text"]
    old_tags = note["tags"]
    note["text"] = cleaned_text
    note["tags"] = find_tag_in_text(cleaned_text)
    note['date'] = data.get("date", note['date'])
    STORE.patch_note(note_id, note)
    if parent_id:
        STORE.patch_note(parent_id, {"reply": note_id})

    added_tags, removed_tags = compare_tags(old_tags, note["tags"])
    logger.info(f"Added tags: {added_tags}, Removed tags: {removed_tags}")
    any_new_tag = []
    for tag in added_tags:
        if STORE.get_tag(tag) is None:
            any_new_tag.append(STORE.add_tag({"name": tag, "category": categorize_tag(tag), "treed": False, "parent": None, "date": data.get("date") or None}))
    any_removed_tag = []
    for tag in removed_tags:
        if not STORE.select_notes(
            "EXISTS (SELECT 1 FROM note_tags AS filter_tags "
            "WHERE filter_tags.note_id = n.id AND filter_tags.tag_name = ?)", (tag,), limit=1,
        ) and STORE.get_tag(tag)['content'] == '':
            any_removed_tag.append(STORE.delete_tag(tag))
    return jsonify({"status": "patched", "note": note, "new_tags": any_new_tag, "removed_tags": any_removed_tag})

@app.route("/api/notes/<year>/<month>/count", methods=["GET"])
def api_get_note_counts(year, month):
    try:
        year = int(year)
        month = int(month)
        if month < 1 or month > 12:
            raise ValueError
    except ValueError:
        return jsonify({"error": "Invalid year or month"}), 400

    from calendar import monthrange
    days_in_month = monthrange(year, month)[1]
    date_counts = {f"{year}-{month:02d}-{day:02d}": 0 for day in range(1, days_in_month + 1)}
    date_counts.update(STORE.count_notes_by_date(
        f"{year}-{month:02d}-01",
        f"{year}-{month:02d}-{days_in_month:02d}",
    ))
    return jsonify(date_counts)

@app.route("/api/tags", methods=["GET"])
def api_get_tags():
    tags = STORE.select_tags()
    # Add property count information to each tag
    for tag in tags:
        tag['properties'] = STORE.get_tag_properties(tag['name'])
        tag['property_count'] = len(tag['properties'])
    a = jsonify(tags)
    logger.info(a)
    return a

@app.route("/api/tasks", methods=["GET"])
def api_get_tasks():
    filtered_notes = STORE.select_notes("task IN ('low', 'mid', 'high')")
    logger.info(f"api_get_tasks: Filtering notes for tasks, found {len(filtered_notes)} notes")
    return jsonify(filtered_notes)

@app.route("/api/tags/<category>/<anonTag>", methods=["PATCH"])
def api_patch_tag_tree(category, anonTag):
    logger.debug(f"api_patch_tag_tree: Patching tag {anonTag}")
    tag = CATEGORIES[category] + anonTag
    data = request.get_json()
    if not data:
        return jsonify({"error": "Missing body"}), 400

    # Prepare patch data - only include fields that are actually provided
    patch_data = {}
    if 'treed' in data:
        patch_data['treed'] = data["treed"]
    if 'parent' in data:
        patch_data['parent'] = data['parent']
    if 'content' in data:
        patch_data['content'] = data['content']
    if 'date' in data:
        patch_data['date'] = data['date']
    if 'properties' in data:
        return json_error(400, 'Use the /properties endpoint to edit properties')
    if 'rename' in data:
        patch_data['rename'] = data['rename']

    if not patch_data:
        return jsonify({"error": "No valid fields to update"}), 400

    ret = STORE.patch_tag(tag, patch_data)
    if 'rename' in data and data['rename'] != tag:
        logger.info("renaming tag %s %s", tag, data["rename"])
        notes = STORE.select_notes(
            "EXISTS (SELECT 1 FROM note_tags AS filter_tags "
            "WHERE filter_tags.note_id = n.id AND filter_tags.tag_name = ?)", (tag,),
        )
        STORE.rename_tag(tag, data['rename'])
        for note in notes:
            note['text'] = note['text'].replace(tag, data['rename'])
            newtags = []
            for item in note['tags']:
                if item == tag:
                    newtags.append(data['rename'])
                else:
                    newtags.append(item)
            note['tags'] = newtags
            STORE.patch_note(note['id'], note)
        tags = STORE.select_tags("parent = ?", (tag,))
        for t in tags:
            STORE.patch_tag(t['name'], {'parent': data['rename']})
        ret['name'] = data['rename']
    return jsonify(ret)

def property_tag(category, anonTag):
    if category not in CATEGORIES:
        abort(json_error(400, "Unknown tag category"))
    return CATEGORIES[category] + anonTag

@app.route("/api/tags/<category>/<anonTag>/properties", methods=["GET"])
def api_get_tag_properties(category, anonTag):
    tag = property_tag(category, anonTag)
    if STORE.get_tag(tag) is None:
        return json_error(404, "Tag not found")
    return jsonify({"tag": tag, "properties": STORE.get_tag_properties(tag)})

@app.route("/api/tags/<category>/<anonTag>/properties", methods=["POST", "PUT", "PATCH"])
def api_set_tag_properties(category, anonTag):
    """PATCH merges keys. POST/PUT replace the complete collection."""
    tag = property_tag(category, anonTag)
    data = require_json()
    try:
        STORE.set_tag_property(tag, data.get("key"), data.get("value"))
    except ValueError as error:
        return json_error(400, str(error))
    return jsonify({"success": True, "status": "property_saved", "kind": "tag_property",
                    "note": None, "tag": tag, "properties": STORE.get_tag_properties(tag)})

@app.route("/api/tags/<category>/<anonTag>/properties/order", methods=["PUT"])
def api_set_tag_properties_order(category, anonTag):
    """PATCH merges keys. POST/PUT replace the complete collection."""
    tag = property_tag(category, anonTag)
    data = require_json()
    try:
        STORE.set_tag_property_sort(tag, data.get("order"))
    except ValueError as error:
        return json_error(400, str(error))
    return jsonify({"success": True, "status": "property_saved", "kind": "tag_property",
                    "note": None, "tag": tag, "properties": STORE.get_tag_properties(tag)})

# ------------------ Local project folders ------------------
# Stored as an ordinary tag property so the existing Store owns persistence.
PROJECT_FOLDER_KEY = "local_folder"


def require_local_folder_request():
    from urllib.parse import urlsplit
    # CORS is enabled elsewhere in this app; filesystem routes must remain local.
    if request.remote_addr not in {"127.0.0.1", "::1"}:
        abort(json_error(403, "Folder access is only available on this computer"))
    if urlsplit(request.host_url).hostname not in {"localhost", "127.0.0.1", "::1"}:
        abort(json_error(403, "Open Journote through localhost or 127.0.0.1"))
    if request.headers.get("X-Journote-Local") != "1":
        abort(json_error(403, "Missing local application header"))
    origin = request.headers.get("Origin")
    if origin and origin != request.host_url.rstrip("/"):
        abort(json_error(403, "Cross-origin folder access is not allowed"))


def folder_path(value):
    if not isinstance(value, str) or not value or "\x00" in value:
        raise ValueError("Select an existing absolute folder path")
    path = Path(value)
    if not path.is_absolute():
        raise ValueError("The folder path must be absolute")
    path = path.resolve(strict=True)
    if not path.is_dir():
        raise ValueError("The selected path is not a folder")
    return path


def open_project_file(path):
    """Open a file using MobaXterm's open command."""
    try:
        subprocess.Popen(["open", str(path)])
    except FileNotFoundError:
        return json_error(501, 'The open command is not available')
    except OSError:
        return json_error(400, 'Could not open the file')

    return jsonify({'status': 'open_requested'})

def project_file_preview(path):
    """Read bounded local bytes; never execute or render active documents as HTML."""
    from io import BytesIO
    types = {
        '.pdf': ('pdf', 'application/pdf'),
        '.png': ('image', 'image/png'), '.jpg': ('image', 'image/jpeg'),
        '.jpeg': ('image', 'image/jpeg'), '.gif': ('image', 'image/gif'),
        '.webp': ('image', 'image/webp'), '.bmp': ('image', 'image/bmp'),
        '.avif': ('image', 'image/avif'), '.ico': ('image', 'image/x-icon'),
        '.mp3': ('audio', 'audio/mpeg'), '.wav': ('audio', 'audio/wav'),
        '.ogg': ('audio', 'audio/ogg'), '.m4a': ('audio', 'audio/mp4'),
        '.flac': ('audio', 'audio/flac'),
        '.mp4': ('video', 'video/mp4'), '.webm': ('video', 'video/webm'),
        '.mov': ('video', 'video/quicktime'),
    }
    text_extensions = set(('.txt .md .log .csv .tsv .json .xml .yaml .yml .ini .cfg '
                           '.js .ts .jsx .tsx .py .html .htm .css .scss .sql .sh '
                           '.bat .ps1 .c .cpp .h .java .cs .go .rs .php .svg').split())
    extension = path.suffix.lower()
    kind, mime = types.get(extension, ('text', 'text/plain') if extension in text_extensions
                           or path.name.lower() in {'readme', 'license', 'dockerfile', 'makefile'}
                           else (None, None))
    if kind is None:
        return json_error(415, 'Preview unavailable for this file type (including Office documents and archives)')
    limit = (2 if kind == 'text' else 32) * 1024 * 1024
    if path.stat().st_size > limit:
        return json_error(413, f'Preview limit: {limit // (1024 * 1024)} MB for this file type')
    with path.open('rb') as source:
        content = source.read(limit + 1)
    if len(content) > limit:
        return json_error(413, 'File exceeds the preview size limit')
    if kind == 'pdf' and not content.startswith(b'%PDF-'):
        return json_error(415, 'The selected file is not a valid PDF')
    if kind == 'text':
        encoding = 'utf-16' if content.startswith((b'\xff\xfe', b'\xfe\xff')) else 'utf-8-sig'
        try:
            text = content.decode(encoding)
        except UnicodeError:
            return json_error(415, 'Text preview requires UTF-8 or UTF-16 encoding')
        if '\x00' in text:
            return json_error(415, 'Binary content cannot be previewed as text')
        content = text.encode('utf-8')
    response = send_file(BytesIO(content), mimetype=mime, download_name=path.name,
                         as_attachment=False, conditional=False, max_age=0)
    response.headers['X-Journote-Preview'] = kind
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Cache-Control'] = 'no-store'
    response.headers['Content-Security-Policy'] = "sandbox; default-src 'none'"
    return response


def folder_listing(path, root=None, directories_only=False):
    entries = []
    for child in path.iterdir():
        try:
            resolved = child.resolve(strict=True)
            if root is not None and not resolved.is_relative_to(root):
                continue  # Do not follow junctions/symlinks outside the linked folder.
            directory = child.is_dir()
            if directories_only and not directory:
                continue
            entries.append({"name": child.name, "directory": directory,
                            "path": str(child.relative_to(root)) if root else str(child)})
        except OSError:
            continue
    entries.sort(key=lambda entry: (not entry["directory"], entry["name"].casefold()))
    parent = (str(path.parent.relative_to(root)) if path != root else None) if root else (
        str(path.parent) if path.parent != path else "")
    return {"path": str(path), "relative": str(path.relative_to(root)) if root else "",
            "parent": parent, "entries": entries, "linked": root is not None}


@app.route("/api/tags/<category>/<anonTag>/folder/<action>", methods=["POST"])
def api_project_folder(category, anonTag, action):
    require_local_folder_request()
    if category != "Projects":
        return json_error(400, "Only projects can link a folder")
    tag = "#" + anonTag
    if STORE.get_tag(tag) is None:
        return json_error(404, "Project not found")
    data = require_json()
    try:
        if action == "browse":
            value = data.get("path", "")
            if value == "":
                roots = [Path(f"{letter}:/") for letter in "ABCDEFGHIJKLMNOPQRSTUVWXYZ"] if os.name == "nt" else [Path("/")]
                return jsonify({"path": None, "parent": None, "entries": [
                    {"name": str(root), "path": str(root), "directory": True}
                    for root in roots if root.is_dir()]})
            return jsonify(folder_listing(folder_path(value), directories_only=True))
        if action == "link":
            path = folder_path(data.get("path"))
            # Ensure the selected directory is readable before persisting it.
            with os.scandir(path):
                pass
            STORE.set_tag_property(tag, PROJECT_FOLDER_KEY, str(path))
            return jsonify({"path": str(path), "linked": True})
        if action in {"files", "preview", "open"}:
            properties = STORE.get_tag_properties(tag)
            value = next((item["value"] for item in properties if item["key"] == PROJECT_FOLDER_KEY), "")
            if not value:
                if action in {"preview", "open"}:
                    return json_error(404, "No folder linked to this project")
                return jsonify({"path": None, "parent": None, "entries": [], "linked": False})
            root = folder_path(value)
            relative = data.get("relative", "")
            if not isinstance(relative, str) or "\x00" in relative or Path(relative).is_absolute() or Path(relative).drive:
                raise ValueError("Invalid relative folder path")
            path = (root / relative).resolve(strict=True)
            if not path.is_relative_to(root):
                return json_error(403, "The folder is outside this project's linked folder")
            if action in {"preview", "open"}:
                if not path.is_file():
                    return json_error(400, "Select a regular file")
                return open_project_file(path) if action == "open" else project_file_preview(path)
            return jsonify(folder_listing(folder_path(str(path)), root=root))
        return json_error(404, "Unknown folder action")
    except (ValueError, TypeError):
        return json_error(400, "Invalid folder path or property value")
    except FileNotFoundError:
        return json_error(404, "Folder not found; it may have been moved or disconnected")
    except PermissionError:
        return json_error(403, "Permission denied for this folder")
    except OSError:
        return json_error(400, "Cannot read this folder")


# ---------------------------
# Dev entrypoint
# ---------------------------
if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    host = os.getenv("HOST", "127.0.0.1")
    print(f"Starting Journote on {host}:{port}, database={DATABASE_PATH}")
    app.run(host=host, port=port, debug=False)
    