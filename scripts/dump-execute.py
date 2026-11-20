import sqlite3, json, sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
DB = "C:/Users/trant/Desktop/loop-test/loop-scratch.db"
c = sqlite3.connect("file:" + DB + "?mode=ro", uri=True)
sid = c.execute("SELECT id FROM session_v2 ORDER BY time_created DESC LIMIT 1").fetchone()[0]

rows = list(c.execute(
    "SELECT seq, type, data FROM session_message WHERE session_id = ? ORDER BY seq", (sid,)))

print("=== every tool:execute, expanded ===")
for seq, t, data in rows:
    if t != "assistant":
        continue
    j = json.loads(data)
    for p in (j.get("content") or []):
        if p.get("type") == "tool" and p.get("name") == "execute":
            state = p.get("state") or {}
            inp = state.get("input") or {}
            code = str(inp.get("code") or inp)[:220]
            out = state.get("output") or {}
            print(f"\n--- seq {seq} | state={state.get('status')}")
            print("    code:", code)
            if out:
                print("    out :", str(out.get("output") or out)[:200])
