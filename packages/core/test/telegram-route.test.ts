import { describe, expect, test } from "bun:test"
import { classify, type Route } from "@opencode/core/telegram/route"

const routes = (entries: Array<[number, Route]> = []): ReadonlyMap<number, Route> => new Map(entries)

const two: ReadonlyMap<number, Route> = routes([
  [100, { sessionID: "ses_alpha", messageID: 100 }],
  [200, { sessionID: "ses_beta", messageID: 200 }],
])

describe("classify", () => {
  test("a reply goes to the session that sent the message it replies to", () => {
    expect(classify("carry on", 200, two)).toEqual({ kind: "session", sessionID: "ses_beta" })
  })

  test("two sessions answered in reverse order still reach the right one", () => {
    // The case the design has to get right: replies do not arrive in the order the
    // notifications were sent, so the route is the reply's own parent, never "the
    // most recent session".
    expect(classify("first answer", 200, two)).toEqual({ kind: "session", sessionID: "ses_beta" })
    expect(classify("second answer", 100, two)).toEqual({ kind: "session", sessionID: "ses_alpha" })
  })

  test("a message with no reply target is refused rather than guessed", () => {
    const result = classify("hello", undefined, two)
    expect(result.kind).toBe("unknown")
  })

  test("a reply to a message the bridge did not send is refused", () => {
    expect(classify("hello", 999, two)).toEqual({
      kind: "unknown",
      reason: "That message is not one I sent, so I cannot tell which session it belongs to.",
    })
  })

  test("a slash command is recognised with and without arguments", () => {
    expect(classify("/status", undefined, routes())).toEqual({ kind: "command", name: "status", rest: "" })
    expect(classify("/loop 30s check the build", undefined, routes())).toEqual({
      kind: "command",
      name: "loop",
      rest: "30s check the build",
    })
  })

  test("a command addressed to this bot in a group is still the command", () => {
    expect(classify("/loop@openmod_bot 5m check", undefined, routes())).toEqual({
      kind: "command",
      name: "loop",
      rest: "5m check",
    })
  })

  test("a command wins over a reply, so a command never lands in a session by accident", () => {
    expect(classify("/status", 100, two)).toEqual({ kind: "command", name: "status", rest: "" })
  })

  test("a path in a reply is neither a command nor a session instruction", () => {
    // "/usr/bin/env is missing" starts with a slash but is not a command: it has a
    // second slash before any space. It must not be routed into the session the user
    // replied to, where it would become that session's instruction.
    const result = classify("/usr/bin/env is missing", 100, two)
    expect(result.kind).toBe("unknown")
  })
})
