import { describe, expect, test } from "bun:test"
import { createBot, TelegramError } from "@opencode/core/telegram/bot"

/** A fake Bot API: records calls and replies with canned results. */
function fakeApi(replies: Record<string, unknown> = {}, status = 200) {
  const calls: Array<{ method: string; body: any }> = []
  const fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const method = String(url).split("/").pop()!
    const body = init?.body ? JSON.parse(String(init.body)) : {}
    calls.push({ method, body })
    const result = replies[method]
    if (status !== 200) return new Response(JSON.stringify({ ok: false, description: "bad token" }), { status })
    return new Response(JSON.stringify({ ok: true, result }), { status: 200 })
  }) as unknown as typeof globalThis.fetch
  return { calls, fetch }
}

describe("telegram bot client", () => {
  test("long-polls with the offset and only message updates", async () => {
    const api = fakeApi({ getUpdates: [] })
    await createBot({ token: "t", fetch: api.fetch, pollSeconds: 0 }).getUpdates(7)
    expect(api.calls[0]).toEqual({
      method: "getUpdates",
      body: { offset: 7, timeout: 0, allowed_updates: ["message"] },
    })
  })

  test("sendMessage returns the message id a reply can be routed by", async () => {
    const api = fakeApi({ sendMessage: { message_id: 42 } })
    const id = await createBot({ token: "t", fetch: api.fetch }).sendMessage({ chatID: 5, text: "hi" })
    expect(id).toBe(42)
    expect(api.calls[0].body).toEqual({ chat_id: 5, text: "hi" })
  })

  test("a reply target is passed through so the thread stays readable", async () => {
    const api = fakeApi({ sendMessage: { message_id: 1 } })
    await createBot({ token: "t", fetch: api.fetch }).sendMessage({ chatID: 5, text: "hi", replyTo: 9 })
    expect(api.calls[0].body).toMatchObject({ reply_to_message_id: 9 })
  })

  test("a rejected token fails loudly instead of looking like an empty update list", async () => {
    const api = fakeApi({}, 401)
    await expect(createBot({ token: "bad", fetch: api.fetch }).getUpdates(0)).rejects.toBeInstanceOf(TelegramError)
  })

  test("the failure names the method and status but never the token", async () => {
    const api = fakeApi({}, 401)
    const error = await createBot({ token: "SECRET-TOKEN", fetch: api.fetch }).getUpdates(0).catch((e) => e)
    expect(error.message).toContain("getUpdates")
    expect(error.message).toContain("401")
    expect(error.message).not.toContain("SECRET-TOKEN")
  })

  test("whoami returns the username so pairing can name the bot", async () => {
    const api = fakeApi({ getMe: { username: "openmod_bot" } })
    expect(await createBot({ token: "t", fetch: api.fetch }).whoami()).toBe("openmod_bot")
  })

  test("the command menu is published as given", async () => {
    const api = fakeApi({ setMyCommands: true })
    await createBot({ token: "t", fetch: api.fetch }).setMyCommands([{ command: "loop", description: "run a loop" }])
    expect(api.calls[0]).toEqual({
      method: "setMyCommands",
      body: { commands: [{ command: "loop", description: "run a loop" }] },
    })
  })
})
