// Diagnostics: what is broken, and what to do about it.
//
// The report is built from plain data so the wording and the verdicts are testable
// without a database, a network, or a config file. The command that gathers the
// facts lives beside this and hands them in.

export type Status = "ok" | "warn" | "fail"

export type Check = {
  readonly name: string
  readonly status: Status
  /** One line: what was found. */
  readonly detail: string
  /** What to do about it. Absent when nothing is wrong. */
  readonly fix?: string
}

export type Report = { readonly checks: ReadonlyArray<Check> }

export const hasFailures = (report: Report) => report.checks.some((check) => check.status === "fail")
export const hasWarnings = (report: Report) => report.checks.some((check) => check.status === "warn")

/**
 * The exit code a caller should use.
 *
 * A warning is not a failure: the application works, and a script that stopped on
 * one would refuse to run on a machine that is merely imperfect.
 */
export const exitCode = (report: Report) => (hasFailures(report) ? 1 : 0)

/** The terminal rendering: aligned, with the fix directly under its problem. */
export function render(report: Report): string {
  const width = Math.max(0, ...report.checks.map((check) => check.name.length))
  const lines = report.checks.map((check) => {
    const head = `${check.status.toUpperCase().padEnd(4)}  ${check.name.padEnd(width)}  ${check.detail}`
    return check.fix === undefined || check.status === "ok" ? head : `${head}\n      → ${check.fix}`
  })

  const tail = hasFailures(report)
    ? "Some checks failed. Fix the ones marked FAIL first."
    : hasWarnings(report)
      ? "Everything essential works; the warnings above are optional improvements."
      : "All checks passed."

  return [...lines, "", tail].join("\n")
}

/** One summary line, for a caller that only wants the verdict. */
export function summarise(report: Report): string {
  const count = (status: Status) => report.checks.filter((check) => check.status === status).length
  const parts: string[] = []
  if (count("fail") > 0) parts.push(`${count("fail")} failed`)
  if (count("warn") > 0) parts.push(`${count("warn")} warning${count("warn") === 1 ? "" : "s"}`)
  if (parts.length === 0) return `${count("ok")} checks passed`
  return parts.join(", ")
}
