import { expect, describe } from "bun:test"
import { Effect, Layer, Stream } from "effect"
import { AppNodeBuilder } from "@opencode/core/effect/app-node-builder"
import { KV } from "@opencode/core/kv"
import { Loop } from "@opencode/core/loop"
import { Tool } from "@opencode/core/tool"
import { LoopTools } from "@opencode/core/tool/plugin/loop"
import { Session } from "@opencode/core/session"
import type { CommandDefinition, CommandInvocation } from "@opencode/plugin/effect/command"
import { LayerNode } from "@opencode/util/effect/layer-node"
import { testEffect } from "./lib/effect"
import { registerToolPlugin, toolNodeReplacements } from "./lib/tool"

const sessionID = Session.ID.make("ses_loop_command_test")
const loopLayer = Loop.layer.pipe(Layer.provide(LayerNode.compile(LayerNode.group([KV.node]))))
// registerToolPlugin resolves Tool.Service from the environment, so the harness
// needs the Tool node even though this test only exercises the command.
const it = testEffect(AppNodeBuilder.build(Tool.node, toolNodeReplacements()))

/**
 * Registers the plugin against a command editor that records what it adds, the
 * same shape tool-automation.test.ts uses, so the test runs the real command body
 * rather than a hand-built one.
 *
 * The invocation carries only the arguments: the TUI strips the command word
 * before it calls the server, so `text` here is what followed `/loop `.
 *
 * Replies are collected from `synthetic`, and `prompt` is a trap that fails the
 * test if it is called. A command's answer must never reach the model: `prompt` is
 * input to it, so a status line sent that way becomes the model's instruction —
 * which is the bug this pins.
 */
const withCommands = <A, E, R>(use: (commands: CommandDefinition[], replies: string[]) => Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const commands: CommandDefinition[] = []
    const replies: string[] = []
    yield* registerToolPlugin(LoopTools.Plugin, {
      event: { subscribe: () => Stream.never },
      command: {
        list: () => Effect.die("unused command.list"),
        reload: () => Effect.void,
        transform: (callback) => Effect.sync(() => callback({ add: (definition) => commands.push(definition) })),
      },
      session: {
        synthetic: ((input: { text: string }) =>
          Effect.sync(() => {
            replies.push(input.text)
          })) as never,
        prompt: (() =>
          Effect.die(
            "the /loop command must not prompt the model — a reply sent through prompt becomes the model's instruction",
          )) as never,
      },
    })
    return yield* use(commands, replies)
  })

const invoke = (commands: CommandDefinition[], text: string) =>
  commands
    .find((command) => command.name === "loop")!
    .execute({
      sessionID,
      prompt: { text },
      delivery: "steer",
    } as unknown as CommandInvocation)

const run = <A, E>(effect: Effect.Effect<A, E, Loop.Service>) => effect.pipe(Effect.provide(loopLayer))

describe("/loop command", () => {
  it.effect("a bare instruction starts an until-done loop", () =>
    run(
      withCommands((commands, replies) =>
        Effect.gen(function* () {
          const loop = yield* Loop.Service
          yield* invoke(commands, "fix the tests")
          const record = yield* loop.status(sessionID)
          expect(record?.mode).toBe("until-done")
          expect(record?.instruction).toBe("fix the tests")
          expect(replies.join(" ")).toContain("until it is done")
        }),
      ),
    ),
  )

  it.effect("an interval token starts an interval loop and keeps the instruction intact", () =>
    run(
      withCommands((commands, replies) =>
        Effect.gen(function* () {
          const loop = yield* Loop.Service
          yield* invoke(commands, "5m check the build")
          const record = yield* loop.status(sessionID)
          expect(record?.mode).toBe("interval")
          expect(record?.intervalMs).toBe(300_000)
          expect(record?.instruction).toBe("check the build")
          expect(replies.join(" ")).toContain("every 5m")
        }),
      ),
    ),
  )

  it.effect("stop ends the loop", () =>
    run(
      withCommands((commands) =>
        Effect.gen(function* () {
          const loop = yield* Loop.Service
          yield* invoke(commands, "keep going")
          yield* invoke(commands, "stop")
          expect((yield* loop.status(sessionID))?.endReason).toBe("stopped")
        }),
      ),
    ),
  )

  it.effect("starting over replaces the previous loop and says the old one was abandoned", () =>
    run(
      withCommands((commands, replies) =>
        Effect.gen(function* () {
          const loop = yield* Loop.Service
          yield* invoke(commands, "first")
          yield* invoke(commands, "second")
          const record = yield* loop.status(sessionID)
          expect(record?.instruction).toBe("second")
          expect(record?.iteration).toBe(0)
          expect(replies.at(-1)).toContain("abandoned")
        }),
      ),
    ),
  )

  it.effect("status reports the loop without changing it", () =>
    run(
      withCommands((commands, replies) =>
        Effect.gen(function* () {
          const loop = yield* Loop.Service
          yield* invoke(commands, "fix the tests")
          yield* invoke(commands, "status")
          expect((yield* loop.status(sessionID))?.instruction).toBe("fix the tests")
          expect(replies.at(-1)).toContain("fix the tests")
        }),
      ),
    ),
  )

  it.effect("a duration with no instruction is refused instead of starting a loop", () =>
    run(
      withCommands((commands, replies) =>
        Effect.gen(function* () {
          const loop = yield* Loop.Service
          yield* invoke(commands, "2h")
          expect(yield* loop.status(sessionID)).toBeUndefined()
          expect(replies.join(" ")).toContain("no instruction")
        }),
      ),
    ),
  )
})
