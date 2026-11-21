import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { gather } from "@opencode/core/doctor/checks"

const dirs: string[] = []
const temp = async () => {
  const dir = await mkdtemp(join(tmpdir(), "openmod-doctor-"))
  dirs.push(dir)
  return dir
}
afterEach(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true })
})

const find = (report: { checks: ReadonlyArray<{ name: string }> }, name: string) =>
  report.checks.find((check) => check.name === name) as any

describe("doctor checks", () => {
  test("a missing config is a warning, not a failure: a first run has none", async () => {
    const dir = await temp()
    const report = await gather({ data: dir, config: join(dir, "opencode.json"), database: join(dir, "oc.db") })
    expect(find(report, "config").status).toBe("warn")
    expect(find(report, "config").fix).toBeDefined()
  })

  test("a config that does not parse fails and names the file", async () => {
    const dir = await temp()
    const config = join(dir, "opencode.json")
    await writeFile(config, "{ this is not json", "utf8")
    const report = await gather({ data: dir, config, database: join(dir, "oc.db") })
    expect(find(report, "config").status).toBe("fail")
    expect(find(report, "config").fix).toContain(config)
  })

  test("a valid config passes", async () => {
    const dir = await temp()
    const config = join(dir, "opencode.json")
    await writeFile(config, JSON.stringify({ model: "x" }), "utf8")
    const report = await gather({ data: dir, config, database: join(dir, "oc.db") })
    expect(find(report, "config").status).toBe("ok")
  })

  test("a database that has not been created yet is a warning", async () => {
    const dir = await temp()
    const report = await gather({ data: dir, config: join(dir, "c.json"), database: join(dir, "oc.db") })
    expect(find(report, "database").status).toBe("warn")
  })

  test("a database of the right size passes and is reported in MB", async () => {
    const dir = await temp()
    const database = join(dir, "oc.db")
    await writeFile(database, Buffer.alloc(2_000_000), "utf8")
    const report = await gather({ data: dir, config: join(dir, "c.json"), database })
    expect(find(report, "database").status).toBe("ok")
    expect(find(report, "database").detail).toBe("2 MB")
  })

  test("an unpaired telegram is a warning that names the command", async () => {
    const dir = await temp()
    const report = await gather({ data: dir, config: join(dir, "c.json"), database: join(dir, "oc.db") })
    expect(find(report, "telegram").status).toBe("warn")
    expect(find(report, "telegram").fix).toContain("/telegram setup")
  })

  test("a configured plugin whose directory is missing fails", async () => {
    const dir = await temp()
    const config = join(dir, "opencode.json")
    await writeFile(config, JSON.stringify({ plugins: [{ package: "./does-not-exist" }] }), "utf8")
    const report = await gather({ data: dir, config, database: join(dir, "oc.db") })
    expect(find(report, "plugins").status).toBe("fail")
    expect(find(report, "plugins").detail).toContain("./does-not-exist")
  })

  test("a config with no plugins says so rather than reporting a pass on nothing", async () => {
    const dir = await temp()
    const config = join(dir, "opencode.json")
    await writeFile(config, JSON.stringify({ model: "x" }), "utf8")
    const report = await gather({ data: dir, config, database: join(dir, "oc.db") })
    expect(find(report, "plugins").detail).toBe("none configured")
  })

  test("the runtime reports the bun version it is running under", async () => {
    const dir = await temp()
    const report = await gather({ data: dir, config: join(dir, "c.json"), database: join(dir, "oc.db") })
    expect(find(report, "runtime").status).toBe("ok")
    expect(find(report, "runtime").detail).toStartWith("bun ")
  })

  test("every failing check carries a fix", async () => {
    const dir = await temp()
    const config = join(dir, "opencode.json")
    await writeFile(config, "not json", "utf8")
    const report = await gather({ data: dir, config, database: join(dir, "oc.db") })
    // A diagnosis without a next step is only a complaint, so FAIL always says what
    // to do. A WARN may be a normal first-run state with nothing to fix.
    for (const check of report.checks.filter((c) => c.status === "fail"))
      expect(check.fix, `${check.name} has no fix`).toBeDefined()
  })

  test("a failed check is reachable without reading every check by hand", async () => {
    const dir = await temp()
    const config = join(dir, "opencode.json")
    await writeFile(config, "{broken", "utf8")
    const report = await gather({ data: dir, config, database: join(dir, "oc.db") })
    expect(report.checks.some((check) => check.status === "fail")).toBe(true)
  })
})
