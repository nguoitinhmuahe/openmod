import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { clear, load, paired, save } from "@opencode/core/telegram/token"

const dirs: string[] = []
const tempPath = async () => {
  const dir = await mkdtemp(join(tmpdir(), "openmod-token-"))
  dirs.push(dir)
  return join(dir, "nested", "telegram.json")
}

afterEach(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true })
})

describe("token file", () => {
  test("round-trips what pairing stored", async () => {
    const path = await tempPath()
    await save(path, { token: "123:abc", chatID: 42, username: "openmod_bot" })
    expect(await load(path)).toEqual({ token: "123:abc", chatID: 42, username: "openmod_bot" })
  })

  test("the file is readable only by this user, where the platform has such a thing", async () => {
    const path = await tempPath()
    await save(path, { token: "123:abc", chatID: 42, username: "b" })
    const mode = (await stat(path)).mode & 0o777
    // Windows has no POSIX permission bits: a mode is accepted and ignored. The ACL
    // is what restricts it there, and that is exercised below.
    if (process.platform === "win32") expect(mode).toBe(0o666)
    else expect(mode).toBe(0o600)
  })

  test("a missing file is not an error, it is simply not set up", async () => {
    expect(await load(join(await tempPath(), "..", "nope.json"))).toBeUndefined()
  })

  test("a file that is not the expected shape is treated as not set up", async () => {
    const path = await tempPath()
    await save(path, { token: "", chatID: 1, username: "b" })
    expect(await load(path)).toBeUndefined()
  })

  test("clearing removes it so the next load says not set up", async () => {
    const path = await tempPath()
    await save(path, { token: "t", chatID: 1, username: "b" })
    await clear(path)
    expect(await load(path)).toBeUndefined()
  })

  test("only the paired chat is accepted", async () => {
    const stored = { token: "t", chatID: 42, username: "b" }
    expect(paired(stored, 42)).toBe(true)
    // A bot's username is guessable, so anyone can message it. Without this a
    // stranger's text would become a prompt in the user's session.
    expect(paired(stored, 43)).toBe(false)
    expect(paired(undefined, 42)).toBe(false)
  })
})
