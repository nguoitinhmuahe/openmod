import { describe, expect, test } from "bun:test"
import { progressed } from "@opencode/core/loop/progress"
import type { SessionMessage } from "@opencode/core/session/message"

// The fixtures follow the real schema (packages/schema/src/session-message.ts):
// an assistant message carries `content`, whose entries are tagged "tool", "text"
// or "reasoning". Only the fields `progressed` reads are present.
const tool = (name = "bash"): SessionMessage.Info =>
  ({ type: "assistant", content: [{ type: "tool", name, id: "t1", state: { status: "running" } }] }) as never
const text = (body = "thinking"): SessionMessage.Info =>
  ({ type: "assistant", content: [{ type: "text", text: body }] }) as never
const edit = (): SessionMessage.Info =>
  ({
    type: "assistant",
    content: [{ type: "tool", name: "edit", id: "t2", state: { status: "completed" } }],
    snapshot: { files: ["src/a.ts"] },
  }) as never
const user = (): SessionMessage.Info => ({ type: "user", text: "go" }) as never

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
    const before = [tool()]
    expect(progressed(before, [...before])).toBe(false)
  })

  test("only the messages added since before count", () => {
    // The tool call was already there; the new turn is text only.
    expect(progressed([tool()], [tool(), text()])).toBe(false)
  })

  test("a tool call added alongside older ones is progress", () => {
    expect(progressed([tool("read")], [tool("read"), tool("edit")])).toBe(true)
  })
})
