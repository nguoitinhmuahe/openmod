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
 * The comparison is positional on length, not on message identity: the caller
 * snapshots the session's messages before a run and hands back the list after it,
 * and a session's history only ever grows. Messages beyond the old length are the
 * ones this run produced.
 *
 * A tool call counts whatever its state — a run that called a tool and was still
 * running when the loop looked is not idle prose. An assistant turn carrying
 * changed files counts even without a tool entry, because a snapshot of changed
 * files is itself an edit.
 */
export function progressed(before: readonly SessionMessage.Info[], after: readonly SessionMessage.Info[]): boolean {
  for (const message of after.slice(before.length)) {
    if (message.type !== "assistant") continue
    if (message.snapshot?.files !== undefined && message.snapshot.files.length > 0) return true
    for (const part of message.content) {
      if (ACTING.has(part.type)) return true
    }
  }
  return false
}
