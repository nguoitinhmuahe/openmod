export * as LoopStore from "./store.js"

import type { Schema } from "effect"
import type { Record as LoopRecord } from "./state.js"

// Loop records live in the kv table rather than a table of their own. v2
// generates its schema file, so a new table would churn generated code on every
// upstream pull; one small row per session costs nothing and merges cleanly.

/** One key per session, so two sessions can never collide on a loop. */
export const keyFor = (sessionID: string): string => `loop:${sessionID}`

export function encode(record: LoopRecord): Schema.Json {
  return {
    sessionID: record.sessionID,
    mode: record.mode,
    instruction: record.instruction,
    ...(record.intervalMs === undefined ? {} : { intervalMs: record.intervalMs }),
    iteration: record.iteration,
    startedAt: record.startedAt,
    ...(record.lastRunAt === undefined ? {} : { lastRunAt: record.lastRunAt }),
    noProgress: record.noProgress,
    state: record.state,
    ...(record.endReason === undefined ? {} : { endReason: record.endReason }),
    ...(record.note === undefined ? {} : { note: record.note }),
  }
}

/**
 * decode reads a stored record back, or returns undefined.
 *
 * It validates rather than casts: a row written by another version, or one
 * hand-edited, would otherwise surface as a crash deep in the driver. Returning
 * undefined for one bad row keeps a single corrupt loop from bricking a session.
 */
export function decode(raw: unknown): LoopRecord | undefined {
  if (typeof raw !== "object" || raw === null) return undefined
  const value = raw as Record<string, unknown>

  const { sessionID, mode, instruction, iteration, startedAt, noProgress, state } = value
  if (typeof sessionID !== "string") return undefined
  if (mode !== "interval" && mode !== "until-done") return undefined
  if (typeof instruction !== "string") return undefined
  if (typeof iteration !== "number") return undefined
  if (typeof startedAt !== "number") return undefined
  if (typeof noProgress !== "number") return undefined
  if (state !== "running" && state !== "waiting" && state !== "paused" && state !== "ended") return undefined

  const intervalMs = value.intervalMs
  if (intervalMs !== undefined && typeof intervalMs !== "number") return undefined
  const lastRunAt = value.lastRunAt
  if (lastRunAt !== undefined && typeof lastRunAt !== "number") return undefined
  const note = value.note
  if (note !== undefined && typeof note !== "string") return undefined

  const endReason = value.endReason
  const reasons = [
    "completed",
    "blocked",
    "stopped",
    "interrupted",
    "max-iterations",
    "max-wall-clock",
    "no-progress",
  ] as const
  if (endReason !== undefined && !reasons.includes(endReason as (typeof reasons)[number])) return undefined

  return {
    sessionID,
    mode,
    instruction,
    ...(intervalMs === undefined ? {} : { intervalMs }),
    iteration,
    startedAt,
    ...(lastRunAt === undefined ? {} : { lastRunAt }),
    noProgress,
    state,
    ...(endReason === undefined ? {} : { endReason: endReason as LoopRecord["endReason"] }),
    ...(note === undefined ? {} : { note }),
  }
}
