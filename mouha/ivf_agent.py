#!/usr/bin/env python3
"""
Mouha IVF agent worker.

Polls the Notion "Copilot Queue" for Pending rows, runs an LLM with tools
(read the databases, add/update rows, send Slack), writes the Answer back, and
marks the row Done. Every action stays in the queue as an audit trail.

Env (put in mouha/.env or export):
  NOTION_TOKEN         Notion internal integration token (shared with the IVF page)
  OPENAI_API_KEY       for gpt-4o-mini (their primary model)
  SLACK_WEBHOOK_URL    optional; incoming webhook for the homiez channel
  POLL_SECONDS         optional, default 5

Run:  python3 ivf_agent.py        (foreground)
      see README.md for screen / systemd
"""
import json
import os
import time
import urllib.request
import urllib.error

NOTION_VERSION = "2022-06-28"
NOTION_BASE = "https://api.notion.com/v1"

DB = {
    "tasks": "2ec839592c154855940850e63c36f7a7",
    "insuranceAuth": "612ac0113b5048d78b32e1ed5927133e",
    "medications": "5dc3277550cb4dc0b403a66f20f561d7",
    "labResults": "0d0b6357700747b695b31b1345f8d757",
    "appointments": "1c294fb8ab6349928d0050442a70888c",
    "embryos": "0b5aa47b1f234c4195257fcf36be47b8",
    "financial": "e76b004d35f34b07b6abeabe2c5583fd",
    "documents": "1117686a273f488d94476d738da05cf6",
    "monitoring": "067008a4e9414197a834a2c2e39292cc",
    "journal": "175958d45c814a45b721ee631d842e14",
    "contacts": "803d7c73ce28426c8b31437c044fa2c7",
    "appConfig": "4e2ae8e32003492480ae18a8fbd1198a",
    "copilotQueue": "7fb3546e395a4aacadc55f693aa5cbca",
}

SCHEMAS = {
    "journal": {"Entry": "title", "Date": "date", "Author": "select", "Feeling": "select",
                "Mood": "select", "Symptoms": "rich_text", "Notes": "rich_text"},
    "monitoring": {"Scan": "title", "Date": "date", "Cycle Day": "number", "E2": "number",
                   "LH": "number", "P4": "number", "Lining (mm)": "number",
                   "Lead Follicle (mm)": "number", "Follicles Left": "number",
                   "Follicles Right": "number", "Next Scan": "date", "Notes": "rich_text"},
    "appointments": {"Appointment": "title", "Date": "date", "Clinic": "rich_text",
                     "Provider": "rich_text", "Purpose": "rich_text", "Prep": "rich_text",
                     "Questions to Ask": "rich_text", "Results": "rich_text", "Follow-up": "rich_text"},
    "medications": {"Medication": "title", "Dose": "rich_text", "Frequency": "rich_text",
                    "Purpose": "rich_text", "Insurance Status": "select", "Qty Left": "number",
                    "Refills": "number", "Start Date": "date", "End Date": "date", "Notes": "rich_text"},
    "copilotQueue": {"Id": "title", "Question": "rich_text", "Answer": "rich_text",
                     "Conversation": "rich_text", "Status": "select"},
}


def env(name, default=None):
    return os.environ.get(name, default)


