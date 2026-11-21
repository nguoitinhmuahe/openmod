export * as LoopTools from "./loop.js"

import { ToolFailure } from "@opencode/ai/effect"
import type { Context } from "@opencode/plugin/effect/plugin"
import { Effect, Schema } from "effect"
import { Loop } from "../../loop.js"
import { LoopParse } from "../../loop/parse.js"
import { LoopState } from "../../loop/state.js"

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
        // codemode: false so the model sees it outright. Behind `execute` it only appears
        // after a search, and a real run spent its whole turn searching for it and never
        // called it, so the loop ran again.
        options: { namespace: "opencode", codemode: false },
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
        options: { namespace: "opencode", codemode: false },
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

    // The slash command. Its `prompt.text` holds only the arguments: the TUI strips
    // the command word before it reaches the server, so nothing here removes "loop".
    yield* ctx.command.transform((editor) => {
      editor.add({
        name: "loop",
        description: "run an instruction on repeat, until the agent is done or blocked",
        execute: (input) =>
          Effect.gen(function* () {
            const request = LoopParse.parseLoopRequest(input.prompt.text)

            if (request.kind === "invalid") {
              yield* reply(ctx, input.sessionID, `Cannot start a loop: ${request.reason}.`)
              return
            }

            if (request.kind === "status") {
              const record = yield* loop.status(input.sessionID)
              yield* reply(ctx, input.sessionID, describe(record))
              return
            }

            if (request.kind === "stop") {
              const stopped = yield* loop.stop(input.sessionID, "stopped")
              yield* reply(ctx, input.sessionID, stopped === undefined ? "There is no loop to stop." : "Loop stopped.")
              return
            }

            // Starting over replaces the previous loop; say so, or a second /loop
            // silently drops the first instruction the user thought was running.
            const previous = yield* loop.status(input.sessionID)
            const started = yield* loop.start({ sessionID: input.sessionID, request })

            // Dispatch the first run here, and steer rather than queue.
            //
            // A real session showed the cost of getting this wrong: the instruction
            // arrived 41 seconds late, after a whole turn in which the model had no task
            // in its context and read the loop table trying to guess one. `queue` waits
            // for an idle session, so the run that the prompt itself woke would start
            // before its own message was admitted. Steering admits the text first.
            yield* ctx.session
              .prompt({ sessionID: input.sessionID, text: request.instruction, delivery: "steer" })
              .pipe(Effect.orDie)

            const what =
              started.mode === "interval"
                ? `every ${formatInterval(started.intervalMs ?? 0)}`
                : "until it is done or blocked"
            yield* reply(
              ctx,
              input.sessionID,
              previous === undefined || previous.state === "ended" || previous.state === "paused"
                ? `Loop started: ${what}.`
                : `Loop started: ${what}. The previous loop was abandoned.`,
            )
          }).pipe(Effect.orDie),
      })
    })
  }),
}

/** One line describing a loop, for /loop status. */
function describe(record: LoopState.Record | undefined): string {
  if (record === undefined) return "No loop in this session."
  const interval = record.mode === "interval" ? ` every ${formatInterval(record.intervalMs ?? 0)}` : ""
  const ending = record.endReason === undefined ? "" : ` (${record.endReason})`
  return `Loop ${record.state}${ending}${interval}: run ${record.iteration}, "${record.instruction}".`
}

/** Turns a millisecond interval back into the compact form the user typed. */
function formatInterval(ms: number): string {
  if (ms % 3_600_000 === 0) return `${ms / 3_600_000}h`
  if (ms % 60_000 === 0) return `${ms / 60_000}m`
  return `${Math.round(ms / 1000)}s`
}

/**
 * Shows the command's one-line answer to the user.
 *
 * `synthetic` with `resume: false`, never `prompt`: a prompt is input to the model,
 * so a status line sent that way becomes the model's instruction. That is exactly
 * what happened before — the session received only "Loop started: until it is done
 * or blocked." and the model went looking for a task it was never given.
 */
const reply = (ctx: Context, sessionID: Parameters<Loop.Interface["status"]>[0], text: string) =>
  ctx.session.synthetic({ sessionID, text, resume: false }).pipe(Effect.asVoid)
