from __future__ import annotations

from flask import Flask, request, jsonify, abort, render_template, send_from_directory
from flask_cors import CORS
import os, time, uuid, sys
from pathlib import Path
from datetime import datetime, timedelta, timezone
import logging
import re
from typing import Any, Dict
from store import SQLiteStore


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

NOTES_FILE = "notes.json"
TAGS_FILE = "tags.json"
CATEGORIES = {
    "Projects": "#",
    "Persons": "@",
    "Events": ">",
    "Generic": "+",
    "Journal": ""
}
# ------------------ Data ------------------
STORE_NOTES = SQLiteStore('notes', DATABASE_PATH, 'id', PORTABLE_DIR / NOTES_FILE)
STORE_TAGS = SQLiteStore('tags', DATABASE_PATH, 'name', PORTABLE_DIR / TAGS_FILE)

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
    """Return first found tag in text"""
    return [word for word in text.split() if word.startswith(("#", "@", ">", "+"))]

def extract_task_priority(text):
    """Detect task priority and remove leading or space-preceded exclamation marks from text."""
    cleaned = text
    priority = None
    duedate = None

    # Regex: match '!!!', '!!', or '!' at start or after a space
    match = re.search(r'(^|\s)(!{1,3})(\d\d-\d\d-\d\d|\d\d\d\d-\d\d-\d\d|\d\d-\d\d|today|tomorrow|week)?', text)
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

        cleaned = re.sub(r'(^|\s)(!{1,3})(\d\d-\d\d-\d\d|\d\d\d\d-\d\d-\d\d|\d\d-\d\d|today|tomorrow|week)?', lambda m: m.group(1), text, count=1)
        # cleaned += ' ' + match.group(0).strip()
    cleaned = cleaned.strip()

    return priority, duedate, cleaned

def compare_tags(tags_before, tags_after):
    tags_before = set(tags_before)
    tags_after = set(tags_after)
    new_tags = tags_after - tags_before
    removed_tags = tags_before - tags_after
    return list(new_tags), list(removed_tags)

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

@app.route("/")
def api_serve_index():
    return send_from_directory(RESOURCE_DIR / "static", "index.html")


@app.route("/api/health", methods=["GET"])
def health():
    """Health check endpoint."""
    logger.info("Health check requested")
    return jsonify({"status": "ok", "time": datetime.now(timezone.utc).astimezone(timezone.utc).isoformat()})

def get_children(tag):
    children = [x['name'] for x in STORE_TAGS.find_eq('parent', tag)]
    for c in children:
        children += get_children(c)
    return children

@app.route("/api/notes/<category>/<anonTag>", methods=["GET"])
def api_get_tagged_notes(category, anonTag):
    logger.debug(f"Getting notes for category {category} and tag {anonTag}")
    if category == "Journal":
        try:
            datetime.strptime(anonTag, "%Y-%m-%d")
        except ValueError:
            return jsonify({"error": "Invalid date format, expected YYYY-MM-DD"}), 400
        return jsonify(STORE_NOTES.find_eq('date', anonTag))
    if category not in CATEGORIES:
        return jsonify({"error": "Invalid category"}), 400
    tag = CATEGORIES[category] + anonTag
    children = set(get_children(tag))
    notes = STORE_NOTES.find_in_list('tags', tag)
    for c in list(children):
        notes += STORE_NOTES.find_in_list('tags', c)
    logger.info(notes)
    notes = {item['id']: item for item in notes}
    notes = list(notes.values())
    notes = sorted(notes, key=lambda x: (x["date"], x["timestamp"]))

    return jsonify(notes)

@app.route("/api/notes", methods=["POST"])
def api_add_note():
    data = request.get_json()
    if not data or "text" not in data:
        return jsonify({"error": "Missing text"}), 400
    tags = find_tag_in_text(data['text'])
    priority, duedate, cleaned_text = extract_task_priority(data["text"])
    note = {
        "id": str(uuid.uuid4()),
        "timestamp": int(time.time() * 1000),
        "date": data.get("date") or datetime.now().date().isoformat(),
        "text": cleaned_text,
        "task": priority,
        "tags": tags,
        "duedate": duedate
    }
    STORE_NOTES.add(note)
    for tag in tags:
        if STORE_TAGS.find_by_id(tag) is None:
            STORE_TAGS.add({"name": tag, "category": categorize_tag(tag), "treed": False, "parent": None})
    return jsonify({"status": "created", "note": note}), 201