def load_dotenv(path):
    if not os.path.exists(path):
        return
    for line in open(path):
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def http(url, method="GET", headers=None, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        raise RuntimeError("%s %s: %s" % (method, url, e.read().decode()[:300]))


def notion(path, method="GET", body=None):
    return http(NOTION_BASE + path, method, {
        "Authorization": "Bearer " + env("NOTION_TOKEN", ""),
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
    }, body)


# --- notion property read/write ---------------------------------------------
def read_prop(p):
    t = p.get("type")
    if t == "title":
        return "".join(x["plain_text"] for x in p["title"])
    if t == "rich_text":
        return "".join(x["plain_text"] for x in p["rich_text"])
    if t == "select":
        return p["select"]["name"] if p["select"] else None
    if t == "number":
        return p["number"]
    if t == "checkbox":
        return p["checkbox"]
    if t == "date":
        return p["date"]["start"] if p["date"] else None
    return None


def row_of(page):
    out = {"id": page["id"]}
    for name, prop in page.get("properties", {}).items():
        out[name] = read_prop(prop)
    return out


def write_prop(t, v):
    if t == "title":
        return {"title": [{"text": {"content": str(v or "")}}]}
    if t == "select":
        return {"select": {"name": str(v)}} if v else {"select": None}
    if t == "number":
        return {"number": None if v in (None, "") else float(v)}
    if t == "date":
        return {"date": {"start": str(v)}} if v else {"date": None}
    return {"rich_text": [{"text": {"content": str(v or "")}}]}


def build_props(db_key, fields):
    schema = SCHEMAS.get(db_key, {})
    return {k: write_prop(schema.get(k, "rich_text"), v) for k, v in fields.items() if v is not None}


# --- agent tools -------------------------------------------------------------
def query_db(db, limit=25):
    dbid = DB.get(db)
    if not dbid:
        return {"error": "unknown db %s" % db}
    data = notion("/databases/%s/query" % dbid, "POST", {"page_size": min(int(limit), 100)})
    return {"rows": [row_of(p) for p in data.get("results", [])]}


def add_row(db, fields):
    dbid = DB.get(db)
    if not dbid:
        return {"error": "unknown db %s" % db}
    page = notion("/pages", "POST", {"parent": {"database_id": dbid}, "properties": build_props(db, fields)})
    return {"created": row_of(page)}


def update_row(page_id, db, fields):
    page = notion("/pages/%s" % page_id, "PATCH", {"properties": build_props(db, fields)})
    return {"updated": row_of(page)}


def send_slack(text):
    url = env("SLACK_WEBHOOK_URL")
    if not url:
        return {"error": "no SLACK_WEBHOOK_URL configured"}
    http(url, "POST", {"Content-Type": "application/json"}, {"text": text})
    return {"sent": True}


TOOLS = [
    {"type": "function", "function": {"name": "query_db", "description": "List rows from a database. db is one of: " + ", ".join(DB),
        "parameters": {"type": "object", "properties": {"db": {"type": "string"}, "limit": {"type": "integer"}}, "required": ["db"]}}},
    {"type": "function", "function": {"name": "add_row", "description": "Create a row. Use exact field names from the schema (e.g. journal: Entry,Date,Author,Feeling,Mood,Symptoms,Notes; monitoring: Scan,Date,Cycle Day,E2,LH,P4,Lining (mm),Lead Follicle (mm),Follicles Left,Follicles Right,Notes; appointments: Appointment,Date,Provider,Clinic,Purpose,Prep).",
        "parameters": {"type": "object", "properties": {"db": {"type": "string"}, "fields": {"type": "object"}}, "required": ["db", "fields"]}}},
    {"type": "function", "function": {"name": "update_row", "description": "Update an existing row by page_id.",
        "parameters": {"type": "object", "properties": {"page_id": {"type": "string"}, "db": {"type": "string"}, "fields": {"type": "object"}}, "required": ["page_id", "db", "fields"]}}},
    {"type": "function", "function": {"name": "send_slack", "description": "Post a message to the shared Slack channel.",
        "parameters": {"type": "object", "properties": {"text": {"type": "string"}}, "required": ["text"]}}},
]

DISPATCH = {"query_db": query_db, "add_row": add_row, "update_row": update_row, "send_slack": send_slack}

SYSTEM = (
    "You are Dr. Sherpa, the IVF guide for Ryan & Nina, who are going through an IVF retrieval cycle at Stanford "
    "(Dr. Amin Milki, planned start ~July 5 2026, authorization expires Dec 6 2026). "
    "You help by answering questions from their Notion databases and by logging data for them. "
    "You may read any database, add or update rows, and send Slack messages without asking — but be accurate "
    "and concise, use exact Notion field names, and confirm what you did in your final answer. "
    "Dates are ISO YYYY-MM-DD. When they tell you scan numbers, log them to 'monitoring'. "
    "Never invent medical advice; stick to their data and logistics. Keep answers short and warm."
)


def llm(messages):
    key = env("OPENAI_API_KEY")
    if not key:
        raise RuntimeError("OPENAI_API_KEY not set")
    return http("https://api.openai.com/v1/chat/completions", "POST",
                {"Authorization": "Bearer " + key, "Content-Type": "application/json"},
                {"model": env("AGENT_MODEL", "gpt-4o-mini"), "messages": messages, "tools": TOOLS, "temperature": 0.2})


def answer_question(question, author):
    messages = [{"role": "system", "content": SYSTEM},
                {"role": "user", "content": "[%s] %s" % (author, question)}]
    actions = []
    for _ in range(6):  # tool loop
        resp = llm(messages)
        msg = resp["choices"][0]["message"]
        messages.append(msg)
        calls = msg.get("tool_calls")
        if not calls:
            return msg.get("content", "").strip(), actions
        for c in calls:
            fn = c["function"]["name"]
            args = json.loads(c["function"]["arguments"] or "{}")
            try:
                result = DISPATCH[fn](**args)
            except Exception as e:
                result = {"error": str(e)}
            actions.append({"tool": fn, "args": args, "result": result})
            messages.append({"role": "tool", "tool_call_id": c["id"], "content": json.dumps(result)[:4000]})
    return "(stopped after several steps)", actions


# --- queue loop --------------------------------------------------------------
def set_status(page_id, status, answer=None, conversation=None):
    fields = {"Status": status}
    if answer is not None:
        fields["Answer"] = answer[:1900]
    if conversation is not None:
        fields["Conversation"] = conversation[:1900]
    notion("/pages/%s" % page_id, "PATCH", {"properties": build_props("copilotQueue", fields)})


def poll_once():
    data = notion("/databases/%s/query" % DB["copilotQueue"], "POST",
                  {"page_size": 5, "filter": {"property": "Status", "select": {"equals": "Pending"}}})
    for page in data.get("results", []):
        row = row_of(page)
        pid = page["id"]
        question = row.get("Question") or ""
        author = (row.get("Id") or "Both").split(" · ")[0]
        if not question.strip():
            set_status(pid, "Error", "empty question")
            continue
        print("[queue] working:", question[:80])
        set_status(pid, "Working")
        try:
            answer, actions = answer_question(question, author)
            convo = "\n".join("%s(%s)->%s" % (a["tool"], json.dumps(a["args"])[:120],
                              json.dumps(a["result"])[:120]) for a in actions)
            set_status(pid, "Done", answer or "(no answer)", convo)
            print("[queue] done")
        except Exception as e:
            set_status(pid, "Error", "agent error: %s" % e)
            print("[queue] error:", e)


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    load_dotenv(os.path.join(here, ".env"))
    if not env("NOTION_TOKEN"):
        raise SystemExit("NOTION_TOKEN missing (set in mouha/.env)")
    poll = int(env("POLL_SECONDS", "5"))
    print("mouha ivf agent up. polling every %ss." % poll)
    while True:
        try:
            poll_once()
        except Exception as e:
            print("[loop] error:", e)
        time.sleep(poll)


if __name__ == "__main__":
    main()
