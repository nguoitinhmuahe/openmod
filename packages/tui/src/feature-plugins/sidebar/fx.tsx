import { Plugin } from "@opencode/plugin/tui"
import { createMemo, createSignal, onCleanup, Show } from "solid-js"
import { contextUsage } from "../../util/session"

// Event-driven strip + token meter. Quiet when idle; colors follow state, not rainbow.
const W = 16
type Kind = "start" | "ok" | "fail"
const DUR: Record<Kind, number> = { start: 12, ok: 8, fail: 12 } // frames @100ms

// pure: frame -> string row, testable
export function strip(kind: Kind | "running" | "idle", f: number): string {
  if (kind === "start")
    return Array.from({ length: W }, (_, x) => (x === f ? "☄" : x < f && x > f - 5 ? "━" : " ")).join("")
  if (kind === "ok") return (f % 2 ? "━" : "═").repeat(W)
  if (kind === "fail") return (f % 2 ? " " : "") + "✗ FAILED".padEnd(W).slice(0, W - (f % 2))
  if (kind === "running") {
    const p = Math.abs((f % (2 * W - 2)) - (W - 1))
    return Array.from({ length: W }, (_, x) => (Math.abs(x - p) < 2 ? "■" : "·")).join("")
  }
  return "·".repeat(W)
}
export const meter = (pct: number) => "█".repeat(Math.round((Math.min(pct, 100) / 100) * W)).padEnd(W, "░")

function SidebarFx(props: { context: Plugin.Context; sessionID: string }) {
  const c = props.context
  const fb = c.theme.text.feedback
  const [f, setF] = createSignal(0)
  const [ev, setEv] = createSignal<{ kind: Kind; at: number }>()
  const timer = setInterval(() => setF((v) => v + 1), 100)
  const mine = (fn: (k: Kind) => void, k: Kind) => (e: { data: { sessionID: string } }) =>
    e.data.sessionID === props.sessionID && fn(k)
  const fire = (kind: Kind) => setEv({ kind, at: f() })
  const offs = [
    c.data.on("session.execution.started", mine(fire, "start")),
    c.data.on("session.execution.succeeded", mine(fire, "ok")),
    c.data.on("session.execution.failed", mine(fire, "fail")),
  ]
  onCleanup(() => (clearInterval(timer), offs.forEach((o) => o?.())))

  const state = createMemo(() => {
    const e = ev()
    if (e && f() - e.at < DUR[e.kind]) return { kind: e.kind, f: f() - e.at }
    return {
      kind: c.data.session.status(props.sessionID) === "running" ? ("running" as const) : ("idle" as const),
      f: f(),
    }
  })
  const color = () =>
    ({
      start: fb.info.base,
      running: fb.info.base,
      ok: fb.success.base,
      fail: fb.error.base,
      idle: c.theme.text.muted,
    })[state().kind]

  const usage = createMemo(() => {
    const s = c.data.session.get(props.sessionID)
    return contextUsage(
      c.data.session.message.list(props.sessionID),
      c.data.location.model.list(s?.location),
      s?.revert?.messageID,
    )
  })
  const pct = () => usage()?.percent ?? 0
  const mColor = () => (pct() >= 85 ? fb.error.base : pct() >= 60 ? fb.warning.base : fb.success.base)

  return (
    <box paddingBottom={1}>
      <text fg={color()}>{strip(state().kind, state().f)}</text>
      <Show when={usage()?.percent !== undefined}>
        <text fg={pct() >= 90 && f() % 6 < 3 ? c.theme.text.muted : mColor()}>{meter(pct())}</text>
      </Show>
    </box>
  )
}

export default Plugin.define({
  id: "opencode.sidebar.fx",
  setup(context) {
    context.ui.slot({
      append: "sidebar.content",
      render: (input: { sessionID: string }) => <SidebarFx context={context} sessionID={input.sessionID} />,
    })
  },
})

if (import.meta.main) {
  for (const k of ["start", "ok", "fail", "running", "idle"] as const)
    for (let t = 0; t < 40; t++) if ([...strip(k, t)].length !== W) throw new Error(`bad ${k}@${t}`)
  if (meter(50) !== "████████░░░░░░░░" || meter(150).length !== W) throw new Error("meter")
  console.log("ok")
}
