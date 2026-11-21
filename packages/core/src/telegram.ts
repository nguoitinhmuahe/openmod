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

/**
 * What Telegram offers, and what each one does over chat.
 *
 * The rule for inclusion: a command belongs here if its whole effect can be
 * expressed as text back to the chat, or as one action on a session. Anything that
 * opens a dialog, needs a keypress, or renders a picker stays in the window — a
 * listed command that silently does nothing is worse than one that is absent.
 */
const COMMANDS = [
  { name: "help", description: "this list" },
  { name: "status", description: "which session is doing what" },
  { name: "sessions", description: "recent sessions" },
  { name: "use", description: "pick the session later commands act on: /use <number>" },
  { name: "messages", description: "the last few messages of the chosen session" },
  { name: "stop", description: "stop the run in the chosen session" },
  { name: "loop", description: "repeat an instruction, for example /loop 30s check the build" },
  { name: "unloop", description: "stop the loop in the chosen session" },
  { name: "compact", description: "summarize the chosen session now" },
  { name: "model", description: "the model the chosen session uses" },
  { name: "agents", description: "the agents available" },
  { name: "projects", description: "the projects opencode knows" },
  { name: "usage", description: "token use across sessions" },
  { name: "debug", description: "paths, database size, plugin count" },
]

// There is deliberately no dynamic menu here. `Command.Service` is a location node
// and this bridge is global, so it cannot read the app's registry without depending
// on a location. A command the user registers is still reachable — an unknown name
// falls through to `Session.command` below — it simply does not appear in Telegram's
// menu until it is listed above.

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
      // The session later commands act on. Chosen with `/use <number>`, so two sessions
      // can be driven without the bridge inferring from "most recent".
      let selected: string | undefined

      /** The facts `doctor` reports, in the same words, for the chat. */
      const debugLines = async (): Promise<string[]> => {
        const { gather } = await import("./doctor/checks.js")
        const report = await gather({ data: global.data, config: `${global.config}/opencode.json`, database: "" })
        return report.checks.map((check) => `${check.status.toUpperCase().padEnd(4)} ${check.name}: ${check.detail}`)
      }

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
          // The session every command acts on. `/use <n>` moves it, so a second
          // session can be driven without the bridge guessing from "most recent".
          const list = (await page()).data
          const chosen = () => list.find((s) => s.id === selected) ?? list[0]
          const target = () => chosen()?.id

          if (name === "help")
            return COMMANDS.map((c) => `/${c.name} — ${c.description}`).join("\n")
          if (name === "sessions") {
            if (list.length === 0) return "No sessions."
            return list
              .map((s, index) => `${index + 1}. ${s.title || s.id}${s.id === target() ? "  ←" : ""}`)
              .join("\n")
          }
          if (name === "use") {
            const index = Number(rest.trim()) - 1
            const pick = list[index]
            if (pick === undefined) return `Pick 1..${list.length} — see /sessions.`
            selected = pick.id
            return `Now acting on ${pick.title || pick.id}.`
          }
          if (name === "usage") {
            const totals = list.reduce(
              (sum, s) => {
                const t = (s as { tokens?: { input?: number; output?: number } }).tokens
                return { input: sum.input + (t?.input ?? 0), output: sum.output + (t?.output ?? 0) }
              },
              { input: 0, output: 0 },
            )
            return `${list.length} session(s). Tokens in ${totals.input.toLocaleString()}, out ${totals.output.toLocaleString()}.`
          }
          if (name === "debug")
            return (await debugLines()).join("\n")

          const id = target()
          if (id === undefined) return "No session to use. Open one in OpenMod first."

          if (name === "status") {
            const active = await run(sessions.active.pipe(Effect.catch(() => Effect.succeed(new Set<string>()))))
            const busy = (active as ReadonlySet<string>).has(id)
            const c = chosen()!
            return `${c.title || c.id} — ${busy ? "running" : "idle"}`
          }
          if (name === "stop") {
            await run(sessions.interrupt(id as never))
            return "Stopped the run."
          }
          if (name === "messages") {
            const rows = await run(
              sessions
                .messages({ sessionID: id as never, limit: 6, order: "desc" })
                .pipe(Effect.catch(() => Effect.succeed([]))),
            )
            const recent = (rows as Array<{ type?: string; text?: string }>).reverse()
            if (recent.length === 0) return "No messages yet."
            return recent
              .map((m) => {
                const body = (m.text ?? "").replace(/\s+/g, " ").trim()
                const label = m.type === "user" ? "you" : m.type === "assistant" ? "agent" : m.type
                return `${label}: ${body === "" ? "(no text)" : body.slice(0, 200)}`
              })
              .join("\n")
          }
          if (name === "model") {
            const info = await run(sessions.get(id as never).pipe(Effect.catch(() => Effect.void)))
            const m = (info as { model?: { providerID?: string; id?: string } } | undefined)?.model
            return m === undefined ? "No model recorded." : `${m.providerID}/${m.id}`
          }
          if (name === "agents") {
            return "Agents are chosen in the window; the TUI has the full list. Telegram sends prompts to whichever agent the session already uses."
          }
          if (name === "projects")
            return "Projects need the location service, which this bridge does not hold. Use /sessions; each line names its session."
          if (name === "loop") {
            await run(sessions.command({ sessionID: id as never, command: "loop", text: rest }))
            return `Loop started in ${chosen()!.title || id}.`
          }
          if (name === "unloop") {
            await run(sessions.command({ sessionID: id as never, command: "loop", text: "stop" }))
            return "Loop stopped."
          }
          if (name === "compact") {
            await run(sessions.compact({ sessionID: id as never }).pipe(Effect.catch(() => Effect.void)))
            return "Compaction started."
          }
          // Anything else the app registers — `/goal`, `/init`, `/review`, and the
          // user's own commands — is dispatched by name, so a command added to the
          // window is reachable here without this list naming it.
          await run(
            sessions
              .command({ sessionID: id as never, command: name, text: rest })
              .pipe(Effect.catch(() => Effect.fail(new Error("unknown")))),
          ).catch(() => undefined)
          return `Sent /${name} to ${chosen()!.title || id}.`
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
