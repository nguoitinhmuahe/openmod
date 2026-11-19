export * as LoopParse from "./parse.js"

export type Request =
  | {
      readonly kind: "start"
      readonly mode: "interval"
      readonly intervalMs: number
      readonly instruction: string
    }
  | { readonly kind: "start"; readonly mode: "until-done"; readonly instruction: string }
  | { readonly kind: "status" }
  | { readonly kind: "stop" }

const UNITS = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
} as const

export function parseInterval(text: string): number | undefined {
  const segments = text.match(/\d+[hms]/g)
  if (!segments || segments.join("") !== text) return undefined
  return segments.reduce((total, segment) => {
    const unit = segment[segment.length - 1] as keyof typeof UNITS
    return total + Number(segment.slice(0, -1)) * UNITS[unit]
  }, 0)
}

export function parseLoopRequest(text: string): Request | { readonly kind: "invalid"; readonly reason: string } {
  const trimmed = text.trim()
  if (trimmed === "") return { kind: "status" }

  const lower = trimmed.toLowerCase()
  if (lower === "status") return { kind: "status" }
  if (lower === "stop") return { kind: "stop" }

  const [first, ...rest] = trimmed.split(/\s+/)
  const intervalMs = parseInterval(first)
  if (intervalMs === undefined) return { kind: "start", mode: "until-done", instruction: trimmed }

  const instruction = rest.join(" ")
  if (instruction === "") return { kind: "invalid", reason: "no instruction" }
  return { kind: "start", mode: "interval", intervalMs, instruction }
}
