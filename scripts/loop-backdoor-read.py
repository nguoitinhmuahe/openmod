import sqlite3, json, sys, os
from collections import Counter

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

DB = "C:/Users/trant/Desktop/loop-test/loop-scratch.db"
c = sqlite3.connect("file:" + DB + "?mode=ro", uri=True)

print("=== loop record (full) ===")
for k, v in c.execute("SELECT key,value FROM kv WHERE key LIKE 'loop:%'"):
    d = json.loads(v)
    print(json.dumps(d, ensure_ascii=False, indent=2)[:700])

sid = c.execute("SELECT id FROM session_v2 ORDER BY time_created DESC LIMIT 1").fetchone()[0]
rows = list(c.execute(
    "SELECT seq, type, data FROM session_message WHERE session_id = ? ORDER BY seq", (sid,)))

print("\n=== every message, in order ===")
for seq, t, data in rows:
    j = json.loads(data)
    if t == "user":
        print(f"{seq:>4}  USER       {str(j.get('text'))[:64]}")
    elif t == "synthetic":
        print(f"{seq:>4}  SYNTHETIC  {str(j.get('text'))[:64]}")
    elif t == "assistant":
        parts = j.get("content") or []
        bits = []
        for p in parts:
            k = p.get("type")
            if k == "tool":
                bits.append("tool:" + str(p.get("name")))
            elif k == "text":
                bits.append("text:" + str(p.get("text"))[:50])
            else:
                bits.append(k)
        err = j.get("error")
        print(f"{seq:>4}  ASSISTANT  {bits}" + (f" ERROR={err.get('type')}" if err else ""))
    else:
        print(f"{seq:>4}  {t.upper()}")

print("\n=== did it write the file? ===")
f = "C:/Users/trant/Desktop/loop-test/hello.txt"
print("hello.txt exists:", os.path.exists(f))
if os.path.exists(f):
    print("content:", repr(open(f, encoding="utf-8", errors="replace").read()[:200]))
