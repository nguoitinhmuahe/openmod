"""Ask Telegram whether the stored token works, and send one test message.

This is the only check that proves the bridge can send: everything else tests the
code around it. It reads the token from the same file the bridge does and never
prints it.
"""

import json, sys, urllib.request, urllib.error
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

TOKEN_FILE = Path.home() / ".local" / "share" / "opencode" / "telegram.json"
if not TOKEN_FILE.exists():
    print("no token file at", TOKEN_FILE)
    raise SystemExit(1)

stored = json.loads(TOKEN_FILE.read_text(encoding="utf-8"))
token, chat = stored["token"], stored["chatID"]


def call(method, body):
    url = f"https://api.telegram.org/bot{token}/{method}"
    req = urllib.request.Request(url, data=json.dumps(body).encode(), method="POST")
    req.add_header("content-type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        # Telegram's own description; it never echoes the token.
        return json.loads(e.read().decode())


me = call("getMe", {})
print("getMe ok:", me.get("ok"), "| username:", me.get("result", {}).get("username"))
if not me.get("ok"):
    print("token rejected:", me.get("description"))
    raise SystemExit(1)

sent = call("sendMessage", {"chat_id": chat, "text": "OpenMod test — the bridge can reach this chat."})
print("sendMessage ok:", sent.get("ok"), "| message_id:", sent.get("result", {}).get("message_id"))
if not sent.get("ok"):
    print("send failed:", sent.get("description"))
    raise SystemExit(1)

# A bot cannot message a chat that has never written to it first.
print("\nIf Telegram did not show a message, open the bot in Telegram and send it anything once.")
