import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { EventManifest } from "@opencode/schema/event-manifest"
import { SessionEvent } from "@opencode/schema/session-event"

// The events the Telegram bridge acts on, and the payload fields it reads.
//
// The names were guessed twice and wrong both times: the bridge listened for
// `session.message.tool.called` (which does not exist — the real name is
// `session.tool.called`) and read a `name` off it, while only
// `session.tool.input.started` carries one. Nothing failed loudly; the bridge just
// never sent anything. This fails when a name or field is invented.

// Everything the runtime declares, across every module that contributes events.
// `session.status` lives in its own module and arrives through this manifest.
const declared = new Set(EventManifest.Definitions.map((definition) => definition.type))

const payload = (type: string) =>
  Object.keys(
    (EventManifest.Definitions.find((definition) => definition.type === type)!.data as { fields: object }).fields,
  )

describe("events the telegram bridge reads", () => {
  test("the tool event it takes a name from declares one", () => {
    expect(payload("session.tool.input.started")).toContain("name")
    // And the event it used to listen for has no name at all, which is why every
    // notification was silently dropped.
    expect(payload("session.tool.called")).not.toContain("name")
  })

  test("every event the bridge resolves through the schema is declared", async () => {
    const file = join(import.meta.dir, "..", "src", "telegram.ts")
    const text = await readFile(file, "utf8")

    // The bridge names its events as `SessionEvent.Execution.Failed.type`, so each
    // member path is resolved against the real export rather than pattern-matched.
    const paths = [...new Set([...text.matchAll(/SessionEvent\.([A-Za-z]+(?:\.[A-Za-z]+)*)\.type/g)].map((m) => m[1]))]
    expect(paths.length).toBeGreaterThan(0)

    for (const path of paths) {
      const definition = path.split(".").reduce<unknown>((value, key) => (value as Record<string, unknown>)?.[key], SessionEvent)
      const type = (definition as { type?: string } | undefined)?.type
      expect(type, `SessionEvent.${path} does not resolve to an event`).toBeDefined()
      expect(declared.has(type!), `${type} is not a declared event`).toBe(true)
    }
  })

  test("any event named as a string literal is declared", async () => {
    const file = join(import.meta.dir, "..", "src", "telegram.ts")
    const text = await readFile(file, "utf8")
    const literals = [...new Set([...text.matchAll(/"(session\.[a-z.]+)"/g)].map((match) => match[1]))]
    for (const type of literals) expect(declared.has(type), `${type} is not a declared event`).toBe(true)
  })
})
