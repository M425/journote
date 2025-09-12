from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import os, json, time, uuid
from datetime import datetime, timedelta
import logging
import re


# ---------------------------
# Logging setup
# ---------------------------
logging.basicConfig(
    level=logging.INFO,  # Default logging level
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

app = Flask(__name__, static_folder="static", static_url_path="")
CORS(app)

NOTES_FILE = "notes.json"
TAGS_FILE = "tags.json"

notes = []
tags = {}

CATEGORIES = {
    "Projects": "#",
    "Persons": "@",
    "Events": ">",
    "Generic": "+"
}

# ------------------ Utilities ------------------
def load_notes():
    global notes
    if os.path.exists(NOTES_FILE):
        with open(NOTES_FILE, "r", encoding="utf-8") as f:
            try:
                notes = json.load(f)
            except json.JSONDecodeError:
                notes = []
    else:
        notes = []
    logger.info(f"Loaded {len(notes)} notes")

def save_notes():
    with open(NOTES_FILE, "w", encoding="utf-8") as f:
        json.dump(notes, f, indent=2)

def load_tags():
    global tags
    if os.path.exists(TAGS_FILE):
        with open(TAGS_FILE, "r", encoding="utf-8") as f:
            try:
                tags = json.load(f)
            except json.JSONDecodeError:
                pass  # keep defaults
    else:
        tags = {}
    logger.info(f"Loaded tags: {tags}")

def save_tags():
    with open(TAGS_FILE, "w", encoding="utf-8") as f:
        json.dump(tags, f, indent=2)

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
    priority = "none"
    cleaned = text

    # Regex: match '!!!', '!!', or '!' at start or after a space
    match = re.search(r'(^|\s)(!{1,3})', text)
    if match:
        excl = match.group(2)
        if excl == "!!!":
            priority = "high"
        elif excl == "!!":
            priority = "mid"
        elif excl == "!":
            priority = "low"
        # Remove only the matched exclamation marks (preserve others)
        cleaned = re.sub(r'(^|\s)(!{1,3})', lambda m: m.group(1), text, count=1)
    cleaned = cleaned.strip()
    return priority, cleaned

def compare_tags(tags_before, tags_after):
    tags_before = set(tags_before)
    tags_after = set(tags_after)
    new_tags = tags_after - tags_before
    removed_tags = tags_before - tags_after
    return list(new_tags), list(removed_tags)

# ------------------ Helper data ---------
def get_note(note_id):
    global notes
    return next((n for n in notes if n["id"] == note_id), None)

def add_note(note):
    global notes, tags
    note["tags"] = find_tag_in_text(note["text"])
    notes.append(note)
    save_notes()
    any_new_tag = False
    for tag in note["tags"]:
        if tag not in tags:
            tags[tag] = {"category": categorize_tag(tag), "treed": False, "parent": None}
            any_new_tag = True
    if any_new_tag:
        save_tags()
    return

def delete_note(note_id):
    global notes
    note_to_delete = get_note(note_id)
    logger.info(f"Deleting note: {note_to_delete['tags']}")
    notes = [n for n in notes if n["id"] != note_id]
    save_notes()

    any_removed_tag = []
    for tag in note_to_delete['tags']:
        # Check if any other note still uses this tag
        if not any(tag in n["tags"] for n in notes):
            del tags[tag]
            any_removed_tag.append(tag)
    if len(any_removed_tag) > 0:
        if len(any_removed_tag) > 0:
            logger.info(f"Tags removed: {any_removed_tag}")
        save_tags()
    return any_removed_tag

def patch_note(note, new_text):
    global notes, tags
    if note not in notes:
        return
    old_text = note["text"]
    old_tags = note["tags"]
    note["text"] = new_text
    note["tags"] = find_tag_in_text(new_text)
    save_notes()

    added_tags, removed_tags = compare_tags(old_tags, note["tags"])
    logger.info(f"Added tags: {added_tags}, Removed tags: {removed_tags}")
    any_new_tag = []
    for tag in added_tags:
        if tag not in tags:
            tags[tag] = {"category": categorize_tag(tag), "treed": False, "parent": None}
            any_new_tag.append(tag)
    any_removed_tag = []
    for tag in removed_tags:
        # Check if any other note still uses this tag
        if not any(tag in n["tags"] for n in notes):
            del tags[tag]
            any_removed_tag.append(tag)
    if len(any_new_tag) > 0 or len(any_removed_tag) > 0:
        if len(any_removed_tag) > 0:
            logger.info(f"Tags removed: {any_removed_tag}")
        if len(any_new_tag) > 0:
            logger.info(f"Tags added: {any_new_tag}")
        save_tags()
    return any_new_tag, any_removed_tag

# ------------------ Routes ------------------

@app.route("/")
def api_serve_index():
    return send_from_directory("static", "index.html")

# ----- Notes -----
@app.route("/api/notes", methods=["GET"])
def api_get_notes():
    return jsonify(notes)

@app.route("/api/notes", methods=["POST"])
def api_add_note():
    data = request.get_json()
    if not data or "text" not in data:
        return jsonify({"error": "Missing text"}), 400

    priority, cleaned_text = extract_task_priority(data["text"])
    note = {
        "id": str(uuid.uuid4()),
        "timestamp": int(time.time() * 1000),
        "date": data.get("date") or datetime.now().date().isoformat(),
        "text": cleaned_text,
        "task": priority
    }
    add_note(note)
    return jsonify({"status": "created", "note": note}), 201

@app.route("/api/notes/<note_id>", methods=["GET"])
def api_get_note(note_id):
    note = get_note(note_id)
    if note:
        return jsonify(note)
    return jsonify({"error": "Not found"}), 404

@app.route("/api/notes/<note_id>", methods=["DELETE"])
def api_delete_note(note_id):
    removed_tags = delete_note(note_id)
    return jsonify({"status": "deleted", "removed_tags": removed_tags})

@app.route("/api/notes/<note_id>", methods=["PATCH"])
def api_patch_note(note_id):
    data = request.get_json()
    if not data or "text" not in data:
        return jsonify({"error": "Missing text"}), 400
    note = get_note(note_id)
    if not note:
        return jsonify({"error": "Not found"}), 404

    priority, cleaned_text = extract_task_priority(data["text"])
    note["task"] = priority
    any_new_tag, any_removed_tag = patch_note(note, cleaned_text)
    return jsonify({"status": "patched", "note": note, "new_tags": any_new_tag, "removed_tags": any_removed_tag})

# ----- Tags -----
@app.route("/api/tags", methods=["GET"])
def api_get_tags():
    return jsonify(tags)

@app.route("/api/tags/<category>/<anonTag>/tree", methods=["PATCH"])
def api_patch_tag_tree(category, anonTag):
    global tags
    tag = CATEGORIES[category] + anonTag
    if tag not in tags:
        return jsonify({"error": "Tag not found"}), 404
    data = request.get_json()
    logger.debug(f"Patching tag {tag} with data: {data}")
    if not data or "treed" not in data:
        return jsonify({"error": "Missing 'treed' field"}), 400
    tags[tag]["treed"] = bool(data["treed"])
    if "parent" in data:
        tags[tag]["parent"] = data["parent"]
    save_tags()
    return jsonify(tags[tag])

# ----- Journal -----
@app.route("/api/journal", methods=["GET"])
def api_get_journal():
    return jsonify(last_n_days(20))

# ------------------ Main ------------------

print("Starting journote app...2")
logger.info("Starting journote app...")
load_notes()
load_tags()
app.run(host="0.0.0.0", port=8000, debug=True)
