import { expect, describe } from "bun:test"
import { Effect, Ref } from "effect"
import { Bus } from "@opencode/core/bus"
import { KV } from "@opencode/core/kv"
import { Loop } from "@opencode/core/loop"
import { Session } from "@opencode/core/session"
import { SessionStatusEvent } from "@opencode/schema/session-status-event"
import { LayerNode } from "@opencode/util/effect/layer-node"
import { testEffect } from "./lib/effect"

const sessionID = Session.ID.make("ses_loop_wiring_test")
const it = testEffect(LayerNode.compile(LayerNode.group([Bus.node, KV.node, Loop.node])))

/**
 * The driver has to be started by someone, or /loop writes a record nothing acts on.
 *
 * `Loop.Service.serve` is that entry point: the process forks it the same way it
 * forks `Automation.Service.run`. This test proves a loop already in the store is
 * picked up and prompted without any further call — which is exactly what a
 * restarted process must do for a loop that outlived it.
 */
describe("Loop.serve", () => {
  it.effect("picks up a stored loop and dispatches it", () =>
    Effect.gen(function* () {
      const loop = yield* Loop.Service
      const bus = yield* Bus.Service
      const sent = yield* Ref.make<string[]>([])
      yield* loop.start({ sessionID, request: { kind: "start", mode: "until-done", instruction: "keep at it" } })

      const sessions = {
        prompt: (input: { text: string }) => Ref.update(sent, (all) => [...all, input.text]),
        messages: () => Effect.succeed([{ type: "assistant", content: [{ type: "tool", name: "bash" }] }] as never),
      }

      // serve takes the session port so the process can hand it the real Session.Service.
      yield* loop.serve(sessions).pipe(Effect.forkScoped)
      yield* Effect.yieldNow
      yield* Effect.yieldNow

      // No caller dispatched anything: the loop in the store is what caused the prompt.
      expect(yield* Ref.get(sent)).toEqual(["keep at it"])

      yield* bus.publish(SessionStatusEvent.Status, { sessionID, status: { type: "idle" } })
      yield* Effect.yieldNow
      expect((yield* Ref.get(sent)).length).toBeGreaterThan(1)
    }),
  )

  it.effect("does nothing when no loop is stored", () =>
    Effect.gen(function* () {
      const loop = yield* Loop.Service
      const sent = yield* Ref.make<string[]>([])
      const sessions = {
        prompt: (input: { text: string }) => Ref.update(sent, (all) => [...all, input.text]),
        messages: () => Effect.succeed([] as never),
      }
      yield* loop.serve(sessions).pipe(Effect.forkScoped)
      yield* Effect.yieldNow
      expect(yield* Ref.get(sent)).toEqual([])
    }),
  )

  it.effect("stops driving a loop the user stopped", () =>
    Effect.gen(function* () {
      const loop = yield* Loop.Service
      const sent = yield* Ref.make<string[]>([])
      const sessions = {
        prompt: (input: { text: string }) => Ref.update(sent, (all) => [...all, input.text]),
        messages: () => Effect.succeed([] as never),
      }
      yield* loop.start({ sessionID, request: { kind: "start", mode: "until-done", instruction: "go" } })
      yield* loop.stop(sessionID, "stopped")
      yield* loop.serve(sessions).pipe(Effect.forkScoped)
      yield* Effect.yieldNow
      yield* Effect.yieldNow
      // An ended loop is not picked up, so a stop survives a restart of the driver.
      expect(yield* Ref.get(sent)).toEqual([])
    }),
  )
})
