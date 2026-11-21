import { chmod, mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { Path } from "@opencode/util/global"

// Where the bot token lives.
//
// In core rather than the plugin, so `opencode telegram pair` can write it without
// the CLI depending on a plugin package. The plugin reads the same file.
//
// A file, not the config and not the database: the config is read into logs and
// error messages by other code, and a token there would leak the first time
// something printed it. The file is created 0600 so only this user can read it,
// and nothing here ever returns the token in a message.

/**
 * Where the token file is, in one place.
 *
 * It was computed separately by the CLI, the bridge and the TUI, and the three did
 * not agree: the TUI used a phantom `OPENCODE_DATA` and `process.env.HOME`, which on
 * Windows under Git Bash points at a different tree than `os.homedir()` — so
 * `/telegram setup` reported success while the server saw no pairing. `Path.data` is
 * the XDG-correct value the rest of the app already uses.
 */
export const pathFor = (data: string = Path.data) => join(data, "telegram.json")

export type Stored = {
  readonly token: string
  /** The chat that paired, so a stranger who finds the bot is ignored. */
  readonly chatID: number
  readonly username: string
}

export async function save(path: string, stored: Stored): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(stored), { encoding: "utf8", mode: 0o600 })
  await restrictToOwner(path)
}

/**
 * Takes away every other user's access to the file.
 *
 * POSIX systems honour the mode given to writeFile. Windows has no permission bits
 * at all — a mode is accepted and ignored, and the file lands readable by everyone —
 * so the ACL is edited instead. Both paths are best-effort: a platform that cannot
 * restrict a file must not stop the bridge from being set up, and the failure is
 * reported by the caller rather than thrown from here.
 */
async function restrictToOwner(path: string): Promise<void> {
  if (process.platform === "win32") {
    const { spawn } = await import("node:child_process")
    const user = process.env.USERNAME
    if (!user) return
    await new Promise<void>((resolve) => {
      const proc = spawn("icacls", [path, "/inheritance:r", "/grant:r", `${user}:F`], { stdio: "ignore" })
      proc.on("error", () => resolve())
      proc.on("exit", () => resolve())
    })
    return
  }
  await chmod(path, 0o600).catch(() => undefined)
}

export async function load(path: string): Promise<Stored | undefined> {
  try {
    const raw = JSON.parse(await readFile(path, "utf8")) as Partial<Stored>
    if (typeof raw.token !== "string" || raw.token === "") return undefined
    if (typeof raw.chatID !== "number") return undefined
    return { token: raw.token, chatID: raw.chatID, username: typeof raw.username === "string" ? raw.username : "unknown" }
  } catch {
    // Missing or unreadable is the normal "not set up yet" case, not an error.
    return undefined
  }
}

export async function clear(path: string): Promise<void> {
  const { rm } = await import("node:fs/promises")
  await rm(path, { force: true })
}

/**
 * Whether a message may be acted on.
 *
 * Only the paired chat is accepted. A bot's username is guessable, so anyone can
 * message it; without this a stranger's text would become a prompt in the user's
 * session.
 */
export function paired(stored: Stored | undefined, chatID: number): boolean {
  return stored !== undefined && stored.chatID === chatID
}