@app.route("/api/notes/<note_id>", methods=["DELETE"])
def api_delete_note(note_id):
    note = STORE_NOTES.delete(note_id)
    removed_tags = []
    for tag in note['tags']:
        if STORE_NOTES.find_in_list('tags', tag) is None and STORE_TAGS.find_by_id(tag)['content'] == '':
            removed_tags.append(tag)
    return jsonify({"status": "deleted", "removed_tags": removed_tags})

@app.route("/api/notes/<note_id>", methods=["PATCH"])
def api_patch_note(note_id):
    data = request.get_json()
    if not data or "text" not in data:
        return jsonify({"error": "Missing text"}), 400
    note = STORE_NOTES.find_by_id(note_id)
    if not note:
        return jsonify({"error": "Not found"}), 404

    priority, duedate, cleaned_text = extract_task_priority(data["text"])
    logger.info('priority')
    logger.info(priority)
    logger.info('duedate')
    logger.info(duedate)
    note["task"] = priority
    note['duedate'] = duedate

    old_text = note["text"]
    old_tags = note["tags"]
    note["text"] = cleaned_text
    note["tags"] = find_tag_in_text(cleaned_text)
    note['date'] = data.get("date", note['date'])
    STORE_NOTES.patch(note_id, note)

    added_tags, removed_tags = compare_tags(old_tags, note["tags"])
    logger.info(f"Added tags: {added_tags}, Removed tags: {removed_tags}")
    any_new_tag = []
    for tag in added_tags:
        if STORE_TAGS.find_by_id(tag) is None:
            any_new_tag.append(STORE_TAGS.add({"name": tag, "category": categorize_tag(tag), "treed": False, "parent": None}))
    any_removed_tag = []
    for tag in removed_tags:
        if len(STORE_NOTES.find_in_list('tags', tag)) == 0 and STORE_TAGS.find_by_id(tag)['content'] == '':
            any_removed_tag.append(STORE_TAGS.delete(tag))
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
    notes = STORE_NOTES.find_all()
    for note in notes:
        if note['date'] in date_counts:
            date_counts[note['date']] += 1
    return jsonify(date_counts)

@app.route("/api/tags", methods=["GET"])
def api_get_tags():
    a = jsonify(STORE_TAGS.find_all())
    logger.info(a)
    return a

@app.route("/api/tasks", methods=["GET"])
def api_get_tasks():
    filtered_notes = STORE_NOTES.find_any('task', ['low', 'mid', 'high'])
    logger.info(f"api_get_tasks: Filtering notes for tasks, found {len(filtered_notes)} notes")
    return jsonify(filtered_notes)

@app.route("/api/tags/<category>/<anonTag>", methods=["PATCH"])
def api_patch_tag_tree(category, anonTag):
    logger.debug(f"api_patch_tag_tree: Patching tag {anonTag}")
    tag = CATEGORIES[category] + anonTag
    data = request.get_json()
    if not data:
        return jsonify({"error": "Missing body"}), 400
    for required in ["treed", 'parent', 'content']:
        if required not in data:
            return jsonify({"error": "Missing '" + required + "' field"}), 400
    ret = STORE_TAGS.patch(tag, {'treed': bool(data["treed"]), 'parent': data['parent'], 'content': data['content']} )
    if 'rename' in data and data['rename'] != tag:
        logger.info(f'renaming tag {tag} {data['rename']}')
        STORE_TAGS.re_id(tag, data['rename'])
        notes = STORE_NOTES.find_in_list('tags', tag)
        for note in notes:
            note['text'] = note['text'].replace(tag, data['rename'])
            newtags = []
            for item in note['tags']:
                if item == tag:
                    newtags.append(data['rename'])
                else:
                    newtags.append(item)
            note['tags'] = newtags
            STORE_NOTES.patch(note['id'], note)
        tags = STORE_TAGS.find_eq('parent', tag)
        for t in tags:
            STORE_TAGS.patch(t['name'], {'parent': data['rename']})
        ret['name'] = data['rename']
    return jsonify(ret)

# ---------------------------
# Dev entrypoint
# ---------------------------
if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    host = os.getenv("HOST", "127.0.0.1")
    print(f"Starting Journote on {host}:{port}, database={DATABASE_PATH}")
    app.run(host=host, port=port, debug=False)