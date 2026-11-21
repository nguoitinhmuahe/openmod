import type { PluginContext } from "./plugin.ts"

// Post-edit command hooks.
//
// v2 ships a formatter, which runs a formatter. It has no way to run an
// arbitrary command after a file is edited, so an agent that changes Go cannot
// ask for `go test` to run and a wrong edit is never caught by the project's own
// tooling.
//
// Configured as:
//   "plugins": [{ "package": "./plugins/mod", "options": { "postEdit": { "*.go": ["gofmt -w {file}"] } } }]
//
// A hook's output is appended to the tool result, so the model reads a failing
// hook in the same turn and can correct it. This relies on the hook event's
// result being mutable, which this fork makes true in
// packages/plugin/src/*/tool.ts: the runtime re-reads the result after every
// hook runs.

type HookMap = Record<string, string[]>

/** Tools that change a file. Running hooks after a read would fire on every listing. */
const EDIT_TOOLS = new Set(["edit", "write", "patch"])

const FILE_PLACEHOLDER = "{file}"
const DIR_PLACEHOLDER = "{dir}"

const posix = process.platform !== "win32"

/** Quotes one path for the platform shell, so a space in a directory is safe. */
const quote = (value: string) => (posix ? `'${value.replace(/'/g, `'\\''`)}'` : `"${value.replace(/"/g, '""')}"`)

/** Reads the configured hook map, ignoring anything malformed. */
export const configuredHooks = (options: unknown): HookMap => {
  const raw = (options as { postEdit?: unknown } | undefined)?.postEdit
  if (!raw || typeof raw !== "object") return {}

  const hooks: HookMap = {}
  for (const [pattern, commands] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(commands)) continue
    const valid = commands.filter((command): command is string => typeof command === "string" && command.trim() !== "")
    if (valid.length > 0) hooks[pattern] = valid
  }
  return hooks
}

/**
 * globMatches tests one pattern against a path.
 *
 * Only the forms a config realistically uses are supported: `*`, `**`, `*.ext`,
 * and a literal suffix. A full glob engine would be a dependency for a handful
 * of patterns.
 */
export const globMatches = (pattern: string, file: string): boolean => {
  const normalized = file.replace(/\\/g, "/")

  if (pattern === "*" || pattern === "**") return true
  if (pattern.startsWith("**/")) {
    const rest = pattern.slice(3)
    return normalized.endsWith(rest) || normalized.includes("/" + rest)
  }
  if (pattern.startsWith("*.")) return normalized.endsWith(pattern.slice(1))
  if (pattern.endsWith("/*")) return normalized.startsWith(pattern.slice(0, -1))
  return normalized === pattern || normalized.endsWith("/" + pattern)
}

export type HookResult = {
  command: string
  output: string
  exitCode: number
  failed: boolean
}

/**
 * runHook runs one command through the platform shell and captures its output.
 *
 * A hook that fails does not throw: the caller needs the output either way, and
 * one broken hook must not stop the others from running.
 */
export const runHook = async (command: string, directory: string): Promise<HookResult> => {
  const child = Bun.spawn(posix ? ["sh", "-c", command] : ["cmd", "/C", command], {
    cwd: directory,
    stdout: "pipe",
    stderr: "pipe",
  })

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])

  return {
    command,
    output: (stdout + stderr).trim(),
    exitCode,
    failed: exitCode !== 0,
  }
}

/** Renders hook results as one message, or an empty string when all were quiet. */
export const formatHookResults = (results: HookResult[]): string => {
  const lines: string[] = []
  for (const result of results) {
    if (!result.failed && result.output === "") continue
    const status = result.failed ? `hook failed (exit ${result.exitCode})` : "hook ok"
    lines.push(`${status}: ${result.command}`)
    if (result.output !== "") lines.push(result.output)
  }
  return lines.length === 0 ? "" : lines.join("\n")
}

/** Expands the placeholders in a configured command. */
export const expandCommand = (command: string, file: string, directory: string): string =>
  command.split(FILE_PLACEHOLDER).join(quote(file)).split(DIR_PLACEHOLDER).join(quote(directory))

export async function setup(ctx: PluginContext) {
  const hooks = configuredHooks(ctx.options)
  if (Object.keys(hooks).length === 0) return

  await ctx.tool.hook("execute.after", async (event) => {
    if (!EDIT_TOOLS.has(event.tool)) return
    if (event.status !== "completed") return

    const input = event.input as { file_path?: unknown } | undefined
    const file = typeof input?.file_path === "string" ? input.file_path : undefined
    // A patch names no single path in its input, so it runs against the project
    // root instead.
    const candidate = file ?? ctx.location.directory

    const matching = Object.entries(hooks).filter(([pattern]) => globMatches(pattern, candidate))
    if (matching.length === 0) return

    const directory = ctx.location.directory
    const results: HookResult[] = []
    for (const [, commands] of matching) {
      for (const command of commands) {
        results.push(await runHook(expandCommand(command, candidate, directory), directory))
      }
    }

    const report = formatHookResults(results)
    if (report === "") return

    // The runtime re-reads the result after every hook, so appending here is
    // what makes the model see a failing hook in this same turn and correct it.
    const current = typeof event.result.content === "string" ? event.result.content : ""
    event.result.content = current + "\n\nHooks:\n" + report
  })
}