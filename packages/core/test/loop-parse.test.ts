import { describe, expect, test } from "bun:test"
import { parseInterval, parseLoopRequest } from "@opencode/core/loop/parse"

describe("parseInterval", () => {
  test("reads minutes, seconds and hours", () => {
    expect(parseInterval("5m")).toBe(300_000)
    expect(parseInterval("90s")).toBe(90_000)
    expect(parseInterval("2h")).toBe(7_200_000)
  })
  test("adds compound durations", () => {
    expect(parseInterval("1h30m")).toBe(5_400_000)
  })
  test("rejects a bare number: the unit is not optional", () => {
    expect(parseInterval("5")).toBeUndefined()
  })
  test("rejects a word that merely starts with a unit", () => {
    expect(parseInterval("minh")).toBeUndefined()
  })
})

describe("parseLoopRequest", () => {
  test("an interval token makes an interval loop and is not part of the instruction", () => {
    expect(parseLoopRequest("5m check the build")).toEqual({
      kind: "start",
      mode: "interval",
      intervalMs: 300_000,
      instruction: "check the build",
    })
  })
  test("no interval token makes an until-done loop", () => {
    expect(parseLoopRequest("fix the tests")).toEqual({
      kind: "start",
      mode: "until-done",
      instruction: "fix the tests",
    })
  })
  test("status and stop are their own requests", () => {
    expect(parseLoopRequest("status")).toEqual({ kind: "status" })
    expect(parseLoopRequest("stop")).toEqual({ kind: "stop" })
  })
  test("an instruction whose first word looks like a unit is still an instruction", () => {
    expect(parseLoopRequest("2h")).toEqual({ kind: "invalid", reason: "no instruction" })
  })
  test("an empty request asks for status", () => {
    expect(parseLoopRequest("   ")).toEqual({ kind: "status" })
  })
})

describe("a zero interval", () => {
  test("is not a duration, so /loop 0s x cannot become a hot loop", () => {
    // With intervalMs 0 the driver's remaining-wait test is skipped and the
    // instruction is re-sent with no delay, spending the whole iteration budget in
    // seconds.
    expect(parseInterval("0s")).toBeUndefined()
    expect(parseInterval("0m")).toBeUndefined()
    expect(parseInterval("0h0m")).toBeUndefined()
  })

  test("a non-zero interval still parses", () => {
    expect(parseInterval("1s")).toBe(1000)
    expect(parseInterval("0h1m")).toBe(60_000)
  })
})
