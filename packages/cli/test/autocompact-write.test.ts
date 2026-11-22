import { describe, expect, test } from "bun:test"
import { applyEdits, modify } from "jsonc-parser"

// `/autocompact-setting` writes a model's context window. The path it writes to has a
// slash and a colon in it — `a/deepseek-v4.1-flash:free` is a real model id here — so
// the two things worth proving are that such a path survives the JSON editor, and that
// the value lands where the catalog reads it (`config/plugin/provider.ts` merges
// `provider.<id>.models.<id>.limit` over the catalog).

const document = `{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "9router": {
      "models": {
        "a/deepseek-v4.1-flash:free": {
          "name": "a/deepseek-v4.1-flash:free"
        }
      }
    }
  }
}
`

const FORMAT = { formattingOptions: { tabSize: 2, insertSpaces: true } }

describe("the autocompact setting's write", () => {
  test("a model id with a slash and a colon survives the path", () => {
    const path = ["provider", "9router", "models", "a/deepseek-v4.1-flash:free", "limit", "context"]
    const updated = applyEdits(document, modify(document, path, 64_000, FORMAT))
    expect(JSON.parse(updated).provider["9router"].models["a/deepseek-v4.1-flash:free"].limit).toEqual({
      context: 64_000,
    })
  })

  test("the rest of the document is left alone", () => {
    const path = ["provider", "9router", "models", "a/deepseek-v4.1-flash:free", "limit", "context"]
    const updated = applyEdits(document, modify(document, path, 128_000, FORMAT))
    const parsed = JSON.parse(updated)
    expect(parsed.$schema).toBe("https://opencode.ai/config.json")
    expect(parsed.provider["9router"].models["a/deepseek-v4.1-flash:free"].name).toBe("a/deepseek-v4.1-flash:free")
  })

  test("a second write replaces the window rather than nesting another", () => {
    const path = ["provider", "9router", "models", "a/deepseek-v4.1-flash:free", "limit", "context"]
    const once = applyEdits(document, modify(document, path, 64_000, FORMAT))
    const twice = applyEdits(once, modify(once, path, 32_000, FORMAT))
    expect(JSON.parse(twice).provider["9router"].models["a/deepseek-v4.1-flash:free"].limit).toEqual({
      context: 32_000,
    })
  })

  test("compaction.buffer is written as a share of the window", () => {
    // The dialog offers "70% full", which is stored as the room kept free — 30% —
    // because that is the unit the compaction settings use.
    const path = ["compaction", "buffer"]
    const updated = applyEdits(document, modify(document, path, "30%", FORMAT))
    expect(JSON.parse(updated).compaction.buffer).toBe("30%")
  })

  test("a window the document has never held is added", () => {
    // The provider block exists but has no models key at all: a fresh setup.
    const bare = `{ "$schema": "https://opencode.ai/config.json" }`
    const path = ["provider", "9router", "models", "a/deepseek-v4.1-flash:free", "limit", "context"]
    const updated = applyEdits(bare, modify(bare, path, 64_000, FORMAT))
    expect(JSON.parse(updated).provider["9router"].models["a/deepseek-v4.1-flash:free"].limit.context).toBe(64_000)
  })
})
