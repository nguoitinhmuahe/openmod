import { expect, describe } from "bun:test"
import { Effect, Layer } from "effect"
import { AppNodeBuilder } from "@opencode/core/effect/app-node-builder"
import { KV } from "@opencode/core/kv"
import { Loop } from "@opencode/core/loop"
import { Tool } from "@opencode/core/tool"
import { Session } from "@opencode/core/session"
import { LoopTools } from "@opencode/core/tool/plugin/loop"
import { LayerNode } from "@opencode/util/effect/layer-node"
import { testEffect } from "./lib/effect"
import { registerToolPlugin, toolIdentity, toolNodeReplacements } from "./lib/tool"

const sessionID = Session.ID.make("ses_loop_tool_test")
const loopLayer = Loop.layer.pipe(Layer.provide(LayerNode.compile(LayerNode.group([KV.node]))))
const it = testEffect(AppNodeBuilder.build(Tool.node, toolNodeReplacements()))

/**
 * Calls one loop tool directly, the way a model does when Code Mode is denied.
 * Mirrors `direct` in tool-automation.test.ts: the registered name carries the
 * `opencode` namespace, and the deny ruleset forces the direct path.
 */
const direct = (registry: Tool.Interface, name: string, input: unknown) =>
  registry.snapshot([{ action: "execute", resource: "*", effect: "deny" }]).pipe(
    Effect.flatMap((tools) =>
      tools.execute({
        sessionID,
        ...toolIdentity,
        call: { type: "tool-call", id: `call-${name}`, name: `opencode_${name}`, input },
      }),
    ),
  )

/**
 * The plugin registers a slash command alongside its tools, so the harness must
 * accept a command editor even though these tests only exercise the tools.
 */
const register = () =>
  registerToolPlugin(LoopTools.Plugin, {
    command: {
      list: () => Effect.die("unused command.list"),
      reload: () => Effect.void,
      transform: (callback) => Effect.sync(() => callback({ add: () => {} })),
    },
  })

describe("loop tools", () => {
  it.effect("loop_complete ends the loop as completed and keeps the summary", () =>
    Effect.gen(function* () {
      const loop = yield* Loop.Service
      yield* loop.start({ sessionID, request: { kind: "start", mode: "until-done", instruction: "x" } })
      yield* register()
      yield* direct(yield* Tool.Service, "loop_complete", { summary: "build is green" })
      const after = yield* loop.status(sessionID)
      expect(after?.state).toBe("ended")
      expect(after?.endReason).toBe("completed")
      expect(after?.note).toBe("build is green")
    }).pipe(Effect.provide(loopLayer)),
  )

  it.effect("loop_blocked pauses the loop and carries the reason", () =>
    Effect.gen(function* () {
      const loop = yield* Loop.Service
      yield* loop.start({ sessionID, request: { kind: "start", mode: "until-done", instruction: "x" } })
      yield* register()
      yield* direct(yield* Tool.Service, "loop_blocked", { reason: "needs a credential" })
      const after = yield* loop.status(sessionID)
      expect(after?.state).toBe("paused")
      expect(after?.endReason).toBe("blocked")
      expect(after?.note).toBe("needs a credential")
    }).pipe(Effect.provide(loopLayer)),
  )

  it.effect("a completion after a stop does not resurrect the loop", () =>
    Effect.gen(function* () {
      const loop = yield* Loop.Service
      yield* loop.start({ sessionID, request: { kind: "start", mode: "until-done", instruction: "x" } })
      yield* loop.stop(sessionID, "stopped")
      yield* register()
      yield* direct(yield* Tool.Service, "loop_complete", {})
      expect((yield* loop.status(sessionID))?.endReason).toBe("stopped")
    }).pipe(Effect.provide(loopLayer)),
  )
})
