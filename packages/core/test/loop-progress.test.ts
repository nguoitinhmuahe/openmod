import { describe, expect, test } from "bun:test"
import { progressed } from "@opencode/core/loop/progress"
import type { SessionMessage } from "@opencode/core/session/message"

// The fixtures follow the real schema (packages/schema/src/session-message.ts): an
// assistant message carries `content`, whose entries are tagged "tool", "text" or
// "reasoning". `id` is present because that is what the comparison uses.
let counter = 0
const nextID = () => `msg_${++counter}`

const tool = (name = "bash"): SessionMessage.Info =>
  ({ id: nextID(), type: "assistant", content: [{ type: "tool", name, id: "t1", state: { status: "running" } }] }) as never
const text = (body = "thinking"): SessionMessage.Info =>
  ({ id: nextID(), type: "assistant", content: [{ type: "text", text: body }] }) as never
const edit = (): SessionMessage.Info =>
  ({
    id: nextID(),
    type: "assistant",
    content: [{ type: "tool", name: "edit", id: "t2", state: { status: "completed" } }],
    snapshot: { files: ["src/a.ts"] },
  }) as never
const user = (): SessionMessage.Info => ({ id: nextID(), type: "user", text: "go" }) as never

describe("progressed", () => {
  test("a new assistant turn with a tool call is progress", () => {
    expect(progressed([], [tool()])).toBe(true)
  })

  test("a file edit is progress", () => {
    expect(progressed([], [edit()])).toBe(true)
  })

  test("a turn of text alone is not progress", () => {
    expect(progressed([], [text()])).toBe(false)
  })

  test("a user message alone is not progress", () => {
    expect(progressed([], [user()])).toBe(false)
  })

  test("nothing new is not progress", () => {
    const only = tool()
    expect(progressed([only], [only])).toBe(false)
  })

  test("only the messages added since before count", () => {
    // The tool call was already there; the new turn is text only.
    const old = tool()
    expect(progressed([old], [old, text()])).toBe(false)
  })

  test("a tool call added alongside older ones is progress", () => {
    const older = tool("read")
    expect(progressed([older], [older, tool("edit")])).toBe(true)
  })

  test("order does not matter: a session's newest turn is progress even when listed first", () => {
    // The caller passes what Session.messages returns, which is newest first. Slicing
    // by length assumed oldest first, so the run's own messages were never examined
    // and the no-progress guard could not fire.
    const old = tool("read")
    const fresh = tool("edit")
    expect(progressed([old, user()], [fresh, user(), old])).toBe(true)
  })

  test("order does not matter for a run that only talked", () => {
    const old = tool("read")
    const fresh = text("all done")
    expect(progressed([old, user()], [fresh, user(), old])).toBe(false)
  })
})
