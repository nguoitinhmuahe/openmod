// The facts behind the report.
//
// Each check answers one question a user actually has when something is wrong, and
// each failure carries the fix, because a diagnosis without a next step is only a
// complaint. Everything here is read-only: doctor never changes what it inspects.

import { access, readFile, readdir, stat } from "node:fs/promises"
import { constants } from "node:fs"
import { dirname, join } from "node:path"
import type { Check, Report } from "./report.ts"

export type Environment = {
  readonly data: string
  readonly config: string
  readonly database: string
}

const exists = async (path: string) => {
  try {
    await access(path, constants.F_OK)
    return true
  } catch {
    return false
  }
}

/** The four commands a working install must have reachable on PATH. */
async function checkRuntime(): Promise<Check> {
  const bun = typeof Bun !== "undefined" ? Bun.version : undefined
  if (bun === undefined) return { name: "runtime", status: "fail", detail: "not running under Bun", fix: "reinstall OpenMod" }
  return { name: "runtime", status: "ok", detail: `bun ${bun}` }
}

async function checkConfig(path: string): Promise<Check> {
  // The app accepts .jsonc as well; reporting "no config file" to someone who has one
  // is worse than saying nothing.
  const candidate = (await exists(path)) ? path : path.replace(/\.json$/, ".jsonc")
  if (!(await exists(candidate)))
    return { name: "config", status: "warn", detail: "no config file", fix: `create ${path}` }
  path = candidate
  try {
    JSON.parse(await readFile(path, "utf8"))
    return { name: "config", status: "ok", detail: path }
  } catch (error) {
    // A config that does not parse is the most common reason a start fails, and the
    // message has to name the file or the user has nowhere to look.
    return { name: "config", status: "fail", detail: `invalid JSON: ${String(error).slice(0, 80)}`, fix: `fix ${path}` }
  }
}

async function checkDatabase(path: string): Promise<Check> {
  if (!(await exists(path))) return { name: "database", status: "warn", detail: "not created yet" }
  const size = (await stat(path)).size
  if (size === 0) return { name: "database", status: "fail", detail: "empty file", fix: `delete ${path} and restart` }
  return { name: "database", status: "ok", detail: `${Math.round(size / 1e6)} MB` }
}

/**
 * Whether the Telegram bridge was paired.
 *
 * Read directly rather than through the bridge's own loader: doctor runs in the CLI,
 * which must not depend on a plugin package, and the file's shape is two fields.
 */
async function checkTelegram(data: string): Promise<Check> {
  const path = join(data, "telegram.json")
  if (!(await exists(path))) return { name: "telegram", status: "warn", detail: "not paired", fix: "run /telegram setup" }
  try {
    const stored = JSON.parse(await readFile(path, "utf8")) as { token?: string; username?: string }
    if (typeof stored.token !== "string" || stored.token === "")
      return { name: "telegram", status: "warn", detail: "token missing", fix: "run /telegram setup again" }
    return { name: "telegram", status: "ok", detail: `paired as @${stored.username ?? "unknown"}` }
  } catch {
    return { name: "telegram", status: "fail", detail: "unreadable token file", fix: `delete ${path} and pair again` }
  }
}

/**
 * Which plugins the config asks for, and whether each can be found.
 *
 * Relative package paths resolve against the config file's own directory, which is
 * what plugin loading does (`config/plugin/source.ts`). Resolving against the working
 * directory instead reported a healthy plugin as missing whenever `opencode doctor`
 * ran from anywhere else, and exited non-zero, breaking scripts that gate on it.
 */
async function checkPlugins(configPath: string): Promise<Check> {
  if (!(await exists(configPath))) return { name: "plugins", status: "ok", detail: "none configured" }
  let configured: unknown
  try {
    configured = JSON.parse(await readFile(configPath, "utf8"))?.plugins
  } catch {
    return { name: "plugins", status: "warn", detail: "cannot read: config is invalid" }
  }
  if (!Array.isArray(configured) || configured.length === 0)
    return { name: "plugins", status: "ok", detail: "none configured" }

  const missing: string[] = []
  for (const entry of configured) {
    const spec = typeof entry === "string" ? entry : (entry as { package?: string })?.package
    if (typeof spec !== "string" || !spec.startsWith(".")) continue
    const path = join(dirname(configPath), spec)
    if (!(await exists(path))) missing.push(spec)
  }
  if (missing.length > 0)
    return {
      name: "plugins",
      status: "fail",
      detail: `${missing.length} not found: ${missing.join(", ")}`,
      fix: "remove the missing plugin from config, or restore its directory",
    }
  return { name: "plugins", status: "ok", detail: `${configured.length} configured` }
}

/** Directories a session expects to write into. A missing one is a first-run state. */
async function checkDataDir(data: string): Promise<Check> {
  if (!(await exists(data))) return { name: "data", status: "warn", detail: "not created yet", fix: `mkdir ${data}` }
  const entries = await readdir(data).catch(() => [])
  return { name: "data", status: "ok", detail: `${entries.length} entries` }
}

export async function gather(env: Environment): Promise<Report> {
  const checks: Check[] = []
  checks.push(await checkRuntime())
  checks.push(await checkConfig(env.config))
  checks.push(await checkDatabase(env.database))
  checks.push(await checkDataDir(env.data))
  checks.push(await checkTelegram(env.data))
  checks.push(await checkPlugins(env.config))
  return { checks }
}
