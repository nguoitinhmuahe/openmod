import { Clock, Deferred, Effect, Ref } from "effect"
import { describe, expect } from "bun:test"
import { Bus } from "@opencode/core/bus"
import { KV } from "@opencode/core/kv"
import { Loop } from "@opencode/core/loop"
import { drive, type SessionPort } from "@opencode/core/loop/runner"
import { Session } from "@opencode/core/session"
import { LayerNode } from "@opencode/util/effect/layer-node"
import { TestClock } from "effect/testing"
import { testEffect } from "./lib/effect"

const sessionID = Session.ID.make("ses_interval_timing")
const it = testEffect(LayerNode.compile(LayerNode.group([Bus.node, KV.node, Loop.node])))

/**
 * The gap between one run ending and the next instruction going out.
 *
 * This is the check the earlier interval test missed: it stubbed `wait` with a
 * deferred and never exercised the record the driver writes, so it passed against a
 * driver that re-sent the instruction immediately. Real sessions showed sends 0.01s
 * apart for a `30s` loop.
 *
 * Each entry is the clock reading when an instruction was dispatched.
 */
const runs = Effect.gen(function* () {
  const sent = yield* Ref.make<Array<number>>([])
  const gate = yield* Ref.make(yield* Deferred.make<void>())
  const client: SessionPort = {
    prompt: (input) =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis
        yield* Ref.update(sent, (all) => [...all, now])
      }),
    messages: () => Effect.succeed([{ type: "assistant", content: [{ type: "tool", name: "bash" }] }] as never),
    wait: () => Ref.get(gate).pipe(Effect.flatMap((d) => Deferred.await(d))),
  }
  return {
    client,
    sent,
    /** Ends the current run and arms the next wait. */
    finish: () =>
      Ref.get(gate).pipe(
        Effect.flatMap((d) => Deferred.succeed(d, undefined)),
        Effect.andThen(Deferred.make<void>()),
        Effect.flatMap((next) => Ref.set(gate, next)),
      ),
  }
})

const settle = Effect.yieldNow.pipe(
  Effect.andThen(Effect.yieldNow),
  Effect.andThen(Effect.yieldNow),
  Effect.andThen(Effect.yieldNow),
)

describe("interval timing", () => {
  it.effect("waits the whole interval after a run ends, however long the run took", () =>
    Effect.gen(function* () {
      const loop = yield* Loop.Service
      const bus = yield* Bus.Service
      const stub = yield* runs
      yield* loop.start({
        sessionID,
        request: { kind: "start", mode: "interval", intervalMs: 30_000, instruction: "check" },
      })
      yield* drive({ loop, sessions: stub.client, bus }).pipe(Effect.forkScoped)
      yield* settle
      expect(yield* Ref.get(stub.sent)).toEqual([0])

      // The run works for 20 seconds, then ends. The 30-second interval is owed from
      // the end, so the next instruction is due at 50s, not at 30s.
      yield* TestClock.adjust("20 seconds")
      yield* stub.finish()
      yield* settle
      expect(yield* Ref.get(stub.sent)).toEqual([0])

      yield* TestClock.adjust("29 seconds")
      yield* settle
      expect(yield* Ref.get(stub.sent)).toEqual([0])

      yield* TestClock.adjust("1 second")
      yield* settle
      expect(yield* Ref.get(stub.sent)).toEqual([0, 50_000])
    }),
  )

  it.effect("a finished run does not send again before its interval", () =>
    Effect.gen(function* () {
      const loop = yield* Loop.Service
      const bus = yield* Bus.Service
      const stub = yield* runs
      yield* loop.start({
        sessionID,
        request: { kind: "start", mode: "interval", intervalMs: 30_000, instruction: "check" },
      })
      yield* drive({ loop, sessions: stub.client, bus }).pipe(Effect.forkScoped)
      yield* settle
      yield* stub.finish()
      yield* settle
      yield* settle
      // Back-to-back sends were the bug: a five-second run must not cause a second
      // instruction until the interval has passed.
      expect(yield* Ref.get(stub.sent)).toEqual([0])

      yield* TestClock.adjust("30 seconds")
      yield* settle
      expect((yield* Ref.get(stub.sent)).length).toBe(2)
      const [first, second] = yield* Ref.get(stub.sent)
      expect(second - first).toBeGreaterThanOrEqual(30_000)
    }),
  )
})
