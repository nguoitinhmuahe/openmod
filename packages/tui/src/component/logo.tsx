import { StyledText, type TextRenderable } from "@opentui/core"
import { For, createEffect, createMemo, createRenderEffect, createSignal, onCleanup } from "solid-js"
import { useTerminalDimensions } from "@opentui/solid"
import { useConfig } from "../config"
import { go } from "../logo"
import { comboRows, width, height, pad, leftWidth, fps } from "./logo-halo"

const rows = Array.from({length: height}, (_, i) => i)
const letters = rows.slice(pad)

function LogoRow(props: { row: StyledText }) {
  // The Solid adapter stringifies JSX `content`; the native setter accepts styled chunks.
  const bind = (node: TextRenderable) => {
    createRenderEffect(() => { node.content = props.row })
  }
  return <text height={1} selectable={false} ref={bind} />
}
export function Logo() {
  const dimensions = useTerminalDimensions()
  const config = useConfig().data
  const active = () => (config.animations ?? true) && dimensions().height >= 12 && dimensions().width >= 22
  const [time, setTime] = createSignal(1 / fps)
  createEffect(() => {
    if (!active()) return
    const timer = setInterval(() => setTime(t => t + 1 / fps), 1000 / fps)
    onCleanup(() => clearInterval(timer))
  })
  const frame = createMemo(() => comboRows(active() ? time() : undefined))
  const part = (row: number, start: number, end: number) => new StyledText(frame()[row].chunks.slice(start, end))
  return <box flexDirection="column">
    {dimensions().height < 12 ? null : dimensions().width < 22 ? (
      <For each={go.right.slice(1)}>{line => <text selectable={false}>{line.replaceAll("_", " ")}</text>}</For>
    ) : dimensions().width < width ? <>
      <For each={letters}>{i => <LogoRow row={part(i, 0, leftWidth)} />}</For>
      <For each={letters}>{i => <LogoRow row={part(i, leftWidth + 1, width)} />}</For>
    </> : <For each={active() && dimensions().height >= 15 ? rows : letters}>{i =>
      <LogoRow row={frame()[i]} />
    }</For>}
  </box>
}
