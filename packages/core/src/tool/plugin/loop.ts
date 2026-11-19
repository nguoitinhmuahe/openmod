export * as LoopTools from "./loop.js"

import { ToolFailure } from "@opencode/ai/effect"
import type { Context } from "@opencode/plugin/effect/plugin"
import { Effect, Schema } from "effect"
import { Loop } from "../../loop.js"

// Two tools a looping agent uses to say how its run ended.
//
// A loop's own turn is the only place that knows whether the task is done or
// whether it is stuck, so the model has to be able to say so. `loop_complete`
// ends the loop; `loop_blocked` pauses it so the user's next reply resumes at the
// same iteration.
//
// Both refuse to touch a loop that has already ended. A completion that arrives
// after the user stopped the loop must not resurrect it, which is the "stop wins"
// rule these tools exist to respect.

const CompleteInput = Schema.Struct({
  summary: Schema.optional(Schema.String).annotate({
    description: "One line on what was accomplished, for the user.",
  }),
})

const BlockedInput = Schema.Struct({
  reason: Schema.String.annotate({
    description:
      "What is needed to continue: a missing permission, a decision only the user can make, or progress that has stalled.",
  }),
})

const Result = Schema.Struct({
  /** False when the loop was already finished and nothing was changed. */
  changed: Schema.Boolean,
  state: Schema.String,
  endReason: Schema.optional(Schema.String),
  note: Schema.optional(Schema.String),
})

/** The output for a call that changed nothing, so the declared schema is always satisfied. */
const unchanged = (reason: string) => ({ changed: false, state: "unchanged" as const, note: reason })

/** Reads the loop for this session, or explains why nothing changed. */
const current = (loop: Loop.Interface, sessionID: Parameters<Loop.Interface["status"]>[0]) =>
  Effect.gen(function* () {
    const record = yield* loop.status(sessionID)
    if (record === undefined) return { record: undefined, reason: "There is no loop running in this session." }
    if (record.state === "ended" || record.state === "paused")
      return {
        record: undefined,
        reason: `This loop already ended (${record.endReason ?? record.state}); leaving it as it is.`,
      }
    return { record, reason: undefined }
  })

export const Plugin = {
  id: "opencode.tool.loop",
  effect: Effect.fn("LoopTools.Plugin")(function* (ctx: Context) {
    const loop = yield* Loop.Service

    yield* ctx.tool.transform((editor) => {
      editor.add({
        name: "loop_complete",
        description:
          "End this session's loop because the instruction has been carried out. Call it when the goal is met and there is nothing further to do; do not call it merely because a turn finished in interval mode.",
        input: CompleteInput,
        output: Result,
        options: { namespace: "opencode", codemode: true },
        execute: (input, context) =>
          Effect.gen(function* () {
            const found = yield* current(loop, context.sessionID)
            // An output is always returned, even when nothing changed: the schema is
            // declared, so a bare undefined is rejected before the model sees the text.
            if (found.record === undefined) return { output: unchanged(found.reason!), content: found.reason! }
            const ended = yield* loop.stop(context.sessionID, "completed", input.summary)
            return {
              output: {
                changed: true,
                state: ended?.state ?? "ended",
                endReason: "completed" as const,
                ...(ended?.note === undefined ? {} : { note: ended.note }),
              },
              content: `Loop completed${input.summary === undefined ? "" : `: ${input.summary}`}.`,
            }
          }).pipe(Effect.mapError((error) => new ToolFailure({ message: "Could not end the loop", error }))),
      })

      editor.add({
        name: "loop_blocked",
        description:
          "Pause this session's loop because it cannot continue without the user. Use it for a missing permission, a decision only the user can make, or attempts that stopped making progress. The loop resumes when the user replies.",
        input: BlockedInput,
        output: Result,
        options: { namespace: "opencode", codemode: true },
        execute: (input, context) =>
          Effect.gen(function* () {
            const found = yield* current(loop, context.sessionID)
            if (found.record === undefined) return { output: unchanged(found.reason!), content: found.reason! }
            const paused = yield* loop.stop(context.sessionID, "blocked", input.reason)
            return {
              output: {
                changed: true,
                state: paused?.state ?? "paused",
                endReason: "blocked" as const,
                ...(paused?.note === undefined ? {} : { note: paused.note }),
              },
              content: `Loop paused: ${input.reason}`,
            }
          }).pipe(Effect.mapError((error) => new ToolFailure({ message: "Could not pause the loop", error }))),
      })
    })
  }),
}
