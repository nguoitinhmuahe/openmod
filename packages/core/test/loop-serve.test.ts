import { expect, describe } from "bun:test"
import { Deferred, Effect, Ref } from "effect"
import { TestClock } from "effect/testing"
import { Bus } from "@opencode/core/bus"
import { KV } from "@opencode/core/kv"
import { Loop } from "@opencode/core/loop"
import { Session } from "@opencode/core/session"
import { SessionStatusEvent } from "@opencode/schema/session-status-event"
import { LayerNode } from "@opencode/util/effect/layer-node"
import { testEffect } from "./lib/effect"

const sessionID = Session.ID.make("ses_loop_wiring_test")
const it = testEffect(LayerNode.compile(LayerNode.group([Bus.node, KV.node, Loop.node])))

/** Counts what the driver dispatched to the model, and what it showed the user. */
const sessionStub = Effect.gen(function* () {
  const prompts = yield* Ref.make<string[]>([])
  const notices = yield* Ref.make<string[]>([])
  const release = yield* Deferred.make<void>()
  return {
    port: {
      prompt: (input: { text: string }) => Ref.update(prompts, (all) => [...all, input.text]),
      messages: () => Effect.succeed([{ type: "assistant", content: [{ type: "tool", name: "bash" }] }] as never),
      notify: (input: { text: string }) => Ref.update(notices, (all) => [...all, input.text]),
      // Blocks until the test releases it, standing in for a session that is busy.
      // A stub that resolved at once would let the driver spin through its whole
      // budget before the test could look, which is not what a real session does.
      wait: () => Deferred.await(release.pipe(Effect.orDie)),
    },
    prompts,
    notices,
    release,
  }
})

/**
 * The driver has to be started by someone, or /loop writes a record nothing acts on.
 *
 * `Loop.Service.serve` is that entry point: the process forks it the same way it
 * forks `Automation.Service.run`.
 */
describe("Loop.serve", () => {
  it.effect("picks up a loop already stored at boot", () =>
    Effect.gen(function* () {
      const loop = yield* Loop.Service
      const bus = yield* Bus.Service
      const stub = yield* sessionStub
      yield* loop.start({ sessionID, request: { kind: "start", mode: "until-done", instruction: "keep at it" } })

      yield* loop.serve(stub.port).pipe(Effect.forkScoped)
      yield* Effect.yieldNow
      yield* Effect.yieldNow

      expect(yield* Ref.get(stub.prompts)).toEqual(["keep at it"])

      yield* bus.publish(SessionStatusEvent.Status, { sessionID, status: { type: "idle" } })
      yield* Effect.yieldNow
      expect((yield* Ref.get(stub.prompts)).length).toBeGreaterThan(1)
    }),
  )

  it.effect("picks up a loop started after the driver is already running", () =>
    Effect.gen(function* () {
      const loop = yield* Loop.Service
      const stub = yield* sessionStub

      // The driver starts first, as it does at server boot, and finds nothing.
      yield* loop.serve(stub.port).pipe(Effect.forkScoped)
      yield* Effect.yieldNow
      yield* Effect.yieldNow
      expect(yield* Ref.get(stub.prompts)).toEqual([])

      // Only now does the user type /loop. This is the case that broke: a driver
      // that reads the store once at boot leaves every later loop unrun, and the
      // session receives the command's confirmation instead of its instruction.
      yield* loop.start({ sessionID, request: { kind: "start", mode: "until-done", instruction: "watch the build" } })
      // The driver picks up new loops on its sweep, so time has to pass for it to
      // look again. TestClock makes that instant instead of a real quarter second.
      yield* TestClock.adjust("1 second")
      yield* Effect.yieldNow
      yield* Effect.yieldNow

      expect(yield* Ref.get(stub.prompts)).toEqual(["watch the build"])
    }),
  )

  it.effect("does nothing when no loop is stored", () =>
    Effect.gen(function* () {
      const loop = yield* Loop.Service
      const stub = yield* sessionStub
      yield* loop.serve(stub.port).pipe(Effect.forkScoped)
      yield* Effect.yieldNow
      expect(yield* Ref.get(stub.prompts)).toEqual([])
    }),
  )

  it.effect("stops driving a loop the user stopped", () =>
    Effect.gen(function* () {
      const loop = yield* Loop.Service
      const stub = yield* sessionStub
      yield* loop.start({ sessionID, request: { kind: "start", mode: "until-done", instruction: "go" } })
      yield* loop.stop(sessionID, "stopped")
      yield* loop.serve(stub.port).pipe(Effect.forkScoped)
      yield* Effect.yieldNow
      yield* Effect.yieldNow
      // An ended loop is not picked up, so a stop survives a restart of the driver.
      expect(yield* Ref.get(stub.prompts)).toEqual([])
    }),
  )
})
