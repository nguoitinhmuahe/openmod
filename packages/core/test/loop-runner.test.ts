import { expect } from "bun:test"
import { Effect, Fiber, Ref } from "effect"
import { Bus } from "@opencode/core/bus"
import { KV } from "@opencode/core/kv"
import { Loop } from "@opencode/core/loop"
import { awaitIdle, drive, type SessionPort } from "@opencode/core/loop/runner"
import { Session } from "@opencode/core/session"
import { SessionStatusEvent } from "@opencode/schema/session-status-event"
import { TestClock } from "effect/testing"
import { LayerNode } from "@opencode/util/effect/layer-node"
import { testEffect } from "./lib/effect"

const sessionID = Session.ID.make("ses_runner_test")

// Bus has no bare layer; tests build it from its node, listing the dependencies
// explicitly, exactly as wellknown.test.ts does with KV.node.
const busOnly = testEffect(LayerNode.compile(LayerNode.group([Bus.node])))
const withLoop = testEffect(LayerNode.compile(LayerNode.group([Bus.node, KV.node, Loop.node])))

/**
 * Counts prompts and stands in for the session runner.
 *
 * `messages` reports one tool call after the first prompt, so a run counts as
 * progress and the loop keeps cycling — these tests are about the driver's
 * timing, not the no-progress rule, which loop-progress.test.ts covers.
 */
const countingSession = Effect.gen(function* () {
  const sent = yield* Ref.make<string[]>([])
  const service: SessionPort = {
    prompt: (input) => Ref.update(sent, (all) => [...all, input.text]),
    messages: () =>
      Ref.get(sent).pipe(
        Effect.map((all) =>
          all.length === 0
            ? []
            : ([{ type: "assistant", content: [{ type: "tool", name: "bash", id: "t", state: {} }] }] as never),
        ),
      ),
  }
  return { service, sent }
})

/** Lets queued work run to its next suspension point without real time passing. */
const settle = Effect.yieldNow.pipe(Effect.andThen(Effect.yieldNow), Effect.andThen(Effect.yieldNow))

busOnly.effect("awaitIdle resolves for its own session and ignores another's idle", () =>
  Effect.gen(function* () {
    const bus = yield* Bus.Service
    const other = Session.ID.make("ses_other")
    const mine = Session.ID.make("ses_mine")

    // Another session going idle must not release this waiter; only its own idle does.
    const first = yield* awaitIdle(bus, mine).pipe(Effect.forkScoped)
    yield* Effect.yieldNow
    yield* bus.publish(SessionStatusEvent.Status, { sessionID: other, status: { type: "idle" } })
    yield* Effect.yieldNow
    expect(first.pollUnsafe()).toBeUndefined()

    yield* bus.publish(SessionStatusEvent.Status, { sessionID: mine, status: { type: "idle" } })
    yield* Fiber.join(first)
  }),
)

busOnly.effect("awaitIdle does not resolve on busy or retry", () =>
  Effect.gen(function* () {
    const bus = yield* Bus.Service
    const mine = Session.ID.make("ses_mine")

    const waiting = yield* awaitIdle(bus, mine).pipe(Effect.forkScoped)
    yield* Effect.yieldNow
    yield* bus.publish(SessionStatusEvent.Status, { sessionID: mine, status: { type: "busy" } })
    yield* bus.publish(SessionStatusEvent.Status, {
      sessionID: mine,
      status: { type: "retry", attempt: 1, message: "again", next: 1 },
    })
    yield* Effect.yieldNow
    // Still waiting: neither busy nor retry means the run is over.
    expect(waiting.pollUnsafe()).toBeUndefined()

    // The idle that follows does release it, which is what proves it was waiting on
    // the right thing rather than stuck.
    yield* bus.publish(SessionStatusEvent.Status, { sessionID: mine, status: { type: "idle" } })
    yield* Fiber.join(waiting)
  }),
)

withLoop.effect("an until-done loop dispatches one prompt per idle", () =>
  Effect.gen(function* () {
    const loop = yield* Loop.Service
    const bus = yield* Bus.Service
    const counting = yield* countingSession
    yield* loop.start({ sessionID, request: { kind: "start", mode: "until-done", instruction: "fix" } })
    yield* drive({ loop, sessions: counting.service, bus }).pipe(Effect.forkScoped)
    yield* settle
    // The first prompt goes out without waiting for an idle: the loop's first run
    // starts the session rather than reacting to it.
    expect(yield* Ref.get(counting.sent)).toEqual(["fix"])
    yield* bus.publish(SessionStatusEvent.Status, { sessionID, status: { type: "idle" } })
    yield* settle
    expect(yield* Ref.get(counting.sent)).toEqual(["fix", "fix"])
  }),
)

withLoop.effect("an interval loop waits out its interval before the next prompt", () =>
  Effect.gen(function* () {
    const loop = yield* Loop.Service
    const bus = yield* Bus.Service
    const counting = yield* countingSession
    yield* loop.start({
      sessionID,
      request: { kind: "start", mode: "interval", intervalMs: 300_000, instruction: "check" },
    })
    yield* drive({ loop, sessions: counting.service, bus }).pipe(Effect.forkScoped)
    yield* settle
    expect(yield* Ref.get(counting.sent)).toEqual(["check"])

    yield* bus.publish(SessionStatusEvent.Status, { sessionID, status: { type: "idle" } })
    yield* settle
    // Idle arrived immediately, but the interval has not elapsed, so nothing more is sent.
    expect(yield* Ref.get(counting.sent)).toEqual(["check"])

    yield* TestClock.adjust("300 seconds")
    yield* settle
    expect(yield* Ref.get(counting.sent)).toEqual(["check", "check"])
  }),
)
