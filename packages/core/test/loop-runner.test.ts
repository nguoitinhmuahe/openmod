import { expect } from "bun:test"
import { Deferred, Effect, Fiber, Ref } from "effect"
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
  // Busy until the test finishes the run, so a test can place the end of a run at a
  // chosen moment. The interval is measured from there, which is what these check.
  const gate = yield* Ref.make(yield* Deferred.make<void>())
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
    wait: () => Ref.get(gate).pipe(Effect.flatMap((d) => Deferred.await(d))),
    // Never already busy: these stubs model a session the driver starts itself.
    active: () => Effect.succeed(false),
  }
  return {
    service,
    sent,
    /** Marks the current run finished and arms the next wait. */
    finish: () =>
      Ref.get(gate).pipe(
        Effect.flatMap((d) => Deferred.succeed(d, undefined)),
        Effect.andThen(Deferred.make<void>()),
        Effect.flatMap((next) => Ref.set(gate, next)),
      ),
  }
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

withLoop.effect("an until-done loop starts the next run as soon as one finishes", () =>
  Effect.gen(function* () {
    const loop = yield* Loop.Service
    const bus = yield* Bus.Service
    const counting = yield* countingSession
    yield* loop.start({ sessionID, request: { kind: "start", mode: "until-done", instruction: "fix" } })
    yield* drive({ loop, sessions: counting.service, bus }).pipe(Effect.forkScoped)
    yield* settle
    expect(yield* Ref.get(counting.sent)).toEqual(["fix"])

    // The run ends, so the next starts with no clock involved.
    yield* counting.finish()
    yield* settle
    const dispatched = yield* Ref.get(counting.sent)
    expect(dispatched.length).toBeGreaterThan(1)
    expect(dispatched.every((text) => text === "fix")).toBe(true)
  }),
)

withLoop.effect("an interval loop counts the interval from when the run ended", () =>
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

    // Let the run finish after five minutes of work. Measured from the dispatch, only
    // five of the ten minutes would remain; measured from the finish, a full ten are
    // still owed. The loop must count from the finish, so nothing goes out yet.
    yield* TestClock.adjust("5 minutes")
    yield* counting.finish()
    yield* settle
    expect(yield* Ref.get(counting.sent)).toEqual(["check"])

    yield* TestClock.adjust("299 seconds")
    yield* settle
    expect(yield* Ref.get(counting.sent)).toEqual(["check"])

    yield* TestClock.adjust("1 second")
    yield* settle
    expect(yield* Ref.get(counting.sent)).toEqual(["check", "check"])
  }),
)
