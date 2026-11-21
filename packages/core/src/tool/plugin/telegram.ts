export * as TelegramTools from "./telegram.js"

import { join } from "node:path"
import { Effect, Stream } from "effect"
import type { Context } from "@opencode/plugin/effect/plugin"
import { Global } from "@opencode/util/global"
import { Session } from "../../session.js"
import { createBot } from "../../telegram/bot.js"
import { createBridge } from "../../telegram/bridge.js"
import { load, paired } from "../../telegram/token.js"

// The Telegram bridge, as an internal plugin.
//
// Internal, not an external package: an external plugin only runs when the user
// lists it in config, and this one has to work the moment a token is paired. That
// was the bug — `telegram pair` stored a token and nothing ever read it, because
// the bridge lived in a package the config did not enable.
//
// The two loops are plain promises started with `void`, not fibers. They outlive
// the effect that starts them by design — they run until the process stops — and a
// fiber here would be tied to a plugin scope that ends as soon as setup returns.

const COMMANDS = [
  { name: "status", description: "what is running right now" },
  { name: "sessions", description: "recent sessions" },
  { name: "loop", description: "run an instruction on repeat, for example /loop 30s check the build" },
  { name: "stop", description: "stop the loop in a session" },
  { name: "help", description: "this list" },
]

const tokenPath = (data: string) => join(data, "telegram.json")

export const Plugin = {
  id: "opencode.telegram",
  effect: Effect.fn("TelegramTools.Plugin")(function* (ctx: Context) {
    const global = yield* Global.Service
    const path = tokenPath(global.data)
    const stored = yield* Effect.promise(() => load(path))
    process.stderr.write(`[telegram] token path ${path} paired=${stored !== undefined}\n`)
    // Nothing to do until a token is paired, which is the normal state.
    if (stored === undefined) return

    const sessions = yield* Session.Service
    const run = <A>(effect: Effect.Effect<A, unknown, never>) => Effect.runPromise(effect)
    const bot = createBot({ token: stored.token })

    const bridge = createBridge({
      bot,
      sessions: {
        prompt: async ({ sessionID, text }) => {
          await run(sessions.prompt({ sessionID: sessionID as never, text, delivery: "queue" }))
        },
        title: async (sessionID) => {
          const info = await run(sessions.get(sessionID as never).pipe(Effect.catch(() => Effect.void)))
          return (info as { title?: string } | undefined)?.title ?? ""
        },
      },
      chatID: stored.chatID,
      commands: COMMANDS,
      runCommand: async ({ name, rest }) => {
        // `list` answers `{ data, cursor }`, not an array. Casting the result made
        // every command read `list[0]` off an object and report no session.
        const page = await run(sessions.list({ limit: 10 }).pipe(Effect.catch(() => Effect.succeed({ data: [] }))))
        const list = (page as { data?: Array<{ id: string; title?: string }> }).data ?? []
        const target = list[0]?.id
        if (name === "help" || name === "sessions")
          return list.length === 0
            ? name === "help"
              ? COMMANDS.map((c) => `/${c.name} — ${c.description}`).join("\n")
              : "No sessions."
            : name === "help"
              ? COMMANDS.map((c) => `/${c.name} — ${c.description}`).join("\n")
              : list.map((s) => s.title || s.id).join("\n")
        if (target === undefined) return "No session to use. Open one in OpenMod first."
        if (name === "loop") {
          await run(sessions.command({ sessionID: target as never, command: "loop", text: rest }))
          return `Loop started in ${target}.`
        }
        if (name === "stop") {
          await run(sessions.command({ sessionID: target as never, command: "loop", text: "stop" }))
          return "Loop stopped."
        }
        return `${list.length} session(s). Newest: ${list[0].title || target}`
      },
    })

    // Started with `void` and never awaited: they run until the process stops. The
    // effect must return, or the plugin host waits forever on setup.
    void (async () => {
      await bot
        .setMyCommands(COMMANDS.map((c) => ({ command: c.name, description: c.description })))
        .catch(() => undefined)
    })()

    void (async () => {
      let offset = 0
      while (true) {
        const updates = await bot.getUpdates(offset).catch(() => [])
        for (const update of updates) {
          offset = update.update_id + 1
          const chatID = update.message?.chat.id
          const text = update.message?.text
          if (chatID === undefined || text === undefined) continue
          // Checked per message, not just at pair time: a bot's username is guessable.
          if (!paired(stored, chatID)) continue
          await bridge
            .receive({ chatID, text, replyTo: update.message?.reply_to_message?.message_id })
            .catch(() => undefined)
        }
      }
    })()

    // The event stream is consumed with Effect's runner, started through the same
    // `void` as the two loops above. `forkDaemon` would tie it to a plugin scope that
    // ends when setup returns, and its scope requirement cannot be satisfied here.
    void Effect.runPromise(
      ctx.event
        .subscribe()
        .pipe(
          Stream.runForEach((event: { type?: string; data?: Record<string, unknown> }) =>
            Effect.promise(async () => {
              const data = event.data
              const sessionID = typeof data?.sessionID === "string" ? data.sessionID : undefined
              if (sessionID === undefined) return
              // The event names and fields here are the schema's, not guesses:
              // `session.tool.called` carries no tool name, so the run is announced
              // from `session.tool.input.started`, which does.
              if (event.type === "session.tool.input.started") {
                const tool = typeof data?.name === "string" ? data.name : "a tool"
                await bridge.notify({ kind: "tool", sessionID, title: "", tool }).catch(() => undefined)
              }
              if (event.type === "session.execution.failed") {
                const error = data?.error as { message?: string } | undefined
                await bridge
                  .notify({ kind: "error", sessionID, title: "", message: error?.message ?? "failed" })
                  .catch(() => undefined)
              }
              if (event.type === "session.execution.interrupted" && data?.reason === "user")
                await bridge
                  .notify({ kind: "paused", sessionID, title: "", reason: "you stopped it" })
                  .catch(() => undefined)
              if (event.type === "session.status" && (data?.status as { type?: string } | undefined)?.type === "idle")
                await bridge
                  .notify({ kind: "finished", sessionID, title: "", summary: "stopped working" })
                  .catch(() => undefined)
            }),
          ),
        ),
    ).catch(() => undefined)
  }),
}
