export * as Telegram from "./telegram.js"


import { Context, Effect, Layer, Scope } from "effect"
import { Node, makeGlobalNode } from "@opencode/util/effect/app-node"
import { LayerNode } from "@opencode/util/effect/layer-node"
import { Global } from "@opencode/util/global"
import { SessionEvent } from "@opencode/schema/session-event"
import { Bus } from "./bus.js"
import { Session } from "./session.js"
import { createBot } from "./telegram/bot.js"
import { createBridge } from "./telegram/bridge.js"
import { load, paired, pathFor } from "./telegram/token.js"

// The Telegram bridge, as a global service.
//
// Global, not a plugin, and that is the whole reason it works: `Bus.subscribe` wraps
// every stream in a filter keyed to `Location.Service` (bus.ts), so a subscriber that
// runs inside a location sees only that location's events. A plugin runs inside one,
// which is why the bridge heard nothing while the session next to it published tool
// events. `Automation` and `Loop` are global nodes for the same reason, and both work.
//
// The two loops are forked into the application scope by the process, so they live as
// long as the server does.

const COMMANDS = [
  { name: "status", description: "what is running right now" },
  { name: "sessions", description: "recent sessions" },
  { name: "loop", description: "run an instruction on repeat, for example /loop 30s check the build" },
  { name: "stop", description: "stop the loop in a session" },
  { name: "help", description: "this list" },
]

export interface Interface {
  /** Runs until the scope closes. Pairing is read once at startup. */
  readonly serve: Effect.Effect<void, never, Scope.Scope>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/Telegram") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const global = yield* Global.Service
    const sessions = yield* Session.Service
    const bus = yield* Bus.Service

    const serve = Effect.gen(function* () {
      const path = pathFor(global.data)
      const stored = yield* Effect.promise(() => load(path))
      // Nothing to do until a token is paired, which is the normal state.
      if (stored === undefined) {
        yield* Effect.logInfo("telegram not paired; bridge idle")
        return
      }
      yield* Effect.logInfo("telegram bridge serving", { chat: stored.chatID })

      const bot = createBot({ token: stored.token })
      const run = <A, E>(effect: Effect.Effect<A, E, never>) => Effect.runPromise(effect)
      const page = () =>
        run(
          sessions.list({ limit: 10 }).pipe(
            Effect.catch(() => Effect.succeed({ data: [] as Array<{ id: string; title?: string }> })),
          ),
        )

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
          const list = (await page()).data
          const target = list[0]?.id
          if (name === "help") return COMMANDS.map((c) => `/${c.name} — ${c.description}`).join("\n")
          if (name === "sessions")
            return list.length === 0 ? "No sessions." : list.map((s) => s.title || s.id).join("\n")
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

      // The menu is republished on every start, so a command added by an update appears
      // without re-pairing.
      //
      // Guarded with `ignore` rather than `catch`: a rejection from `Effect.promise`
      // arrives as a defect, which `Effect.catch` does not see, so the whole `serve`
      // used to die here — before the subscriptions below ever started. That is exactly
      // what the log showed: "bridge serving" with nothing after it.
      yield* Effect.promise(() =>
        bot.setMyCommands(COMMANDS.map((c) => ({ command: c.name, description: c.description }))),
      ).pipe(Effect.ignore)

      // Session activity in, through `listen` rather than `subscribe`.
      //
      // `subscribe` wraps the stream in `bus.ts`'s `local()`, which filters events by
      // `Location.Ref` whenever its own context carries a `Location.Service`; `listen`
      // pushes straight into the bus's listener list and is never filtered. `EventFeed`
      // — the feed the TUI reads — uses `listen` for that reason, and this bridge wants
      // the same unfiltered view. Relying on the global-node placement to keep Location
      // out of the subscriber's context was an assumption, not a guarantee.
      yield* bus.listen((event) =>
        Effect.sync(() => {
          const data = event.data as {
            sessionID?: string
            name?: string
            error?: { message?: string }
            reason?: string
          }
          const sessionID = data?.sessionID
          if (sessionID === undefined) return
          if (event.type === SessionEvent.Tool.Input.Started.type) {
            const tool = data.name ?? "a tool"
            void bridge
              .notify({ kind: "tool", sessionID, title: "", tool })
              .then(() => Effect.runSync(Effect.logInfo("telegram notified a tool", { tool, sessionID })))
              .catch((error) => Effect.runSync(Effect.logError("telegram notify failed", { error: String(error) })))
          } else if (event.type === SessionEvent.Execution.Succeeded.type) {
            // The run is over. Saying so is not a courtesy: the bridge counts a run's
            // tool calls to keep them from becoming one message each, and that count is
            // only cleared by a finishing notice. Without this the first tool call of a
            // session silenced every later one, for the life of the process.
            void bridge
              .notify({ kind: "finished", sessionID, title: "", summary: "done" })
              .catch((error) => Effect.runSync(Effect.logError("telegram notify failed", { error: String(error) })))
          } else if (event.type === SessionEvent.Execution.Failed.type) {
            void bridge
              .notify({ kind: "error", sessionID, title: "", message: data.error?.message ?? "failed" })
              .catch(() => undefined)
          } else if (event.type === SessionEvent.Execution.Interrupted.type && data.reason === "user") {
            void bridge
              .notify({ kind: "paused", sessionID, title: "", reason: "you stopped it" })
              .catch(() => undefined)
          }
        }),
      )
      yield* Effect.logInfo("telegram watching session events")

      // Long-poll for messages, forked into the process scope so it runs alongside the
      // event subscription rather than replacing it.
      //
      // The loop is stoppable and backs off. A bare `while (true)` inside
      // `Effect.promise` survives the scope it was forked into: interrupting the Effect
      // abandons the await but leaves the JavaScript loop polling, so it kept writing
      // to the terminal after the window closed. And with no delay on failure, a revoked
      // token meant the same request as fast as HTTPS would answer.
      yield* Effect.acquireRelease(
        Effect.sync(() => new AbortController()),
        (controller) => Effect.sync(() => controller.abort()),
      ).pipe(
        Effect.flatMap((controller) =>
          Effect.promise(async () => {
            let offset = 0
            while (!controller.signal.aborted) {
              const updates = await bot.getUpdates(offset, controller.signal).catch(() => {
                // A failure here is usually the network or a revoked token. Waiting is
                // what keeps it from becoming a hot loop; the loop ends when the scope
                // does.
                return undefined
              })
              if (updates === undefined) {
                if (controller.signal.aborted) break
                await Bun.sleep(5_000)
                continue
              }
              for (const update of updates) {
                if (controller.signal.aborted) break
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
          }),
        ),
        Effect.forkScoped,
      )
      yield* Effect.never
    })

    return Service.of({ serve })
  }),
)

// Global, like Automation and Loop: a location-scoped node would filter its own events.
export const node: LayerNode.Provider<Service, never, typeof Node.tags.values.global> = makeGlobalNode({
  service: Service,
  layer,
  deps: [Bus.node, Session.node, Global.node],
})
