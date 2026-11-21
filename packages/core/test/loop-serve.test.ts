import { expect, describe } from "bun:test"
import { Deferred, Effect, Ref } from "effect"
import { TestClock } from "effect/testing"
import { Bus } from "@opencode/core/bus"
import { KV } from "@opencode/core/kv"
import { Loop } from "@opencode/core/loop"
import { Session } from "@opencode/core/session"
import { SessionEvent } from "@opencode/schema/session-event"
import { SessionStatusEvent } from "@opencode/schema/session-status-event"
import { LayerNode } from "@opencode/util/effect/layer-node"
import { testEffect } from "./lib/effect"

const sessionID = Session.ID.make("ses_loop_wiring_test")
const it = testEffect(LayerNode.compile(LayerNode.group([Bus.node, KV.node, Loop.node])))

/** Counts what the driver dispatched to the model, and what it showed the user. */
const sessionStub = Effect.gen(function* () {
  const prompts = yield* Ref.make<string[]>([])
  const notices = yield* Ref.make<string[]>([])
  // A deferred that is replaced when it fires, so every wait can be released and the
  // next one still blocks. A single-shot deferred leaves the driver's second wait
  // hanging, and the loop never reaches its next iteration.
  const gate = yield* Ref.make(yield* Deferred.make<void>())
  return {
    port: {
      prompt: (input: { text: string }) => Ref.update(prompts, (all) => [...all, input.text]),
      messages: () => Effect.succeed([{ type: "assistant", content: [{ type: "tool", name: "bash" }] }] as never),
      notify: (input: { text: string }) => Ref.update(notices, (all) => [...all, input.text]),
      wait: () => Ref.get(gate).pipe(Effect.flatMap((d) => Deferred.await(d))),
    },
    prompts,
    notices,
    /** Marks the current run finished and arms the next wait. */
    finish: () =>
      Ref.get(gate).pipe(
        Effect.flatMap((d) => Deferred.succeed(d, undefined)),
        Effect.andThen(Deferred.make<void>()),
        Effect.flatMap((next) => Ref.set(gate, next)),
      ),
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
      const stub = yield* sessionStub
      yield* loop.start({ sessionID, request: { kind: "start", mode: "until-done", instruction: "keep at it" } })

      yield* loop.serve(stub.port).pipe(Effect.forkScoped)
      yield* Effect.yieldNow
      yield* Effect.yieldNow

      expect(yield* Ref.get(stub.prompts)).toEqual(["keep at it"])

      // The run finishes, so the next iteration starts. An idle event is not what the
      // driver waits on — that is what kept a finished run from advancing.
      yield* stub.finish()
      yield* Effect.yieldNow
      yield* Effect.yieldNow
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

  it.effect("a loop the model pauses during its interval wait stays paused", () =>
    Effect.gen(function* () {
      const loop = yield* Loop.Service
      const stub = yield* sessionStub
      yield* loop.start({
        sessionID,
        request: { kind: "start", mode: "interval", intervalMs: 30_000, instruction: "say ok" },
      })
      yield* loop.serve(stub.port).pipe(Effect.forkScoped)
      yield* Effect.yieldNow
      yield* Effect.yieldNow
      expect(yield* Ref.get(stub.prompts)).toEqual(["say ok"])

      // The run ends, so the driver enters its interval wait.
      yield* stub.finish()
      yield* Effect.yieldNow
      yield* Effect.yieldNow
      expect((yield* loop.status(sessionID))?.state).toBe("waiting")

      // Now the model pauses the loop — it does this after the run, while the driver
      // is sleeping out the interval. A real session did exactly this and the pause
      // was lost: the driver's own waiting record overwrote it, and the loop kept
      // sending "say ok" every 30 seconds with the tool reporting "Loop paused".
      yield* loop.stop(sessionID, "blocked", "not an actionable task")

      yield* TestClock.adjust("30 seconds")
      yield* Effect.yieldNow
      yield* Effect.yieldNow

      expect((yield* loop.status(sessionID))?.state).toBe("paused")
      expect((yield* loop.status(sessionID))?.endReason).toBe("blocked")
      expect(yield* Ref.get(stub.prompts)).toEqual(["say ok"])
    }),
  )

  it.effect("a loop the model completes mid-run stays ended", () =>
    Effect.gen(function* () {
      const loop = yield* Loop.Service
      const stub = yield* sessionStub
      yield* loop.start({ sessionID, request: { kind: "start", mode: "until-done", instruction: "write the file" } })

      // The model calls loop_complete partway through the run, which is how the tool is
      // actually used: it fires while the driver is still waiting.
      yield* loop.serve(stub.port).pipe(Effect.forkScoped)
      yield* Effect.yieldNow
      yield* Effect.yieldNow
      expect(yield* Ref.get(stub.prompts)).toEqual(["write the file"])

      yield* loop.stop(sessionID, "completed", "wrote the file")
      yield* stub.finish()
      yield* Effect.yieldNow
      yield* Effect.yieldNow
      yield* Effect.yieldNow

      // The driver must not write its own pre-completion record back over the ending.
      // That overwrite is what let a completed loop come back to life and re-send.
      expect((yield* loop.status(sessionID))?.state).toBe("ended")
      expect((yield* loop.status(sessionID))?.endReason).toBe("completed")
      expect(yield* Ref.get(stub.prompts)).toEqual(["write the file"])
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

  it.effect("a run the user interrupts ends the loop instead of re-sending it", () =>
    Effect.gen(function* () {
      const loop = yield* Loop.Service
      const bus = yield* Bus.Service
      const stub = yield* sessionStub
      yield* loop.start({ sessionID, request: { kind: "start", mode: "until-done", instruction: "spam me" } })
      yield* loop.serve(stub.port).pipe(Effect.forkScoped)
      yield* Effect.yieldNow
      yield* Effect.yieldNow

      // One run is out. The user presses Esc, which interrupts it — the event lands
      // while the driver is waiting, which is when it really happens.
      expect(yield* Ref.get(stub.prompts)).toEqual(["spam me"])
      yield* bus.publish(SessionEvent.Execution.Interrupted, { sessionID, reason: "user" } as never)
      yield* Effect.yieldNow
      // Release the wait so the driver reaches its decision, as an interrupted run does.
      yield* stub.finish()
      yield* Effect.yieldNow
      yield* Effect.yieldNow
      yield* Effect.yieldNow

      // The loop must end, not re-send. Esc used to look like a finished turn, so the
      // instruction came back every time the user interrupted it.
      expect(yield* Ref.get(stub.prompts)).toEqual(["spam me"])
      expect((yield* loop.status(sessionID))?.state).toBe("ended")
      expect((yield* loop.status(sessionID))?.endReason).toBe("interrupted")
    }),
  )
})
