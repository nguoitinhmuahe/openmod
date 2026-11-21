// Wires the Telegram bridge to the plugin host.
//
// This is the only file that knows Telegram exists: everything it uses is already
// tested on its own, and this file's job is to hand the real bot, the real session
// and the real event stream to them.
//
// The bridge runs inside the server process, not the terminal, so it keeps working
// with the window closed and reconnects on restart without pairing again.

import { homedir } from "node:os"
import { join } from "node:path"
import type { PluginContext } from "../plugin.ts"
import { createBot } from "./bot.ts"
import { createBridge } from "./bridge.ts"
import { load, save, paired } from "./token.ts"

/** Where the token lives: beside the rest of OpenMod's data, not in config. */
const tokenPath = () => join(process.env.OPENCODE_DATA ?? join(homedir(), ".local", "share", "opencode"), "telegram.json")

const COMMANDS = [
  { name: "status", description: "what is running right now" },
  { name: "sessions", description: "recent sessions" },
  { name: "loop", description: "run an instruction on repeat, for example /loop 30s check the build" },
  { name: "stop", description: "stop the loop in a session" },
  { name: "help", description: "this list" },
]

export async function setup(ctx: PluginContext) {
  const path = tokenPath()
  const stored = await load(path)
  if (stored === undefined) return

  const bot = createBot({ token: stored.token })
  const bridge = createBridge({
    bot,
    sessions: {
      prompt: async ({ sessionID, text }) => {
        await ctx.session.prompt({ sessionID: sessionID as never, text, delivery: "queue" })
      },
      title: async (sessionID) => {
        const info = await ctx.session.get({ sessionID: sessionID as never }).catch(() => undefined)
        return info?.title ?? ""
      },
    },
    chatID: stored.chatID,
    commands: COMMANDS,
    runCommand: async ({ name, rest, chatID }) => runCommand(ctx, { name, rest, chatID }),
  })

  // The menu is republished on every start, so a command added by an update appears
  // without the user re-running setup.
  await bot
    .setMyCommands(COMMANDS.map((command) => ({ command: command.name, description: command.description })))
    .catch(() => undefined)

  // Only the paired chat is answered. Checked again here, not just at pairing time,
  // because a bot's username is guessable and anyone can message it.
  const chatIDs = (update: { message?: { chat?: { id?: number } } }) => update.message?.chat?.id

  const loop = async () => {
    let offset = 0
    while (true) {
      const updates = await bot.getUpdates(offset).catch(() => [])
      for (const update of updates) {
        offset = update.update_id + 1
        const chatID = chatIDs(update)
        const text = update.message?.text
        if (chatID === undefined || text === undefined) continue
        if (!paired(stored, chatID)) continue
        await bridge.receive({ chatID, text, replyTo: update.message?.reply_to_message?.message_id }).catch(() => undefined)
      }
    }
  }

  const notifications = async () => {
    const stream = ctx.event.subscribe()
    for await (const event of stream as AsyncIterable<{ type?: string; data?: any }>) {
      const data = event.data
      if (!data?.sessionID) continue
      const sessionID = String(data.sessionID)

      if (event.type === "session.status" && data.status?.type === "idle")
        continue // idle is followed by the finish report; nothing to say on its own
      if (event.type === "session.execution.failed")
        await bridge.notify({ kind: "error", sessionID, title: "", message: String(data.error?.message ?? "failed") })
      if (event.type === "session.execution.interrupted" && data.reason === "shutdown")
        await bridge.notify({ kind: "paused", sessionID, title: "", reason: "the process stopped" })
      if (event.type === "session.message.tool.called")
        await bridge.notify({ kind: "tool", sessionID, title: "", tool: String(data.name ?? "a tool") })
    }
  }

  void loop().catch(() => undefined)
  void notifications().catch(() => undefined)
}

/** Runs one Telegram command and returns the one line to answer with. */
async function runCommand(
  ctx: PluginContext,
  input: { name: string; rest: string; chatID: number },
): Promise<string> {
  switch (input.name) {
    case "help":
      return COMMANDS.map((command) => `/${command.name} — ${command.description}`).join("\n")
    case "sessions": {
      const sessions = await ctx.session.list({}).catch(() => undefined)
      const data = (sessions as { data?: Array<{ id: string; title?: string }> } | undefined)?.data ?? []
      if (data.length === 0) return "No sessions."
      return data
        .slice(0, 10)
        .map((session) => `${session.title || session.id}`)
        .join("\n")
    }
    case "loop": {
      // The instruction is what the user typed after the interval, exactly as the
      // slash command takes it: "/loop 30s check" means "check, every 30s".
      const sessions = await ctx.session.list({}).catch(() => undefined)
      const data = (sessions as { data?: Array<{ id: string }> } | undefined)?.data ?? []
      const target = data[0]?.id
      if (target === undefined) return "No session to loop in. Open one in OpenMod first."
      await ctx.session.command({ sessionID: target as never, name: "loop", text: input.rest })
      return `Loop started in ${target}.`
    }
    case "stop": {
      const sessions = await ctx.session.list({}).catch(() => undefined)
      const data = (sessions as { data?: Array<{ id: string }> } | undefined)?.data ?? []
      const target = data[0]?.id
      if (target === undefined) return "No session to stop."
      await ctx.session.command({ sessionID: target as never, name: "loop", text: "stop" })
      return "Loop stopped."
    }
    case "status": {
      const sessions = await ctx.session.list({}).catch(() => undefined)
      const data = (sessions as { data?: Array<{ id: string; title?: string }> } | undefined)?.data ?? []
      return data.length === 0 ? "Nothing running." : `${data.length} session(s). Newest: ${data[0].title || data[0].id}`
    }
    default:
      return `Unknown command /${input.name}.`
  }
}

/** Stores the token after checking it works, so a typo does not look like a failure later. */
export async function pair(token: string, chatID: number): Promise<string> {
  const bot = createBot({ token })
  const username = await bot.whoami()
  await save(tokenPath(), { token, chatID, username })
  return username
}
