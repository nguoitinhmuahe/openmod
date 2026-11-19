export * as Loop from "./loop.js"

import { Clock, Context, Effect, Layer } from "effect"
import type { SessionID } from "@opencode/schema/session-id"
import { makeGlobalNode } from "@opencode/util/effect/app-node"
import { KV } from "./kv.js"
import { LoopState } from "./loop/state.js"
import { LoopStore } from "./loop/store.js"
import type { Request } from "./loop/parse.js"

export type { Record } from "./loop/state.js"

export interface Interface {
  readonly start: (input: {
    sessionID: SessionID
    request: Extract<Request, { kind: "start" }>
  }) => Effect.Effect<LoopState.Record>
  readonly status: (sessionID: SessionID) => Effect.Effect<LoopState.Record | undefined>
  /**
   * Every stored loop, so a driver can pick up loops that outlived a restart
   * rather than only the ones started in this process.
   */
  readonly list: () => Effect.Effect<LoopState.Record[]>
  /**
   * Persists a record the caller already transitioned.
   *
   * `afterIdle` is pure and returns the next record; the driver is what writes it
   * back, and what stamps `lastRunAt` at dispatch. Without this method those
   * transitions would never reach the store.
   */
  readonly put: (record: LoopState.Record) => Effect.Effect<void>
  readonly stop: (
    sessionID: SessionID,
    reason: LoopState.EndReason,
    note?: string,
  ) => Effect.Effect<LoopState.Record | undefined>
  /** Clears a paused loop's ending so the driver picks it up again where it stopped. */
  readonly resume: (sessionID: SessionID) => Effect.Effect<LoopState.Record | undefined>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/Loop") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const kv = yield* KV.Service
    const clock = yield* Clock.Clock

    const read = (sessionID: SessionID) => kv.get(LoopStore.keyFor(sessionID)).pipe(Effect.map(LoopStore.decode))

    const write = (record: LoopState.Record) => kv.set(LoopStore.keyFor(record.sessionID), LoopStore.encode(record))

    return Service.of({
      start: Effect.fn("Loop.start")(function* (input) {
        const record = LoopState.start({
          sessionID: input.sessionID,
          request: input.request,
          now: clock.currentTimeMillisUnsafe(),
        })
        yield* write(record)
        return record
      }),
      status: Effect.fn("Loop.status")(function* (sessionID) {
        return yield* read(sessionID)
      }),
      list: Effect.fn("Loop.list")(function* () {
        const scanned = yield* kv.scan({ prefix: "loop:" })
        return scanned.entries.flatMap((entry) => {
          const record = LoopStore.decode(entry.value)
          return record === undefined ? [] : [record]
        })
      }),
      put: Effect.fn("Loop.put")(function* (record) {
        yield* write(record)
      }),
      stop: Effect.fn("Loop.stop")(function* (sessionID, reason, note) {
        const current = yield* read(sessionID)
        if (current === undefined) return undefined
        const stopped = LoopState.end(current, reason, note)
        yield* write(stopped)
        return stopped
      }),
      resume: Effect.fn("Loop.resume")(function* (sessionID) {
        const current = yield* read(sessionID)
        // Only a paused loop can be resumed; a completed or stopped one stays ended.
        if (current === undefined || current.state !== "paused") return current
        const { endReason: _reason, note: _note, ...rest } = current
        const resumed: LoopState.Record = { ...rest, state: "running", noProgress: 0 }
        yield* write(resumed)
        return resumed
      }),
    })
  }),
)

export const node = makeGlobalNode({ service: Service, layer, deps: [KV.node] })
