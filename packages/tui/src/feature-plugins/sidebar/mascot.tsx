import { Plugin } from "@opencode/plugin/tui"
import { createMemo, createSignal, For, onCleanup } from "solid-js"

// Sprite 16x12: . empty, B body, D body dark, W white, E eye, K key dark, k key, Y yellow.
// Rendered as 16x6 cells with half-blocks (top=fg, bottom=bg).
type State = "typing" | "waiting" | "done" | "error"
const body = (a: string, b: string) => [
  "...BBBBBBBBBB...",
  "..BBBBBBBBBBBB..",
  a,
  b,
  "..BBBBBBBBBBBB..",
  "..DBBBBBBBBBBD..",
  "...DDBBBBBBDD...",
]
const EY = {
  down: ["..BBBWWBBBWWBB..", "..BBBEEBBBEEBB.."],
  wide: ["..BBWWBBBBWWBB..", "..BBWEBBBBWEBB.."],
  shut: ["..BBBBBBBBBBBB..", "..BBEEEBBEEEBB.."],
  x: ["..BBEBEBBEBEBB..", "..BBBEBBBBEBBB.."],
} as const
const KB = [".KkKkKkKkKkKkKk.", ".KKKKKKKKKKKKKK."]
const LEG = "...B.B....B.B..."
const SP: Record<State, string[][]> = {
  typing: [
    ["", "", ...body(...EY.down), "..B..B....B..B..", ...KB],
    ["", "", ...body(...EY.down), "...B..B..B..B...", ...KB],
  ],
  waiting: [
    ["..............Y.", "..............Y.", ...body(...EY.wide), LEG, "", "..............Y."],
    ["..............Y.", ...body(...EY.wide), LEG, "", "", "..............Y."],
  ],
  done: [
    ["............W...", "..........W.....", ...body(...EY.shut), "..DDDDDDDDDDDD.."],
    ["..........W.....", "............W...", ...body(...EY.shut), "..DDDDDDDDDDDD.."],
  ],
  error: [
    ["..Y..........Y..", "...Y........Y...", ...body(...EY.x), LEG],
    [".Y............Y.", "..Y..........Y..", ...body(...EY.x), LEG],
  ],
}
const INFO: Record<State, { color: string; dark: string; label: string }> = {
  typing: { color: "#a855f7", dark: "#6b21a8", label: "ĐANG GÕ CODE" },
  waiting: { color: "#ef4444", dark: "#991b1b", label: "CẦN DUYỆT!" },
  done: { color: "#22c55e", dark: "#15803d", label: "XONG RỒI" },
  error: { color: "#f97316", dark: "#9a3412", label: "LỖI RỒI" },
}
const FIXED: Record<string, string> = { W: "#ffffff", E: "#0b0b14", K: "#374151", k: "#9ca3af", Y: "#fbbf24" }

function px(state: State, ch: string | undefined) {
  if (!ch || ch === ".") return undefined
  if (ch === "B") return INFO[state].color
  if (ch === "D") return INFO[state].dark
  return FIXED[ch]
}

// Poke reaction: happy eyes + jump.
const POKED = [
  ["..Y..........Y..", "................", ...body(...EY.shut), LEG],
  ["................", "..Y..........Y..", ...body(...EY.shut), LEG, ""],
]
const HOVER = (s: State) =>
  SP[s].map((f) =>
    f.map((r) =>
      r === EY.down[0] || r === EY.shut[0] ? EY.wide[0] : r === EY.down[1] || r === EY.shut[1] ? EY.wide[1] : r,
    ),
  )
const POKE_MSG = ["UI DA!", "HIHI ♥", "ĐỪNG CHỌC!", "CODE TIẾP ĐI!", "NHỘT QUÁ!"]
const STAR = ["✦", "✧", "·", "⋆"]

export function sparkles(frame: number) {
  return Array.from({ length: 16 }, (_, x) => ((x * 7 + frame * 3) % 11 === 0 ? STAR[(x + frame) % 4] : " ")).join("")
}

export function cells(state: State, frame: number, sprite: string[][] = SP[state]) {
  const rows = sprite[frame % 2]!
  return Array.from({ length: 6 }, (_, y) =>
    Array.from({ length: 16 }, (_, x) => {
      const top = px(state, rows[y * 2]?.[x])
      const bot = px(state, rows[y * 2 + 1]?.[x])
      if (top && bot) return { ch: "▀", fg: top, bg: bot }
      if (top) return { ch: "▀", fg: top }
      if (bot) return { ch: "▄", fg: bot }
      return { ch: " " }
    }),
  )
}

export function SidebarMascot(props: { context: Plugin.Context; sessionID: string }) {
  const session = props.context.data.session
  const [frame, setFrame] = createSignal(0)
  const timer = setInterval(() => setFrame((f) => f + 1), 400)
  onCleanup(() => clearInterval(timer))
  // ponytail: no separate "thinking" state; running = typing. Add when reasoning parts are exposed.
  const state = createMemo<State>(() => {
    const id = props.sessionID
    if ((session.permission.list(id)?.length ?? 0) > 0 || (session.form.list(id)?.length ?? 0) > 0) return "waiting"
    if (session.status(id) === "running") return "typing"
    const last = session.message.list(id)?.findLast((m: { type: string }) => m.type === "idle") as
      | { outcome?: string }
      | undefined
    return last?.outcome === "failed" ? "error" : "done"
  })

  const [hover, setHover] = createSignal(false)
  const [poke, setPoke] = createSignal<string>()
  let pokeTimer: ReturnType<typeof setTimeout> | undefined
  onCleanup(() => clearTimeout(pokeTimer))
  const onPoke = () => {
    setPoke(POKE_MSG[Math.floor(Math.random() * POKE_MSG.length)])
    clearTimeout(pokeTimer)
    pokeTimer = setTimeout(() => setPoke(undefined), 1500)
  }
  const sprite = () => (poke() ? POKED : hover() ? HOVER(state()) : SP[state()])

  return (
    <box
      alignItems="center"
      paddingBottom={1}
      onMouseUp={onPoke}
      onMouseOver={() => setHover(true)}
      onMouseOut={() => setHover(false)}
    >
      <text fg="#fbbf24">{sparkles(frame())}</text>
      <For each={cells(state(), poke() ? frame() * 2 : frame(), sprite())}>
        {(row) => (
          <text>
            <For each={row}>{(c) => <span style={{ fg: c.fg, bg: c.bg }}>{c.ch}</span>}</For>
          </text>
        )}
      </For>
      <text fg={INFO[state()].color}>
        <b>{poke() ?? INFO[state()].label}</b>
      </text>
    </box>
  )
}

export default Plugin.define({
  id: "opencode.sidebar.mascot",
  setup(context) {
    context.ui.slot({
      append: "sidebar.content",
      render: (props) => <SidebarMascot context={context} sessionID={props.sessionID} />,
    })
  },
})

if (import.meta.main) {
  const c = cells("typing", 0)
  if (c.length !== 6 || c.some((r) => r.length !== 16)) throw new Error("bad grid")
  if ([...sparkles(3)].length !== 16 || cells("done", 1, POKED).length !== 6) throw new Error("bad fx")
  console.log("ok")
}
