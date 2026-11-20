import sqlite3, sys, glob, os

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

for p in sorted(glob.glob("C:/Users/trant/.local/share/opencode/*.db")):
    size = os.path.getsize(p) / 1e6
    print("===", os.path.basename(p), f"({size:.0f} MB)")
    try:
        c = sqlite3.connect("file:" + p + "?mode=ro", uri=True)
        for t in ("session", "session_v2", "session_message", "message"):
            try:
                n = c.execute("SELECT COUNT(*) FROM " + t).fetchone()[0]
                print(f"    {t:18} {n}")
            except Exception:
                print(f"    {t:18} (no table)")
        # sessions in the user's "m" folder
        try:
            rows = list(
                c.execute(
                    "SELECT id, substr(title,1,44), directory FROM session_v2 "
                    "WHERE directory LIKE '%Desktop%m' ORDER BY time_created DESC LIMIT 8"
                )
            )
            print(f"    sessions in Desktop/m: {len(rows)}")
            for sid, title, d in rows:
                print(f"      {sid[:26]} | {title} | {d}")
        except Exception as e:
            print("    m-folder query failed:", str(e)[:60])
    except Exception as e:
        print("    open failed:", str(e)[:60])
