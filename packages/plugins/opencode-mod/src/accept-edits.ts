import type { PluginContext } from "./plugin.ts"

// Accept-edits permission mode.
//
// v2 answers permission requests one at a time: once, always, or reject. There
// is no mode that approves file edits while still asking about shell commands,
// which is the useful middle ground — an agent left to edit freely still cannot
// run arbitrary commands without the user seeing them.
//
// Configured as:
//   "experimental": { "mod": { "acceptEdits": true } }
//
// Modes:
//   off          every edit asks (v2's behaviour)
//   edits        file writes are approved, commands still ask
//   all          nothing asks, including shell (equivalent to --auto)

export type AcceptEditsMode = "off" | "edits" | "all"

/**
 * Actions that only touch files. Bash and fetch are deliberately absent: a shell
 * command can do anything a file write can and more, so it keeps asking.
 */
const EDIT_ACTIONS = new Set(["edit", "write", "patch", "create", "update", "delete"])

/** Tool names that write files, used when the action name is not specific enough. */
const EDIT_TOOLS = new Set(["edit", "write", "patch"])

/** Reads the configured mode, defaulting to v2's behaviour of asking. */
export const configuredMode = (ctx: PluginContext): AcceptEditsMode => {
  const options = ctx.options as { acceptEdits?: unknown } | undefined
  const value = options?.acceptEdits

  if (value === true) return "edits"
  if (value === false || value === undefined) return "off"
  if (value === "all") return "all"
  if (value === "edits") return "edits"
  if (value === "off") return "off"

  // An unrecognised value is treated as off rather than as approval: silently
  // widening permissions because of a typo is the wrong failure.
  return "off"
}

/**
 * decides reports what the mode says about one evaluation.
 *
 * Returning undefined leaves the decision to v2's own rules, which is how a
 * configured deny rule keeps winning even in "all".
 */
export const decides = (
  mode: AcceptEditsMode,
  evaluation: { action: string; metadata?: Record<string, unknown> },
): "allow" | undefined => {
  if (mode === "off") return undefined
  if (mode === "all") return "allow"

  // "edits": approve writes, leave everything else to v2.
  if (EDIT_ACTIONS.has(evaluation.action)) return "allow"

  const tool = (evaluation.metadata as { tool?: unknown } | undefined)?.tool
  if (typeof tool === "string" && EDIT_TOOLS.has(tool)) return "allow"

  return undefined
}

export async function setup(ctx: PluginContext) {
  const mode = configuredMode(ctx)
  if (mode === "off") return

  await ctx.permission.hook("evaluate", (evaluation) => {
    // A deny rule already decided; never widen it.
    if (evaluation.effect === "deny") return

    const verdict = decides(mode, evaluation)
    if (verdict !== undefined) evaluation.effect = verdict
  })
}