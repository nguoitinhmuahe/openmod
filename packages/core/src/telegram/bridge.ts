// The bridge: turns session activity into messages, and replies back into prompts.
//
// Everything here takes its collaborators as arguments — a bot, a session port, a
// clock — so the whole loop can be driven in a test with no network and no token.
// The plugin wires the real ones in telegram/index.ts, which is the only file that
// knows Telegram exists.

import { classify, type Route } from "./route.js"
import { render, shouldSend, type Activity } from "./notify.js"

export type SessionPort = {
  /** Sends text into a session, as if the user typed it. */
  readonly prompt: (input: { sessionID: string; text: string }) => Promise<void>
  /** The session's title, for the message head. Empty when it has none yet. */
  readonly title: (sessionID: string) => Promise<string>
}

export type BotPort = {
  readonly sendMessage: (input: { chatID: number; text: string; replyTo?: number }) => Promise<number>
}

export type Bridge = {
  /** Notifies about activity. Tool calls after the first in a run are dropped. */
  readonly notify: (activity: Activity) => Promise<void>
  /** Handles one incoming message. */
  readonly receive: (input: { chatID: number; text: string; replyTo?: number }) => Promise<void>
  /** How many messages were sent, for tests and for the pause/resume notices. */
  readonly sent: () => number
}

/** How many sent messages stay routable. Telegram ids only grow, so dropping the
 * oldest keeps the newest, which are the ones a reply can still point at. */
const ROUTE_LIMIT = 500

export function createBridge(input: {
  readonly bot: BotPort
  readonly sessions: SessionPort
  /** Only this chat is answered. */
  readonly chatID: number
  /** Every command the bridge understands, so an unknown one gets the list. */
  readonly commands: ReadonlyArray<{ readonly name: string; readonly description: string }>
  /** Runs a command the user typed in Telegram. `rest` is everything after the name. */
  readonly runCommand: (input: { name: string; rest: string; chatID: number }) => Promise<string>
}): Bridge {
  // The messages this bridge sent, so a reply finds its session. Module state would
  // leak between bridges; this map is per bridge.
  const routes = new Map<number, Route>()
  // One tally per session per run: the first tool call announces a run, the rest are
  // noise. Cleared when the run ends.
  const announced = new Map<string, number>()
  let count = 0

  const send = async (chatID: number, text: string, replyTo?: number) => {
    const id = await input.bot.sendMessage({ chatID, text, ...(replyTo === undefined ? {} : { replyTo }) })
    count += 1
    return id
  }

  return {
    sent: () => count,

    async notify(activity) {
      const already = announced.get(activity.sessionID) ?? 0
      if (!shouldSend(activity, already)) return

      if (activity.kind === "tool") announced.set(activity.sessionID, already + 1)
      else if (activity.kind === "started") announced.set(activity.sessionID, 0)
      else if (activity.kind === "finished" || activity.kind === "paused") announced.delete(activity.sessionID)

      const title = activity.title === "" ? await input.sessions.title(activity.sessionID) : activity.title
      const text = render({ ...activity, title } as Activity)
      const messageID = await send(input.chatID, text)
      routes.set(messageID, { sessionID: activity.sessionID, messageID })
      // A reply is only useful while its notification is still on the user's screen, and
      // Telegram ids only grow. Keeping the newest few hundred bounds the map without
      // ever discarding a message someone could still be looking at.
      while (routes.size > ROUTE_LIMIT) {
        const oldest = routes.keys().next().value
        if (oldest === undefined) break
        routes.delete(oldest)
      }
    },

    async receive(incoming) {
      if (incoming.chatID !== input.chatID) return

      const resolved = classify(incoming.text, incoming.replyTo, routes)
      switch (resolved.kind) {
        case "command": {
          const known = input.commands.some((command) => command.name === resolved.name)
          const answer = known
            ? await input.runCommand({ name: resolved.name, rest: resolved.rest, chatID: incoming.chatID })
            : [
                `Unknown command /${resolved.name}.`,
                ...input.commands.map((command) => `/${command.name} — ${command.description}`),
              ].join("\n")
          await send(incoming.chatID, answer, incoming.replyTo)
          return
        }
        case "session": {
          // The reply becomes the session's next instruction, so it goes in as the
          // user's own text. Delivery is the session's business, not the bridge's.
          await input.sessions.prompt({ sessionID: resolved.sessionID, text: incoming.text.trim() })
          await send(incoming.chatID, "Sent to the session.", incoming.replyTo)
          return
        }
        case "unknown": {
          await send(incoming.chatID, resolved.reason, incoming.replyTo)
          return
        }
      }
    },
  }
}
