import { describe, expect, test } from "bun:test"
import { finishedSummary, render, shouldSend, type Activity } from "@opencode/core/telegram/notify"

const base = { sessionID: "ses_one", title: "session m" } as const

describe("render", () => {
  test("names the session and what it is doing", () => {
    expect(render({ ...base, kind: "tool", tool: "bash" })).toBe("session m — running bash")
  })

  test("says what the user must act on, not just that something happened", () => {
    expect(render({ ...base, kind: "needs-input", what: "a permission" })).toBe(
      "session m — waiting for you: a permission",
    )
  })

  test("falls back to the id when a session has no title yet", () => {
    expect(render({ kind: "started", sessionID: "ses_x", title: "" })).toBe("ses_x — started")
  })
})

describe("shouldSend", () => {
  test("the first tool call announces the run", () => {
    expect(shouldSend({ ...base, kind: "tool", tool: "bash" } as Activity, 0)).toBe(true)
  })

  test("later tool calls in the same run are not sent one by one", () => {
    // One message per tool call is how a bridge becomes something the user mutes.
    expect(shouldSend({ ...base, kind: "tool", tool: "edit" } as Activity, 3)).toBe(false)
  })

  test("anything the user has to act on is always sent", () => {
    expect(shouldSend({ ...base, kind: "needs-input", what: "a decision" } as Activity, 9)).toBe(true)
    expect(shouldSend({ ...base, kind: "error", message: "boom" } as Activity, 9)).toBe(true)
    expect(shouldSend({ ...base, kind: "finished", summary: "done" } as Activity, 9)).toBe(true)
    expect(shouldSend({ ...base, kind: "paused", reason: "blocked" } as Activity, 9)).toBe(true)
  })
})

describe("finishedSummary", () => {
  test("counts what the run did, in the units a user checks", () => {
    expect(finishedSummary({ tools: 12, files: 3 })).toBe("done — 3 files, 12 tool calls")
  })

  test("singular reads as one", () => {
    expect(finishedSummary({ tools: 1, files: 1 })).toBe("done — 1 file, 1 tool call")
  })

  test("a run that changed nothing says so without inventing detail", () => {
    expect(finishedSummary({ tools: 0, files: 0 })).toBe("done")
  })

  test("files alone is enough", () => {
    expect(finishedSummary({ tools: 0, files: 2 })).toBe("done — 2 files")
  })
})
