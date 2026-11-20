import sqlite3, json, sys

# The Windows console defaults to cp1252, which cannot print Vietnamese.
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

DB = "C:/Users/trant/.local/share/opencode/opencode-openmod-loop.db"
c = sqlite3.connect("file:" + DB + "?mode=ro", uri=True)

loops = list(c.execute("SELECT key,value FROM kv WHERE key LIKE 'loop:%'"))
print("=== loop records ===")
for k, v in loops:
    d = json.loads(v)
    sid = k.split(":", 1)[1]
    print()
    print("session:", sid)
    print("  instruction:", repr(d.get("instruction")))
    print("  state:", d.get("state"), "| iter:", d.get("iteration"))
    print("  startedAt:", d.get("startedAt"), "| lastRunAt:", d.get("lastRunAt"))
    rows = list(
        c.execute(
            "SELECT type, data FROM session_message WHERE session_id = ? ORDER BY seq LIMIT 12", (sid,)
        )
    )
    print("  messages:", len(rows))
    for t, data in rows:
        try:
            j = json.loads(data)
        except Exception:
            j = {}
        text = j.get("text") or ""
        if not text and t == "assistant":
            text = "(content: %d parts)" % len(j.get("content") or [])
        print("    -", t, "|", str(text)[:70])
