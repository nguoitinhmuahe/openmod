export * as LoopRunner from "./runner.js"

import { Clock, Effect, FiberMap, Queue, Scope, Stream } from "effect"
import type { SessionID } from "@opencode/schema/session-id"
import { SessionStatusEvent } from "@opencode/schema/session-status-event"
import type { Bus } from "../bus.js"
import type { Loop } from "../loop.js"
import type { SessionMessage } from "../session/message.js"
import { LoopProgress } from "./progress.js"
import { LoopState } from "./state.js"

/**
 * The slice of the session service the driver actually uses.
 *
 * It is deliberately this small: it is what a test can stub, and the real
 * `Session.Service` satisfies it structurally. Widening it would drag the whole
 * session graph into every runner test.
 */
export type SessionPort = {
  readonly prompt: (input: {
    sessionID: SessionID
    text: string
    delivery: "steer" | "queue"
  }) => Effect.Effect<void, unknown>
  /**
   * The session's messages. The driver snapshots them around each run so
   * `progressed` can tell a run that acted from one that only talked.
   */
  readonly messages: (sessionID: SessionID) => Effect.Effect<readonly SessionMessage.Info[], unknown>
}

/**
 * idleWaiter opens one subscription for a session and hands back a function that
 * waits for the next idle.
 *
 * A stream is lazy, so subscribing per iteration loses any idle published while
 * the driver is between runs and the loop stalls forever. Opening the
 * subscription once and draining it into an unbounded queue closes that window:
 * an idle that arrives early is buffered, not missed.
 *
 * The subscription is forked into the caller's scope, not this function's. A fork
 * here would be scoped to the `Effect.gen` that builds the waiter, and would be
 * interrupted the moment that effect returned the function.
 *
 * `busy` and `retry` are dropped rather than queued: a retry is the session still
 * working, and treating it as done would start the next run on top of the current
 * one.
 *
 * The payload is the event envelope, so the session and status live under `data`.
 */
export function idleWaiter(
  bus: Bus.Interface,
  sessionID: string,
): Effect.Effect<() => Effect.Effect<void>, never, Scope.Scope> {
  return Effect.gen(function* () {
    const queue = yield* Queue.unbounded<void>()
    const subscription = bus.subscribe(SessionStatusEvent.Status).pipe(
      Stream.filter((event) => event.data.sessionID === sessionID && event.data.status.type === "idle"),
      Stream.runForEach(() => Queue.offer(queue, undefined)),
    )
    // startImmediately, as model.ts and websearch.ts do: without it the subscriber
    // is not registered until the fiber first yields, and an idle published in that
    // window is dropped.
    yield* Effect.forkScoped(subscription, { startImmediately: true })
    return () => Queue.take(queue)
  })
}

/**
 * awaitIdle completes when a session goes idle.
 *
 * A one-shot convenience over {@link idleWaiter} for callers that only need to
 * wait once.
 */
export function awaitIdle(bus: Bus.Interface, sessionID: string): Effect.Effect<void, never, Scope.Scope> {
  return idleWaiter(bus, sessionID).pipe(Effect.flatMap((wait) => wait()))
}

/**
 * drive runs one session's loop until it ends, pauses, or is interrupted.
 *
 * One fiber per session lives in the map, so two drivers can never race the same
 * session — the second `drive` for a session replaces nothing and starts nothing.
 *
 * The order here is the whole design:
 *
 *  1. stamp `lastRunAt` and dispatch, so the interval is measured from when this
 *     run actually started rather than from an absent value;
 *  2. wait for idle, because a loop run is an ordinary turn and the next must not
 *     start on top of it;
 *  3. persist whatever `afterIdle` decided — it is pure, so nothing else would.
 *
 * Without step 3 an interval loop would compute a wait and throw it away, which is
 * the difference between a loop that repeats and one that runs once.
 */
/**
 * The loop methods the driver uses.
 *
 * Declared structurally rather than as `Loop.Interface`: the service builds its
 * interface and then attaches `serve`, which calls this function, so the driver
 * cannot reference `Interface` without a cycle. It also keeps a test able to pass
 * a hand-built loop.
 */
export type LoopPort = Pick<Loop.Interface, "status" | "put" | "list">

export function drive(input: { loop: LoopPort; sessions: SessionPort; bus: Bus.Interface }) {
  const run = (sessionID: SessionID) =>
    Effect.gen(function* () {
      // One subscription for the session's whole life: an idle published between
      // runs is buffered rather than missed, which is what would otherwise stall
      // the loop after its first dispatch.
      const waitForIdle = yield* idleWaiter(input.bus, sessionID)
        // Let the subscription fiber register before the first run is dispatched, or an
        // idle that arrives immediately after would be published with nobody listening.
        .pipe(Effect.tap(() => Effect.yieldNow))
      while (true) {
        const record = yield* input.loop.status(sessionID)
        if (record === undefined || record.state === "ended" || record.state === "paused") return

        // The clock, not Date.now: tests drive this with TestClock, and a wall-clock
        // read here would make every interval test sit for real seconds.
        const startedAt = yield* Clock.currentTimeMillis
        // Stamp before dispatch, and carry the stamped record into afterIdle: the
        // interval remainder is measured from when this run started, so passing the
        // unstamped record would always compute a full interval of remaining wait.
        const dispatched = { ...record, lastRunAt: startedAt }
        yield* input.loop.put(dispatched)
        // Snapshot before the run, so the messages it adds can be told apart from
        // the history that was already there.
        const before = yield* input.sessions.messages(sessionID)
        yield* input.sessions.prompt({ sessionID, text: record.instruction, delivery: "queue" })

        yield* waitForIdle()

        // A run that only wrote prose is not progress, and two of those in a row end
        // the loop rather than letting it spend its whole budget talking.
        const after = yield* input.sessions.messages(sessionID)
        const decision = LoopState.afterIdle(dispatched, {
          now: yield* Clock.currentTimeMillis,
          progressed: LoopProgress.progressed(before, after),
        })
        yield* input.loop.put(decision.record)
        if (decision.action === "end") return
        if (decision.action === "wait" && decision.waitMs !== undefined && decision.waitMs > 0)
          yield* Effect.sleep(decision.waitMs)
      }
    })

  return Effect.gen(function* () {
    // FiberMap scopes each driver: one fiber per session, so a second drive call for
    // the same session cannot produce a second loop prompting the same conversation.
    const drivers = yield* FiberMap.make<SessionID>()
    for (const record of yield* input.loop.list()) {
      const id = record.sessionID as SessionID
      if (record.state === "ended" || record.state === "paused") continue
      yield* FiberMap.run(drivers, id, run(id))
    }
    // Hold the scope open so the drivers keep running until the caller interrupts.
    yield* Effect.never
  }).pipe(Effect.orDie, Effect.scoped)
}
