import { createEffect, createSignal } from "solid-js"
import { useClient } from "../context/client"
import { useLocal } from "../context/local"
import { useDialog } from "../ui/dialog"
import { DialogAlert } from "../ui/dialog-alert"
import { DialogPrompt } from "../ui/dialog-prompt"
import { useToast } from "../ui/toast"

/**
 * `/autocompact-setting` — the numbers automatic compaction runs on, in the window.
 *
 * The app guesses a model's context window when its catalog has no entry, and the
 * guess is a flat 200,000. For a free or self-hosted model that is usually wrong, and
 * a threshold computed from a wrong window fires at the wrong time — or, when the
 * window is unknown entirely, never fires at all: `session/compaction.ts` skips
 * automatic compaction outright unless the ceiling is finite.
 *
 * So the context window is the thing worth asking for. Everything else follows from
 * it: 70% here means 70% of the number typed in.
 */

/** Stored as the room kept free, which is the config's unit; shown as how full, which is the readable one. */
const FREE_FOR = (full: number) => `${100 - full}%`
const FULL_FROM = (free: string) => {
  const match = /^(\d{1,2})%$/.exec(free.trim())
  return match ? 100 - Number(match[1]) : undefined
}

const THRESHOLDS = [50, 60, 70, 80, 90, 95]

export function AutoCompactSetting(props: { onClose: () => void }) {
  const local = useLocal()
  const client = useClient()
  const dialog = useDialog()
  const toast = useToast()

  const [busy, setBusy] = createSignal(false)
  // The settings the server holds, read on open. This is the config the *model* runs
  // on — not `cli.json`, which is the window's own file and which the server never
  // reads.
  const [settings, setSettings] = createSignal<{
    provider?: Record<string, { models?: Record<string, { limit?: { context?: number } }> }>
    compaction?: { auto?: boolean; buffer?: string }
  }>({})

  createEffect(() => {
    void client.api.config
      .get()
      .then((info) => setSettings(info as never))
      .catch(() => undefined)
  })

  // `model.current()` rather than `model.selection()`: the selection is only defined
  // once a session is open, and this dialog is usually reached from the command
  // palette, before any session exists. `current` is the model that would be used,
  // which is the one whose window this is.
  const model = () => local.model.current()
  const provider = () => model()?.providerID
  const modelID = () => model()?.modelID

  const raw = settings

  // The window configured so far, which is what this dialog exists to correct: with no
  // entry the app falls back to a flat 200,000 it guessed.
  const current = (): number | undefined => {
    const p = provider()
    const m = modelID()
    if (p === undefined || m === undefined) return undefined
    return raw().provider?.[p]?.models?.[m]?.limit?.context
  }

  const auto = () => raw().compaction?.auto ?? true
  const threshold = () => {
    const free = raw().compaction?.buffer
    return free === undefined ? 70 : (FULL_FROM(free) ?? 70)
  }

  const confirm = async (value: string) => {
    const context = Number(value.trim())
    if (!Number.isInteger(context) || context <= 0) {
      toast.show({ variant: "warning", message: "Context must be a whole number of tokens." })
      return
    }
    const p = provider()
    const m = modelID()
    if (p === undefined || m === undefined) {
      toast.show({ variant: "warning", message: "No model is selected in this session." })
      return
    }
    setBusy(true)
    try {
      // Written through the server, which owns `opencode.json` — the config the model
      // actually runs on. The window's own `config.update` writes `cli.json`, which the
      // server never reads: a window set this way showed the new number and the run
      // still used the old window, which is exactly what happened.
      await client.api.config.update({
        path: ["provider", p, "models", m, "limit", "context"],
        value: context,
      })
      dialog.replace(() => (
        <DialogAlert
          title="Auto compact"
          message={[
            `Context for ${p}/${m}: ${context.toLocaleString()} tokens.`,
            `Compaction runs at ${threshold()}% — about ${Math.round((context * threshold()) / 100).toLocaleString()} tokens.`,
            "",
            // No "open a new session": the runner loads the session's context on every
            // step (session/runner/llm.ts), so the new window is in effect on the next
            // turn of a session that is already open.
            "Takes effect on the next turn.",
          ].join("\n")}
          onConfirm={props.onClose}
        />
      ))
    } catch (error) {
      toast.show({ variant: "error", message: error instanceof Error ? error.message : String(error) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <DialogPrompt
      title={`Context window for ${modelID() ?? "this model"}`}
      subtitle={`Automatic compaction is ${auto() ? "on" : "off"}, running at ${threshold()}% full. Enter the window this model really has.`}
      placeholder={current() === undefined ? "128000" : String(current())}
      value={current() === undefined ? "" : String(current())}
      busy={busy()}
      busyText="Saving..."
      onConfirm={(value) => void confirm(value)}
      onCancel={props.onClose}
    />
  )
}

/** Whether automatic compaction runs, and at what share of the window. */
export const autoCompactSettings = [
  {
    title: "Auto compact",
    category: "Session",
    path: ["compaction", "auto"],
    description: "Summarize the conversation automatically as it fills the model's window",
    default: true,
    values: [false, true],
    labels: ["off", "on"],
    keywords: ["compaction", "compact", "summarize", "context window"],
    // The compaction engine reads the server's config, never the window's file.
    server: true,
  },
  {
    title: "Auto compact at",
    category: "Session",
    path: ["compaction", "buffer"],
    description: "How full the context window gets before the conversation is summarized",
    default: FREE_FOR(70),
    values: THRESHOLDS.map(FREE_FOR),
    labels: THRESHOLDS.map((full) => (full === 70 ? `${full}% full (default)` : `${full}% full`)),
    keywords: ["compaction", "threshold", "percent", "full", "buffer"],
    server: true,
  },
]
