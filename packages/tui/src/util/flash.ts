import { createSignal, onCleanup } from "solid-js"

// Decaying pulse 0..1. pulse() -> 1, fades to 0 over `ms`. Starts lit if `initial`.
export function createFlash(ms = 800, initial = false) {
  const [level, setLevel] = createSignal(initial ? 1 : 0)
  let timer: ReturnType<typeof setInterval> | undefined
  const step = 50
  const run = () => {
    if (timer) return
    timer = setInterval(() => {
      const next = Math.max(0, level() - step / ms)
      setLevel(next)
      if (next === 0) (clearInterval(timer), (timer = undefined))
    }, step)
  }
  if (initial) run()
  onCleanup(() => timer && clearInterval(timer))
  return { level, pulse: () => (setLevel(1), run()) }
}
