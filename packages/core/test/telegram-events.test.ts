import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { EventManifest } from "@opencode/schema/event-manifest"

// The event names and payload fields the Telegram bridge listens for.
//
// These were guessed twice and were wrong both times: the bridge listened for
// `session.message.tool.called` (which does not exist — the real name is
// `session.tool.called`) and read a `name` off it, while only
// `session.tool.input.started` carries one. Nothing failed loudly; the bridge just
// never sent anything. This test fails when a name or field is invented.
const LISTENED = [
  { type: "session.tool.input.started", carries: ["sessionID", "name"] },
  { type: "session.execution.failed", carries: ["sessionID", "error"] },
  { type: "session.execution.interrupted", carries: ["sessionID", "reason"] },
  { type: "session.status", carries: ["sessionID", "status"] },
] as const

// Every declared event, not only the session ones: `session.status` lives in its own
// module and arrives through this manifest, which is what the runtime subscribes to.
const declared = new Set(EventManifest.Definitions.map((definition) => definition.type))

describe("events the telegram bridge listens for", () => {
  test.each(LISTENED.map((entry) => entry.type))("%s is a declared event", (type) => {
    expect(declared.has(type)).toBe(true)
  })

  test("the tool event the bridge reads a name from actually declares one", () => {
    // The payload's own fields, which is where a listener reads them from.
    const payload = (type: string) =>
      Object.keys(
        (EventManifest.Definitions.find((definition) => definition.type === type)!.data as { fields: object }).fields,
      )
    expect(payload("session.tool.input.started")).toContain("name")
    // And the event the bridge used to listen for has no name at all, which is why
    // every notification was silently dropped.
    expect(payload("session.tool.called")).not.toContain("name")
  })

  test("the plugin reads only events the schema declares", async () => {
    const file = join(import.meta.dir, "..", "src", "tool", "plugin", "telegram.ts")
    const text = await readFile(file, "utf8")
    const used = [...text.matchAll(/"(session\.[a-z.]+)"/g)].map((match) => match[1])
    expect(used.length).toBeGreaterThan(0)
    for (const type of new Set(used)) expect(declared.has(type), `${type} is not a declared event`).toBe(true)
  })
})
