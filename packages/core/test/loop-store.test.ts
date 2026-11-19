import { expect, test } from "bun:test"
import { Effect, Layer } from "effect"
import { KV } from "@opencode/core/kv"
import { Loop } from "@opencode/core/loop"
import { decode, encode, keyFor } from "@opencode/core/loop/store"
import { memoryKV } from "./lib/kv"

// provideMerge, not provide: the tests read KV directly, so the in-memory store
// must stay visible outside the Loop layer as well as satisfy it.
// Clock is a Context.Reference with a default in Effect 4, so it needs no layer.
const layer = Loop.layer.pipe(Layer.provideMerge(memoryKV))

test("a started loop is stored under the session's own key", () =>
  Effect.gen(function* () {
    const loop = yield* Loop.Service
    const kv = yield* KV.Service
    yield* loop.start({
      sessionID: "ses_one" as never,
      request: { kind: "start", mode: "until-done", instruction: "fix" },
    })
    expect(yield* kv.get("loop:ses_one")).toBeDefined()
    expect(yield* kv.get("loop:ses_two")).toBeUndefined()
  }).pipe(Effect.provide(layer), Effect.runPromise))

test("a loop survives a restart of the service", () =>
  Effect.gen(function* () {
    const loop = yield* Loop.Service
    const started = yield* loop.start({
      sessionID: "ses_one" as never,
      request: { kind: "start", mode: "until-done", instruction: "fix" },
    })
    // Re-reading proves the record lives in the store, not in the service's memory,
    // which is what lets a restarted process pick the loop back up.
    const again = yield* loop.status("ses_one" as never)
    expect(again?.instruction).toBe("fix")
    expect(again?.iteration).toBe(started.iteration)
  }).pipe(Effect.provide(layer), Effect.runPromise))

test("stopping records why and leaves the record readable", () =>
  Effect.gen(function* () {
    const loop = yield* Loop.Service
    yield* loop.start({
      sessionID: "ses_one" as never,
      request: { kind: "start", mode: "until-done", instruction: "fix" },
    })
    yield* loop.stop("ses_one" as never, "stopped")
    const after = yield* loop.status("ses_one" as never)
    expect(after?.state).toBe("ended")
    expect(after?.endReason).toBe("stopped")
  }).pipe(Effect.provide(layer), Effect.runPromise))

test("a blocked loop can be resumed at the iteration it stopped on", () =>
  Effect.gen(function* () {
    const loop = yield* Loop.Service
    yield* loop.start({
      sessionID: "ses_one" as never,
      request: { kind: "start", mode: "until-done", instruction: "fix" },
    })
    yield* loop.stop("ses_one" as never, "blocked", "needs a credential")
    const resumed = yield* loop.resume("ses_one" as never)
    expect(resumed?.state).toBe("running")
    expect(resumed?.instruction).toBe("fix")
    expect(resumed?.endReason).toBeUndefined()
  }).pipe(Effect.provide(layer), Effect.runPromise))

test("put persists a transition the caller made, including lastRunAt", () =>
  Effect.gen(function* () {
    const loop = yield* Loop.Service
    const started = yield* loop.start({
      sessionID: "ses_one" as never,
      request: { kind: "start", mode: "interval", intervalMs: 300_000, instruction: "check" },
    })
    yield* loop.put({ ...started, iteration: 1, lastRunAt: 5_000 })
    const after = yield* loop.status("ses_one" as never)
    expect(after?.iteration).toBe(1)
    expect(after?.lastRunAt).toBe(5_000)
  }).pipe(Effect.provide(layer), Effect.runPromise))

test("keyFor and decode reject a foreign row instead of throwing", () => {
  expect(keyFor("ses_one")).toBe("loop:ses_one")
  expect(decode({ nonsense: true })).toBeUndefined()
  expect(
    decode(
      encode({
        sessionID: "s",
        mode: "until-done",
        instruction: "i",
        iteration: 0,
        startedAt: 0,
        noProgress: 0,
        state: "running",
      }),
    ),
  ).toBeDefined()
})
