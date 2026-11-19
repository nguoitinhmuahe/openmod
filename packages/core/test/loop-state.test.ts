import { describe, expect, test } from "bun:test"
import { MAX_ITERATIONS, NO_PROGRESS_LIMIT, afterIdle, end, start } from "@opencode/core/loop/state"
import type { Request } from "@opencode/core/loop/parse"

// Clock is a Context.Reference with a default in Effect 4.1, so a service that
// reads it needs no Clock layer in tests. KV is different: a test that both
// provides it to a layer and reads it itself needs `provideMerge`, not `provide`.
const started = (request: Extract<Request, { kind: "start" }>) => start({ sessionID: "ses_one", request, now: 1_000 })
const interval = started({ kind: "start", mode: "interval", intervalMs: 300_000, instruction: "check" })
const untilDone = started({ kind: "start", mode: "until-done", instruction: "fix" })

describe("start", () => {
  test("begins the first iteration as running", () => {
    expect(interval.iteration).toBe(0)
    expect(interval.state).toBe("running")
    expect(interval.noProgress).toBe(0)
  })
})

describe("afterIdle", () => {
  test("until-done prompts again immediately", () => {
    const result = afterIdle({ ...untilDone, iteration: 1 }, { now: 2_000, progressed: true })
    expect(result.action).toBe("prompt")
    expect(result.record.iteration).toBe(2)
  })
  test("interval waits out the rest of the interval before prompting", () => {
    const result = afterIdle(
      { ...interval, iteration: 1, lastRunAt: 1_000 },
      { now: 1_000 + 120_000, progressed: true },
    )
    expect(result.action).toBe("wait")
    expect(result.waitMs).toBe(180_000)
    expect(result.record.state).toBe("waiting")
  })
  test("interval that has already overrun its interval prompts at once", () => {
    const result = afterIdle(
      { ...interval, iteration: 1, lastRunAt: 1_000 },
      { now: 1_000 + 400_000, progressed: true },
    )
    expect(result.action).toBe("prompt")
    expect(result.record.iteration).toBe(2)
  })
  test("two iterations without progress end the loop instead of continuing", () => {
    const twice = { ...untilDone, iteration: 2, noProgress: NO_PROGRESS_LIMIT - 1 }
    const result = afterIdle(twice, { now: 2_000, progressed: false })
    expect(result.action).toBe("end")
    expect(result.record.endReason).toBe("no-progress")
  })
  test("progress resets the no-progress counter", () => {
    const result = afterIdle({ ...untilDone, iteration: 2, noProgress: 1 }, { now: 2_000, progressed: true })
    expect(result.record.noProgress).toBe(0)
  })
  test("the iteration cap ends the loop and is not exceeded", () => {
    const result = afterIdle({ ...untilDone, iteration: MAX_ITERATIONS }, { now: 2_000, progressed: true })
    expect(result.action).toBe("end")
    expect(result.record.endReason).toBe("max-iterations")
    expect(result.record.iteration).toBe(MAX_ITERATIONS)
  })
  test("the wall-clock cap ends the loop", () => {
    const result = afterIdle({ ...untilDone, iteration: 1 }, { now: 1_000 + 4 * 60 * 60 * 1000, progressed: true })
    expect(result.action).toBe("end")
    expect(result.record.endReason).toBe("max-wall-clock")
  })
})

describe("end", () => {
  test("a blocked loop pauses so a reply can resume it", () => {
    const paused = end({ ...untilDone, iteration: 3 }, "blocked", "need credentials")
    expect(paused.state).toBe("paused")
    expect(paused.endReason).toBe("blocked")
    expect(paused.note).toBe("need credentials")
    expect(paused.iteration).toBe(3)
  })
  test("a completed loop is ended, not paused", () => {
    expect(end(untilDone, "completed").state).toBe("ended")
  })
})
