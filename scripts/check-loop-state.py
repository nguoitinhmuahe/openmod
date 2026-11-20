import sqlite3, json, sys, glob
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
for p in glob.glob("C:/Users/trant/.local/share/opencode/*.db"):
    try:
        c = sqlite3.connect("file:" + p + "?mode=ro", uri=True)
        rows = list(c.execute("SELECT key,value FROM kv WHERE key LIKE 'loop:%'"))
        if not rows: continue
        print("===", p.split("/")[-1])
        for k, v in rows:
            d = json.loads(v)
            print("  ", k[:36])
            print("      instr:", repr(d.get("instruction"))[:46])
            print("      iter:", d.get("iteration"), "| state:", d.get("state"), "| reason:", d.get("endReason"))
    except Exception:
        pass
