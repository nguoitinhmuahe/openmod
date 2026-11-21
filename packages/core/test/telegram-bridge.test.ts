import { describe, expect, test } from "bun:test"
import { createBridge } from "@opencode/core/telegram/bridge"

/** A fake bot that records what it sent and hands back increasing ids. */
function fakeBot() {
  const sent: Array<{ chatID: number; text: string; replyTo?: number }> = []
  let next = 100
  return {
    sent,
    port: {
      sendMessage: async (input: { chatID: number; text: string; replyTo?: number }) => {
        sent.push(input)
        return next++
      },
    },
  }
}

function fakeSessions(titles: Record<string, string> = {}) {
  const prompted: Array<{ sessionID: string; text: string }> = []
  return {
    prompted,
    port: {
      prompt: async (input: { sessionID: string; text: string }) => {
        prompted.push(input)
      },
      title: async (sessionID: string) => titles[sessionID] ?? "",
    },
  }
}

const commands = [
  { name: "loop", description: "run an instruction on repeat" },
  { name: "status", description: "show what is running" },
]

const make = (options: { runCommand?: (input: { name: string; rest: string; chatID: number }) => Promise<string> } = {}) => {
  const bot = fakeBot()
  const sessions = fakeSessions({ ses_alpha: "session alpha", ses_beta: "session beta" })
  const bridge = createBridge({
    bot: bot.port,
    sessions: sessions.port,
    chatID: 42,
    commands,
    runCommand: options.runCommand ?? (async () => "ran"),
  })
  return { bot, sessions, bridge }
}

describe("notify", () => {
  test("announces a run once and stays quiet through its tool calls", async () => {
    const { bot, bridge } = make()
    await bridge.notify({ kind: "tool", sessionID: "ses_alpha", title: "", tool: "bash" })
    await bridge.notify({ kind: "tool", sessionID: "ses_alpha", title: "", tool: "edit" })
    await bridge.notify({ kind: "tool", sessionID: "ses_alpha", title: "", tool: "write" })
    expect(bot.sent.length).toBe(1)
    expect(bot.sent[0].text).toBe("session alpha — running bash")
  })

  test("a new run announces itself again", async () => {
    const { bot, bridge } = make()
    await bridge.notify({ kind: "tool", sessionID: "ses_alpha", title: "", tool: "bash" })
    await bridge.notify({ kind: "finished", sessionID: "ses_alpha", title: "", summary: "done — 1 file" })
    await bridge.notify({ kind: "tool", sessionID: "ses_alpha", title: "", tool: "bash" })
    expect(bot.sent.length).toBe(3)
    expect(bot.sent[2].text).toBe("session alpha — running bash")
  })

  test("input the user has to give is never dropped, however busy the run", async () => {
    const { bot, bridge } = make()
    for (let i = 0; i < 5; i++) await bridge.notify({ kind: "tool", sessionID: "ses_alpha", title: "", tool: "read" })
    await bridge.notify({ kind: "needs-input", sessionID: "ses_alpha", title: "", what: "a permission" })
    expect(bot.sent.at(-1)?.text).toBe("session alpha — waiting for you: a permission")
  })

  test("two sessions are announced independently", async () => {
    const { bot, bridge } = make()
    await bridge.notify({ kind: "tool", sessionID: "ses_alpha", title: "", tool: "bash" })
    await bridge.notify({ kind: "tool", sessionID: "ses_beta", title: "", tool: "bash" })
    expect(bot.sent.map((m) => m.text)).toEqual(["session alpha — running bash", "session beta — running bash"])
  })
})

describe("receive", () => {
  test("a reply reaches the session whose notification it answers", async () => {
    const { sessions, bridge } = make()
    await bridge.notify({ kind: "finished", sessionID: "ses_alpha", title: "", summary: "done" })
    const notification = 100
    await bridge.receive({ chatID: 42, text: "look at the tests again", replyTo: notification })
    expect(sessions.prompted).toEqual([{ sessionID: "ses_alpha", text: "look at the tests again" }])
  })

  test("two sessions answered out of order still each get their own reply", async () => {
    const { bot, sessions, bridge } = make()
    await bridge.notify({ kind: "finished", sessionID: "ses_alpha", title: "", summary: "done" })
    await bridge.notify({ kind: "finished", sessionID: "ses_beta", title: "", summary: "done" })
    const [alphaMessage, betaMessage] = bot.sent.map((_, index) => 100 + index)

    // The beta reply arrives first. Routing by "most recent session" would put it in
    // alpha, which is the failure this whole design exists to avoid.
    await bridge.receive({ chatID: 42, text: "for beta", replyTo: betaMessage })
    await bridge.receive({ chatID: 42, text: "for alpha", replyTo: alphaMessage })

    expect(sessions.prompted).toEqual([
      { sessionID: "ses_beta", text: "for beta" },
      { sessionID: "ses_alpha", text: "for alpha" },
    ])
  })

  test("a message from another chat is ignored", async () => {
    const { bot, sessions, bridge } = make()
    await bridge.receive({ chatID: 99, text: "hello", replyTo: undefined })
    expect(bot.sent.length).toBe(0)
    expect(sessions.prompted.length).toBe(0)
  })

  test("a bare message with no reply target is refused, not guessed", async () => {
    const { bot, sessions, bridge } = make()
    await bridge.receive({ chatID: 42, text: "hello" })
    expect(sessions.prompted.length).toBe(0)
    expect(bot.sent[0].text).toContain("Reply to a notification")
  })

  test("a known command reaches the handler with its arguments", async () => {
    const seen: Array<{ name: string; rest: string }> = []
    const { bridge } = make({
      runCommand: async (input) => {
        seen.push({ name: input.name, rest: input.rest })
        return "loop started"
      },
    })
    await bridge.receive({ chatID: 42, text: "/loop 30s check the build" })
    expect(seen).toEqual([{ name: "loop", rest: "30s check the build" }])
  })

  test("an unknown command answers with the menu rather than failing silently", async () => {
    const { bot, bridge } = make()
    await bridge.receive({ chatID: 42, text: "/nonsense" })
    expect(bot.sent[0].text).toContain("Unknown command /nonsense")
    expect(bot.sent[0].text).toContain("/loop")
    expect(bot.sent[0].text).toContain("/status")
  })

  test("a reply to a message the bridge never sent is refused", async () => {
    const { bot, sessions, bridge } = make()
    await bridge.receive({ chatID: 42, text: "hello", replyTo: 999 })
    expect(sessions.prompted.length).toBe(0)
    expect(bot.sent[0].text).toContain("not one I sent")
  })

  test("a command typed as a reply does not go into the session", async () => {
    const { sessions, bridge } = make()
    await bridge.notify({ kind: "finished", sessionID: "ses_alpha", title: "", summary: "done" })
    await bridge.receive({ chatID: 42, text: "/status", replyTo: 100 })
    // The command is handled, and nothing is typed into the session.
    expect(sessions.prompted.length).toBe(0)
  })
})
