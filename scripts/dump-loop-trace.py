import sqlite3, json, sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
DB = "C:/Users/trant/.local/share/opencode/opencode-openmod-loop.db"
c = sqlite3.connect("file:" + DB + "?mode=ro", uri=True)

SID = "ses_e074aa694ffeVybZ3vJUd98xUq"

# What did the model actually receive as its instruction, and what did it do?
print("=== message types in order ===")
rows = list(c.execute("SELECT seq, type, data FROM session_message WHERE session_id = ? ORDER BY seq", (SID,)))
for seq, t, data in rows:
    j = json.loads(data)
    if t == "synthetic":
        print(f"  {seq:>3} synthetic | {str(j.get('text'))[:80]}")
    elif t == "user":
        print(f"  {seq:>3} USER      | {str(j.get('text'))[:80]}")
    elif t == "assistant":
        parts = j.get("content") or []
        kinds = []
        for p in parts:
            if p.get("type") == "tool":
                kinds.append("tool:" + str(p.get("name")))
            elif p.get("type") == "text":
                kinds.append("text:" + str(p.get("text"))[:40])
            else:
                kinds.append(str(p.get("type")))
        print(f"  {seq:>3} assistant | {kinds}")
    else:
        print(f"  {seq:>3} {t}")
