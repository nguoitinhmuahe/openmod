import { EOL } from "os"
import { join } from "node:path"
import { Effect } from "effect"
import { Global } from "@opencode/util/global"
import { Commands } from "../../commands"
import { Runtime } from "../../../framework/runtime"
import { load } from "@opencode/core/telegram/token"

const path = (data: string) => join(data, "telegram.json")

export default Runtime.handler(
  Commands.commands.telegram.commands.status,
  Effect.fn("cli.telegram.status")(function* () {
    const global = yield* Global.Service
    const stored = yield* Effect.promise(() => load(path(global.data)))
    // The username and chat only; the token is not printed here or anywhere else.
    process.stdout.write(
      stored === undefined ? `Not paired.${EOL}` : `Paired as @${stored.username}, chat ${stored.chatID}.${EOL}`,
    )
  }),
)
