import { EOL } from "os"
import { join } from "node:path"
import { Effect } from "effect"
import { Global } from "@opencode/util/global"
import { Commands } from "../../commands"
import { Runtime } from "../../../framework/runtime"
import { clear } from "@opencode/core/telegram/token"

const path = (data: string) => join(data, "telegram.json")

export default Runtime.handler(
  Commands.commands.telegram.commands.logout,
  Effect.fn("cli.telegram.logout")(function* () {
    const global = yield* Global.Service
    yield* Effect.promise(() => clear(path(global.data)))
    process.stdout.write(`Forgotten.${EOL}`)
  }),
)
