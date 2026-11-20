import sqlite3, json, sys

def dump(path, label):
    print("===", label)
    try:
        c = sqlite3.connect("file:" + path + "?mode=ro", uri=True)
    except Exception as e:
        print("   open failed:", e)
        return
    try:
        keys = [r[0] for r in c.execute("SELECT key FROM kv")]
        print("   kv keys:", len(keys))
        for k in keys[:15]:
            print("     ", k[:64])
        loops = list(c.execute("SELECT key,value FROM kv WHERE key LIKE 'loop:%'"))
        print("   loop rows:", len(loops))
        for k, v in loops:
            d = json.loads(v)
            print("     ", k[:36], "| iter:", d.get("iteration"), "| lastRunAt:", d.get("lastRunAt"))
    except Exception as e:
        print("   kv error:", e)

base = "C:/Users/trant/.local/share/opencode/"
dump(base + "opencode.db", "opencode.db (TUI)")
dump(base + "opencode-openmod-loop.db", "opencode-openmod-loop.db (channel)")
