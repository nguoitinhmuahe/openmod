import { RGBA, StyledText } from "@opentui/core"
import { logo } from "../logo"

// One actual OpenTUI row per preview row. Keep its background transparent and
// attributes plain: neither word is bold in MOD-combo-pulse.bat.
const left = logo.left[0].length
export const width = left + 1 + logo.right[0].length
export const pad = 3
export const height = pad + logo.left.length
export const fps = 30
export const leftWidth = left
const lines = [...Array<string>(pad).fill(" ".repeat(width)), ...logo.left.map((s, i) => s + " " + logo.right[i])]
const black = 0, muted = 0x7d7d8c, bright = 0xe1e1ee, white = 0xffffff
const glyphs = ["·", "∙", "•", "✦", "✧"]
const hash = (n: number) => { const v = Math.sin(n * 12.9898) * 43758.5453; return v - Math.floor(v) }
function mix(a: number, b: number, t: number) {
  const channel = (shift: number) => {
    const x = (a >> shift) & 255, y = (b >> shift) & 255
    return Math.round(x + (y - x) * t) << shift
  }
  return channel(16) | channel(8) | channel(0)
}

// t is seconds, as in the preview. Undefined selects an unanimated wordmark.
export function comboRows(t?: number): StyledText[] {
  const chars = lines.map(line => Array.from(line))
  const swell = t === undefined ? 0 : (Math.sin(t * 1.6) + 1) / 2 * 0.35
  const colors = chars.map((row, y) => row.map((ch, x) => {
    const base = y < pad ? black : x < left ? muted : bright
    return ch === " " ? base : mix(base, white, swell)
  }))
  if (t !== undefined) {
    const cycle = t * 2.4, fade = 1 - cycle % 1
    const flare = mix(0xfff0c8, white, fade)
    for (let i = 0; i < 5; i++) {
      const seed = Math.floor(cycle) * 13 + i * 97
      if (hash(seed) > 0.6) continue
      const cx = Math.floor(hash(seed + 1) * width), y = pad + Math.floor(hash(seed + 2) * logo.left.length)
      for (let dx = -2; dx <= 2; dx++) {
        const x = cx + dx
        if (x >= 0 && x < width && chars[y][x] !== " ") colors[y][x] = mix(colors[y][x], flare, (1 - Math.abs(dx) / 2.5) * fade)
      }
    }
    for (let i = 0; i < 14; i++) {
      const p = (((t / 2.6 + i / 14) % 1) + 1) % 1
      const y = pad - 1 - Math.floor(p * pad)
      const x = Math.round((hash(i + 100) * width + (hash(i) - 0.5) * 2 * 4 * p + width * 4) % width)
      const strength = p < 0.2 ? p / 0.2 : 1 - (p - 0.2) / 0.8
      if (strength <= 0 || x >= width || x < 0) continue
      chars[y][x] = glyphs[Math.min(4, Math.floor(strength * 5))]
      colors[y][x] = mix(0x82cdff, white, strength * 0.75)
    }
  }
  const palette = new Map<number, RGBA>()
  return chars.map((row, y) => new StyledText(row.map((text, x) => {
    const c = colors[y][x]
    if (!palette.has(c)) palette.set(c, RGBA.fromInts(c >> 16, (c >> 8) & 255, c & 255))
    return { __isChunk: true, text, fg: palette.get(c)! }
  })))
}
