import { createMemo, createResource, For, Show } from "solid-js"
import { useData } from "../context/data"
import { useTheme } from "../context/theme"

/**
 * A small live view of a session that is not the one on screen.
 *
 * The main session is rendered by `routes/session`, which is a full surface: prompt,
 * editor, sidebar, scrollback, markdown parsing, plugin renderers. None of that is
 * wanted for a session being watched from the side, and having it per pane is what
 * makes several sessions expensive. This reads the last few messages and draws their
 * text with plain `<text>` nodes — no markdown, no syntax, no scrollback — so a pane
 * costs a handful of strings rather than a second copy of the interface.
 *
 * What it shows is deliberately the tail: the last thing said, and what the run is
 * doing. A pane that needs the whole transcript is the one to focus.
 */

/** How many lines of a message are drawn. The pane is small; the point is the shape. */
const MAX_LINES = 6

/** How many messages to look back through for something worth showing. */
const LOOK_BACK = 4

/**
 * How many panes are drawn, from the newest tab back.
 *
 * Each pane costs a few lines, but they add up and a wall of them is unreadable
 * anyway. Three is what fits at a legible size beside a session on a normal screen.
 */
export const PEEK_MAX = 3

type Peek = {
  readonly title: string
  /** The newest readable text, already flattened to lines. */
  readonly lines: readonly string[]
  /** The tool the run is in, when one is running. */
  readonly working?: string
  readonly failed: boolean
}

/** Flattens a message's parts to the text it carries, ignoring tool payloads and reasoning. */
function textOf(parts: readonly unknown[]): string[] {
  const lines: string[] = []
  for (const raw of parts) {
    const part = raw as { type?: string; text?: string; tool?: string; state?: { status?: string } }
    if (part.type === "text" && typeof part.text === "string") {
      for (const line of part.text.split("\n")) {
        const trimmed = line.trim()
        if (trimmed !== "") lines.push(trimmed)
      }
    } else if (part.type === "tool" && typeof part.tool === "string" && part.state?.status === "running") {
      lines.push(`▸ ${part.tool}`)
    }
  }
  return lines
}

export function SessionPeek(props: { sessionID: string; focused?: boolean; onSelect?: () => void }) {
  const data = useData()
  const theme = useTheme()

  // The transcript for this session is not loaded until something asks for it; a peek
  // asks, getting the same bounded page the main view would.
  createResource(
    () => props.sessionID,
    (sessionID) => data.session.message.sync(sessionID).catch(() => undefined),
  )

  const peek = createMemo<Peek>(() => {
    const info = data.session.get(props.sessionID)
    const title = info?.title || props.sessionID
    const messages = data.session.message.list(props.sessionID)
    const failed = messages.some((message) => (message as { error?: unknown }).error !== undefined)
    // Newest first: the last assistant text is what the run is saying now.
    let lines: string[] = []
    let working: string | undefined
    for (const message of messages.slice(-LOOK_BACK).reverse()) {
      const parts = ((message as { content?: readonly unknown[] }).content ?? []) as readonly unknown[]
      for (const raw of parts) {
        const part = raw as { type?: string; tool?: string; state?: { status?: string } }
        if (working === undefined && part.type === "tool" && part.state?.status === "running" && part.tool)
          working = part.tool
      }
      if (lines.length === 0) lines = textOf(parts)
      if (lines.length > 0) break
    }
    return { title, lines: lines.slice(-MAX_LINES), working, failed }
  })

  const status = () => {
    const value = peek()
    // `feedback.*` are stateful colors carrying their own base/hover variants.
    if (value.failed) return { text: "failed", color: theme.text.feedback.error.base }
    if (value.working) return { text: `running ${value.working}`, color: theme.text.feedback.warning.base }
    return { text: "idle", color: theme.text.faint }
  }

  return (
    <box
      flexDirection="column"
      flexGrow={1}
      minHeight={0}
      paddingLeft={1}
      paddingRight={1}
      onMouseUp={() => props.onSelect?.()}
    >
      <box flexDirection="row" flexShrink={0}>
        <text fg={props.focused ? theme.text.base : theme.text.muted} truncate>
          {peek().title}
        </text>
        <box flexGrow={1} />
        <text fg={status().color} truncate>
          {status().text}
        </text>
      </box>
      <Show
        when={peek().lines.length > 0}
        fallback={
          <text fg={theme.text.faint} truncate>
            (nothing yet)
          </text>
        }
      >
        <For each={peek().lines}>{(line) => <text fg={theme.text.muted} truncate>{line}</text>}</For>
      </Show>
    </box>
  )
}
