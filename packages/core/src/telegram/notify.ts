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
