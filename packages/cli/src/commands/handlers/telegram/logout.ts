import { EOL } from "os"
import { Effect } from "effect"
import { Global } from "@opencode/util/global"
import { Commands } from "../../commands"
import { Runtime } from "../../../framework/runtime"
import { clear, pathFor } from "@opencode/core/telegram/token"

export default Runtime.handler(
  Commands.commands.telegram.commands.logout,
  Effect.fn("cli.telegram.logout")(function* () {
    const global = yield* Global.Service
    yield* Effect.promise(() => clear(pathFor(global.data)))
    process.stdout.write(`Forgotten.${EOL}`)
  }),
)
