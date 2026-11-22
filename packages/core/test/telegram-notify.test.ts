import { describe, expect, test } from "bun:test"
import {
  EDIT_INTERVAL_MS,
  MAX_MESSAGE_CHARS,
  add,
  dueAt,
  emptyLive,
  finishedSummary,
  hasText,
  published,
  render,
  shouldSend,
  type Activity,
} from "@opencode/core/telegram/notify"

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

describe("the live buffer", () => {
  test("fragments accumulate into one message body", () => {
    let live = emptyLive()
    live = add(live, "Để tao ")
    live = add(live, "đọc file ")
    live = add(live, "trước.")
    expect(live.body).toBe("Để tao đọc file trước.")
  })

  test("nothing is published until the interval has passed", () => {
    // One message per fragment is thousands of messages, and Telegram rate-limits
    // edits within seconds — the interval is what keeps the stream to one message.
    const live = add(emptyLive(), "hello")
    expect(dueAt(live, 0)).toBe(false)
    expect(dueAt(live, EDIT_INTERVAL_MS - 1)).toBe(false)
    expect(dueAt(live, EDIT_INTERVAL_MS)).toBe(true)
  })

  test("an unchanged buffer is never republished", () => {
    const live = published(add(emptyLive(), "hello"), 0)
    expect(dueAt(live, EDIT_INTERVAL_MS * 10)).toBe(false)
  })

  test("a fragment after publishing makes it due again", () => {
    let live = published(add(emptyLive(), "hello"), 0)
    live = add(live, " again")
    expect(dueAt(live, EDIT_INTERVAL_MS * 10)).toBe(true)
  })

  test("a long run keeps the newest text and says it was clipped", () => {
    let live = emptyLive()
    for (let i = 0; i < 500; i++) live = add(live, "x".repeat(20))
    expect(live.body.length).toBeLessThanOrEqual(MAX_MESSAGE_CHARS)
    expect(live.body.startsWith("…")).toBe(true)
  })

  test("the end of the buffer is the newest text", () => {
    let live = add(emptyLive(), "a".repeat(MAX_MESSAGE_CHARS))
    live = add(live, "THE-END")
    expect(live.body.endsWith("THE-END")).toBe(true)
  })

  test("an empty buffer has nothing to show", () => {
    expect(hasText(emptyLive())).toBe(false)
    expect(hasText(add(emptyLive(), "   "))).toBe(false)
    expect(hasText(add(emptyLive(), "x"))).toBe(true)
  })
})
