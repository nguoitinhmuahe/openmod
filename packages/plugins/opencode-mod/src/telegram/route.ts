// Which session a Telegram reply belongs to.
//
// A message the bridge sent carries the session it came from. A reply to that
// message is for that session — never "the most recent one", which is wrong the
// moment two sessions are running, and wrong in the worst way: the answer lands
// in the wrong conversation and looks like it was meant there.

export type Route = {
  /** The session that produced the notification. */
  readonly sessionID: string
  /** The notification's message id in the chat. */
  readonly messageID: number
}

export type Resolved =
  | { readonly kind: "session"; readonly sessionID: string }
  | { readonly kind: "unknown"; readonly reason: string }
  | { readonly kind: "command"; readonly name: string; readonly rest: string }

// A leading slash and a word, optionally addressed to this bot, then arguments.
// The name is deliberately loose: `/usr/bin/env is missing` must classify as a
// command, because otherwise it would be read as a reply and steered into a
// session — the user's path would become that session's instruction.
const COMMAND = /^\/([^\s@/]+)(?:@[^\s]+)?(?:\s+([\s\S]*))?$/

/**
 * classify reads a message and says what it is.
 *
 * A leading slash decides first, before the reply target is consulted: a path or a
 * stray `/word` must become an unknown command (answered with the help text) rather
 * than being steered into whatever session the user happened to reply to.
 *
 * `routes` holds the ids of messages the bridge has sent, keyed by the message the
 * user replied to, so a reply finds its own session rather than the newest one.
 */
export function classify(text: string, replyTo: number | undefined, routes: ReadonlyMap<number, Route>): Resolved {
  const trimmed = text.trim()

  if (trimmed.startsWith("/")) {
    const command = COMMAND.exec(trimmed)
    if (command) return { kind: "command", name: command[1].toLowerCase(), rest: (command[2] ?? "").trim() }
    // A slash but not a command: a path, or a stray slash. Say so, rather than
    // sending it to a session as if it were an answer.
    return { kind: "unknown", reason: `Not a command: ${trimmed.split(/\s/)[0]}` }
  }

  if (replyTo === undefined) return { kind: "unknown", reason: "Reply to a notification, or use a / command." }

  const route = routes.get(replyTo)
  if (route === undefined)
    return { kind: "unknown", reason: "That message is not one I sent, so I cannot tell which session it belongs to." }

  return { kind: "session", sessionID: route.sessionID }
}
