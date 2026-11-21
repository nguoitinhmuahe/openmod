export * as LoopProgress from "./progress.js"

import type { SessionMessage } from "../session/message.js"

// Whether a loop run accomplished anything.
//
// A loop that keeps talking without acting is the failure mode the no-progress
// rule exists for: the model answers, the answer reads as work, and the loop
// spends its whole iteration budget on prose. A run counts as progress only when
// it did something to the world — called a tool or changed a file.

/** Content types that mean the run acted rather than only talked. */
const ACTING = new Set(["tool"])

/**
 * progressed reports whether `after` contains work `before` did not.
 *
 * The comparison is by identity, not by position. `Session.messages` defaults to
 * newest first, so slicing the newer list by the older list's length returns the
 * oldest messages in the session rather than the run's own — which made every run
 * look productive once the session's earliest turn had called a tool, and the
 * no-progress guard never fired.
 *
 * A tool call counts whatever its state — a run that called a tool and was still
 * running when the loop looked is not idle prose. An assistant turn carrying
 * changed files counts even without a tool entry, because a snapshot of changed
 * files is itself an edit.
 */
export function progressed(before: readonly SessionMessage.Info[], after: readonly SessionMessage.Info[]): boolean {
  const seen = new Set(before.map((message) => message.id))
  for (const message of after) {
    if (seen.has(message.id)) continue
    if (message.type !== "assistant") continue
    if (message.snapshot?.files !== undefined && message.snapshot.files.length > 0) return true
    for (const part of message.content) {
      if (ACTING.has(part.type)) return true
    }
  }
  return false
}
