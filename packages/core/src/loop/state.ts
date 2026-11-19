export * as LoopState from "./state.js"

import type { Request } from "./parse.js"

// The state machine behind /loop, kept pure so it can be reasoned about and
// tested without a session, a clock, or a bus. `afterIdle` is the whole design:
// everything that decides whether a loop continues, waits, or stops lives here.

/** Hard ceiling on iterations, so a loop that never satisfies itself still ends. */
export const MAX_ITERATIONS = 25
/** Hard ceiling on wall-clock time, for the same reason. Four hours. */
export const MAX_WALL_CLOCK_MS = 4 * 60 * 60 * 1000
/** Consecutive iterations with no progress before the loop pauses instead of continuing. */
export const NO_PROGRESS_LIMIT = 2

export type Mode = "interval" | "until-done"

export type EndReason = "completed" | "blocked" | "stopped" | "max-iterations" | "max-wall-clock" | "no-progress"

export type Record = {
  readonly sessionID: string
  readonly mode: Mode
  readonly instruction: string
  /** Present only in interval mode. */
  readonly intervalMs?: number
  /** How many runs have been dispatched. Starts at 0, before the first run. */
  readonly iteration: number
  readonly startedAt: number
  /** When the last run was dispatched, used to measure the interval remainder. */
  readonly lastRunAt?: number
  /** Consecutive iterations that made no tool call and changed no file. */
  readonly noProgress: number
  readonly state: "running" | "waiting" | "paused" | "ended"
  readonly endReason?: EndReason
  /** Why a paused loop paused, or a one-line summary of a completion. */
  readonly note?: string
}

export function start(input: { sessionID: string; request: Extract<Request, { kind: "start" }>; now: number }): Record {
  return {
    sessionID: input.sessionID,
    mode: input.request.mode,
    instruction: input.request.instruction,
    ...(input.request.mode === "interval" ? { intervalMs: input.request.intervalMs } : {}),
    iteration: 0,
    startedAt: input.now,
    noProgress: 0,
    state: "running",
  }
}

/**
 * afterIdle decides what a loop does now that one of its runs has finished.
 *
 * `blocked` and every other reason except `blocked` differ in state here: a
 * blocked loop pauses, so a reply can resume it at the same iteration, while
 * every other ending is final. The no-progress check runs before the iteration
 * is advanced, so the counter and the cap can never disagree about which run was
 * the last one.
 */
export function afterIdle(
  record: Record,
  input: { now: number; progressed: boolean },
): { readonly record: Record; readonly action: "prompt" | "wait" | "end"; readonly waitMs?: number } {
  if (record.state === "ended" || record.state === "paused") return { record, action: "end" }

  if (input.now - record.startedAt >= MAX_WALL_CLOCK_MS) return { record: end(record, "max-wall-clock"), action: "end" }

  if (record.iteration >= MAX_ITERATIONS) return { record: end(record, "max-iterations"), action: "end" }

  if (input.progressed) {
    if (record.mode === "interval") {
      const elapsed = input.now - (record.lastRunAt ?? input.now)
      const remaining = (record.intervalMs ?? 0) - elapsed
      if (remaining > 0)
        return {
          record: { ...record, noProgress: 0, state: "waiting" },
          action: "wait",
          waitMs: remaining,
        }
    }
    return { record: next(record, 0), action: "prompt" }
  }

  const noProgress = record.noProgress + 1
  if (noProgress >= NO_PROGRESS_LIMIT) return { record: end(record, "no-progress"), action: "end" }

  if (record.mode === "interval") {
    const elapsed = input.now - (record.lastRunAt ?? input.now)
    const remaining = (record.intervalMs ?? 0) - elapsed
    if (remaining > 0) return { record: { ...record, noProgress, state: "waiting" }, action: "wait", waitMs: remaining }
  }

  return { record: next(record, noProgress), action: "prompt" }
}

/** Advances to the next run, leaving the interval clock to the caller. */
function next(record: Record, noProgress: number): Record {
  return { ...record, iteration: record.iteration + 1, noProgress, state: "running" }
}

/** Ends a loop. Only `blocked` pauses; everything else is final. */
export function end(record: Record, reason: EndReason, note?: string): Record {
  return {
    ...record,
    state: reason === "blocked" ? "paused" : "ended",
    endReason: reason,
    ...(note === undefined ? {} : { note }),
  }
}
