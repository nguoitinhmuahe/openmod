"""Drive a loop from outside and watch it the way the model sees it.

This is the backdoor: it starts a server in a scratch directory, invokes /loop the
way the TUI does, then polls the session transcript and prints each message in
order. Nothing here guesses at the model's behaviour — it reads what was stored.
"""

import json, os, subprocess, sys, time, urllib.request, urllib.error, glob

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

EXE = "C:/Users/trant/Desktop/opencode-ts/packages/cli/dist/cli-windows-x64/bin/opencode.exe"
WORK = "C:/Users/trant/Desktop/loop-test"
DB = "C:/Users/trant/Desktop/loop-test/loop-scratch.db"
LOG = "C:/Users/trant/Desktop/loop-test/serve.log"

INSTRUCTION = sys.argv[1] if len(sys.argv) > 1 else "ghi dong chu HELLO vao file hello.txt roi goi loop_complete"


def start_server():
    for f in glob.glob(DB + "*"):
        os.remove(f)
    env = dict(os.environ)
    env["OPENCODE_DB"] = DB
    env["OPENCODE_FLAGS"] = "all"
    log = open(LOG, "w", encoding="utf-8")
    proc = subprocess.Popen(
        [EXE, "serve", "--print-logs", "--log-level", "info"],
        cwd=WORK,
        env=env,
        stdout=log,
        stderr=subprocess.STDOUT,
    )
    password = None
    for _ in range(60):
        time.sleep(1)
        try:
            text = open(LOG, encoding="utf-8", errors="replace").read()
        except OSError:
            continue
        if "server password" in text and "listening" in text:
            for line in text.splitlines():
                if "server password" in line:
                    password = line.split("server password", 1)[1].strip()
            break
    return proc, password


def call(method, path, body=None, password=None):
    url = "http://127.0.0.1:4096" + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("content-type", "application/json")
    if password:
        import base64
        req.add_header("authorization", "Basic " + base64.b64encode(f"opencode:{password}".encode()).decode())
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            return resp.status, (json.loads(raw) if raw.strip() else None)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", errors="replace")[:300]


def render(msg):
    t = msg.get("type")
    if t == "user":
        return f"USER       | {str(msg.get('text'))[:90]}"
    if t == "synthetic":
        return f"SYNTHETIC  | {str(msg.get('text'))[:90]}"
    if t == "assistant":
        parts = msg.get("content") or []
        bits = []
        for p in parts:
            k = p.get("type")
            if k == "tool":
                bits.append("tool:" + str(p.get("name")))
            elif k == "text":
                bits.append("text:" + str(p.get("text"))[:45])
            elif k == "reasoning":
                bits.append("think")
        err = msg.get("error")
        if err:
            bits.append("ERROR:" + str(err.get("type")))
        return f"ASSISTANT  | {bits}"
    return f"{t.upper()}"


def main():
    proc, password = start_server()
    print("server up, password len", len(password or ""))
    try:
        status, data = call("POST", "/api/session", {}, password)
        sid = (data or {}).get("data", {}).get("id")
        print("session:", sid)

        status, _ = call(
            "POST", f"/api/session/{sid}/command",
            {"name": "loop", "text": INSTRUCTION}, password,
        )
        print("loop command ->", status)

        seen = 0
        for tick in range(70):
            time.sleep(3)
            _, listing = call("GET", f"/api/session/{sid}/message", password=password)
            msgs = (listing or {}).get("data", []) if isinstance(listing, dict) else []
            while seen < len(msgs):
                print(f"  [{tick*3:>3}s] {render(msgs[seen])}")
                seen += 1
    finally:
        proc.terminate()
        print("--- server log (loop lines) ---")
        try:
            for line in open(LOG, encoding="utf-8", errors="replace"):
                if "loop" in line.lower() or "driver" in line.lower():
                    print("   ", line.rstrip()[:160])
        except OSError:
            pass


main()
