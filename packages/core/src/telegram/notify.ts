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
  /**
   * The run has stopped and is waiting for the user to allow or refuse something.
   *
   * `requestID` is what an answer names, and `options` is what may be answered —
   * a permission may be allowed once, always, or refused.
   */
  /** The run is waiting on a form: fields to fill in before it can continue. */
  | {
      readonly kind: "form"
      readonly sessionID: string
      readonly title: string
      readonly formID: string
      readonly formTitle: string
      readonly fields: readonly FormField[]
    }
  | {
      readonly kind: "permission"
      readonly sessionID: string
      readonly title: string
      readonly requestID: string
      readonly action: string
      readonly resources: readonly string[]
      readonly message?: string
    }

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
    case "form":
      return renderForm({ id: activity.formID, title: activity.formTitle, fields: activity.fields })
    case "permission": {
      const what = activity.resources.length > 0 ? activity.resources.join(", ") : activity.action
      return [
        `${head} — waiting for you`,
        ``,
        `${activity.action}: ${what}`,
        ...(activity.message === undefined ? [] : ["", activity.message]),
        ``,
        `Answer with /yes ${activity.requestID}, /always ${activity.requestID} or /no ${activity.requestID}`,
      ].join("\n")
    }
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
  // Everything else — a permission, a failure, a finish — is something the user has
  // to see, and is never suppressed by how many tool calls came before it.
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

// --- forms ---------------------------------------------------------------
//
// A form is what the app asks when a run needs a decision: which of these, how many,
// yes or no. The window renders it as fields with pickers; a chat has no pickers, so
// the same fields are written out with their options numbered, and the answer comes
// back as one line naming each field.

/** One field of a form, as the renderer needs it. */
export type FormField = {
  readonly key: string
  readonly type: string
  readonly title?: string
  readonly description?: string
  readonly required?: boolean
  readonly options?: ReadonlyArray<{ readonly value: string; readonly label: string }>
  readonly default?: unknown
}

/** The line a field's answer is written on, and how its options are laid out. */
export function renderForm(input: {
  readonly id: string
  readonly title: string
  readonly fields: readonly FormField[]
}): string {
  const lines: string[] = [`❓ ${input.title}`, ""]
  for (const field of input.fields) {
    const label = field.title ?? field.key
    const required = field.required === true ? " (required)" : ""
    lines.push(`${label}${required} — ${field.type}`)
    if (field.description !== undefined && field.description !== "") lines.push(`  ${field.description}`)
    if (field.options !== undefined && field.options.length > 0) {
      for (const option of field.options) lines.push(`  ${option.value} — ${option.label}`)
    }
    if (field.default !== undefined) lines.push(`  default: ${String(field.default)}`)
    lines.push("")
  }
  lines.push("Answer with:")
  lines.push(`/answer ${input.id} ${input.fields.map((f) => `${f.key}=...`).join(" ")}`)
  if (input.fields.length === 1 && (input.fields[0]?.options?.length ?? 0) > 0) {
    // One field with a list is the common case, and a bare value is unambiguous.
    lines.push(`or just /answer ${input.id} <value>`)
  }
  return lines.join("\n")
}

/**
 * Turns a reply into the answer object a form expects.
 *
 * `key=value` pairs, plus a bare value when the form has a single field. Values are
 * read against the field's own type: a number is a number, a boolean takes yes/no/true/
 * false, and a multiselect takes a comma-separated list. An unknown key is kept
 * verbatim rather than dropped — the form's own validation is the authority on what is
 * acceptable, and it reports the problem better than this can.
 */
export function parseFormAnswer(
  fields: readonly FormField[],
  rest: string,
): { readonly answer: Record<string, unknown> } | { readonly error: string } {
  const text = rest.trim()
  if (text === "") return { error: "Nothing to answer with." }

  const pairs = text
    .split(/\s+/)
    .map((token) => token.split("="))
    .filter((parts) => parts.length >= 2)
    .map(([key, ...value]) => [key!, value.join("=")] as const)

  // A single bare word is only accepted when the form has one field, where there is
  // nothing else it could mean.
  const entries: ReadonlyArray<readonly [string, string]> =
    pairs.length > 0 ? pairs : fields.length === 1 ? [[fields[0]!.key, text] as const] : []
  if (entries.length === 0)
    return { error: `Name each field: /answer <id> ${fields.map((f) => `${f.key}=...`).join(" ")}` }

  const answer: Record<string, unknown> = {}
  for (const [key, raw] of entries) {
    const field = fields.find((candidate) => candidate.key === key)
    if (field === undefined) {
      answer[key] = raw
      continue
    }
    answer[key] = coerce(field, raw)
  }
  return { answer }
}

function coerce(field: FormField, raw: string): unknown {
  switch (field.type) {
    case "number":
    case "integer": {
      const value = Number(raw)
      return Number.isFinite(value) ? value : raw
    }
    case "boolean":
      return ["yes", "y", "true", "on", "1"].includes(raw.toLowerCase())
    case "multiselect":
      return raw
        .split(",")
        .map((part) => part.trim())
        .filter((part) => part !== "")
    default:
      return raw
  }
}
