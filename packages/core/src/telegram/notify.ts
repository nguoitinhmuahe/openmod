// What a notification says.
//
// Kept apart from anything that talks to Telegram so the wording and the decision
// to send can be tested on their own. The rule behind all of it: report what a run
// is doing and what it needs, never one message per streamed token, and never the
// conversation's own text — that belongs to the terminal, not to a chat log that
// may be on a phone on a train.

export type Activity =
  | { readonly kind: "started"; readonly sessionID: string; readonly title: string }
  | { readonly kind: "tool"; readonly sessionID: string; readonly title: string; readonly tool: string }
  | { readonly kind: "needs-input"; readonly sessionID: string; readonly title: string; readonly what: string }
  | { readonly kind: "error"; readonly sessionID: string; readonly title: string; readonly message: string }
  | { readonly kind: "finished"; readonly sessionID: string; readonly title: string; readonly summary: string }
  | { readonly kind: "paused"; readonly sessionID: string; readonly title: string; readonly reason: string }

/** One line, and only what the user has to act on. */
export function render(activity: Activity): string {
  const head = activity.title === "" ? activity.sessionID : activity.title
  switch (activity.kind) {
    case "started":
      return `${head} — started`
    case "tool":
      return `${head} — running ${activity.tool}`
    case "needs-input":
      return `${head} — waiting for you: ${activity.what}`
    case "error":
      return `${head} — failed: ${activity.message}`
    case "finished":
      return `${head} — ${activity.summary}`
    case "paused":
      return `${head} — paused: ${activity.reason}`
  }
}

/**
 * Whether an activity is worth a message.
 *
 * Tool calls are the noisy ones: an agent makes dozens in a run, and one message
 * each is how a bridge becomes something the user mutes. Only the first is sent,
 * so a run announces itself and then stays quiet until something changes that the
 * user has to act on.
 */
export function shouldSend(activity: Activity, alreadySentForSession: number): boolean {
  if (activity.kind === "tool") return alreadySentForSession === 0
  return true
}

/**
 * The shape a run should report at its end.
 *
 * Counts rather than the agent's own prose: the transcript is in the terminal, and
 * this line exists so a glance at the phone says whether to walk back to the desk.
 */
export function finishedSummary(input: { readonly tools: number; readonly files: number }): string {
  const parts: string[] = []
  if (input.files > 0) parts.push(`${input.files} file${input.files === 1 ? "" : "s"}`)
  if (input.tools > 0) parts.push(`${input.tools} tool call${input.tools === 1 ? "" : "s"}`)
  return parts.length === 0 ? "done" : `done — ${parts.join(", ")}`
}

// --- the live view -------------------------------------------------------
//
// A run's text arrives as fragments, one event each. Sending them as they come is
// thousands of messages, which Telegram rate-limits inside a second and which no one
// can read. What the window does is redraw one region; what the chat does is edit one
// message. Both show the run growing, and neither is a flood.

/** How often the buffered text is published. Fast enough to look live, slow enough
 * that Telegram's edit limit is never approached. */
export const EDIT_INTERVAL_MS = 1_200

/** The most text one message may hold. Telegram refuses anything longer. */
export const MAX_MESSAGE_CHARS = 4_000

export type Live = {
  /** Text and reasoning so far, in the order they arrived. */
  readonly body: string
  /** The last time the buffer was published, in epoch milliseconds. */
  readonly publishedAt: number
  /** Whether anything has changed since that publish. */
  readonly dirty: boolean
}

export const emptyLive = (): Live => ({ body: "", publishedAt: 0, dirty: false })

/**
 * add appends a fragment, trimming from the front when the message would be too long.
 *
 * The newest text is the part worth reading — a long run has already had its earlier
 * paragraphs — so the head is what goes when the limit is reached, and the message
 * says so rather than silently starting mid-sentence.
 */
export function add(live: Live, fragment: string): Live {
  const body = live.body + fragment
  const clipped =
    body.length <= MAX_MESSAGE_CHARS
      ? body
      : `…\n${body.slice(body.length - (MAX_MESSAGE_CHARS - 2))}`
  return { ...live, body: clipped, dirty: true }
}

/** Whether the buffer should be published now: something changed, and long enough since. */
export function dueAt(live: Live, now: number, interval = EDIT_INTERVAL_MS): boolean {
  if (!live.dirty) return false
  return now - live.publishedAt >= interval
}

/** Marks the buffer as published as of `now`. */
export const published = (live: Live, now: number): Live => ({ ...live, publishedAt: now, dirty: false })

/** Whether the buffer holds anything worth showing. */
export const hasText = (live: Live): boolean => live.body.trim().length > 0
