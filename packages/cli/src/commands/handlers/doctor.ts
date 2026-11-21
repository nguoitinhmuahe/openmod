import { EOL } from "os"
import { Effect } from "effect"
import { Global } from "@opencode/util/global"
import { Commands } from "../commands"
import { Runtime } from "../../framework/runtime"
import { databasePath } from "../../database-path"
import { gather } from "@opencode/core/doctor/checks"
import { exitCode, render, summarise } from "@opencode/core/doctor/report"

/**
 * `opencode doctor` — what is broken and what to do about it.
 *
 * Read-only by design: a diagnostic that changes what it inspects cannot be trusted
 * to describe it. The exit code separates a broken install from an imperfect one, so
 * a script can gate on it without refusing to run on a machine that merely warns.
 */
export default Runtime.handler(
  Commands.commands.doctor,
  Effect.fn("cli.doctor")(function* (input) {
    const global = yield* Global.Service
    const report = yield* Effect.promise(() =>
      gather({
        data: global.data,
        config: `${global.config}/opencode.json`,
        database: databasePath(global.data),
      }),
    )

    process.stdout.write(
      input.json ? JSON.stringify(report, null, 2) + EOL : render(report) + EOL,
    )
    if (!input.json) process.stdout.write(`${summarise(report)}${EOL}`)
    process.exitCode = exitCode(report)
  }),
)
