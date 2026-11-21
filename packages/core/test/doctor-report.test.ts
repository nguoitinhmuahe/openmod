import { describe, expect, test } from "bun:test"
import { exitCode, hasFailures, hasWarnings, render, summarise, type Report } from "@opencode/core/doctor/report"

const report = (...checks: Report["checks"]): Report => ({ checks })

describe("verdicts", () => {
  test("a warning is not a failure", () => {
    const warn = report({ name: "plugins", status: "warn", detail: "3 failed to load" })
    // A script that stopped on a warning would refuse to run on a merely imperfect
    // machine, so the exit code ignores warnings.
    expect(hasWarnings(warn)).toBe(true)
    expect(hasFailures(warn)).toBe(false)
    expect(exitCode(warn)).toBe(0)
  })

  test("a failure is a failure", () => {
    const fail = report({ name: "database", status: "fail", detail: "unreadable" })
    expect(exitCode(fail)).toBe(1)
  })

  test("all clear exits zero", () => {
    expect(exitCode(report({ name: "node", status: "ok", detail: "v1.4.4" }))).toBe(0)
  })
})

describe("render", () => {
  test("shows a fix under its problem and not under a pass", () => {
    const text = render(
      report(
        { name: "database", status: "fail", detail: "unreadable", fix: "check the path" },
        { name: "node", status: "ok", detail: "v1.4.4" },
      ),
    )
    expect(text).toContain("FAIL  database")
    expect(text).toContain("→ check the path")
    expect(text.split("node")[1]).not.toContain("→")
  })

  test("names the worst case in the closing line", () => {
    expect(render(report({ name: "a", status: "fail", detail: "x" }))).toContain("Some checks failed")
    expect(render(report({ name: "a", status: "warn", detail: "x" }))).toContain("optional improvements")
    expect(render(report({ name: "a", status: "ok", detail: "x" }))).toContain("All checks passed")
  })

  test("a failure outranks a warning in the closing line", () => {
    const text = render(
      report({ name: "a", status: "warn", detail: "x" }, { name: "b", status: "fail", detail: "y" }),
    )
    expect(text).toContain("Some checks failed")
  })

  test("names line up regardless of length", () => {
    const text = render(
      report({ name: "a", status: "ok", detail: "1" }, { name: "a-very-long-name", status: "ok", detail: "2" }),
    )
    const [first, second] = text.split("\n")
    expect(first.indexOf("1")).toBe(second.indexOf("2"))
  })

  test("an empty report says everything passed rather than printing nothing", () => {
    expect(render(report())).toContain("All checks passed")
  })
})

describe("summarise", () => {
  test("counts each kind", () => {
    expect(
      summarise(
        report(
          { name: "a", status: "fail", detail: "" },
          { name: "b", status: "warn", detail: "" },
          { name: "c", status: "warn", detail: "" },
          { name: "d", status: "ok", detail: "" },
        ),
      ),
    ).toBe("1 failed, 2 warnings")
  })

  test("all clear reports the count", () => {
    expect(summarise(report({ name: "a", status: "ok", detail: "" }))).toBe("1 checks passed")
  })

  test("one warning reads as singular", () => {
    expect(summarise(report({ name: "a", status: "warn", detail: "" }))).toBe("1 warning")
  })
})
