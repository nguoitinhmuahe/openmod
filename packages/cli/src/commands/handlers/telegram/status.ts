import { EOL } from "os"
import { Effect } from "effect"
import { Global } from "@opencode/util/global"
import { Commands } from "../../commands"
import { Runtime } from "../../../framework/runtime"
import { load, pathFor } from "@opencode/core/telegram/token"

export default Runtime.handler(
  Commands.commands.telegram.commands.status,
  Effect.fn("cli.telegram.status")(function* () {
    const global = yield* Global.Service
    const stored = yield* Effect.promise(() => load(pathFor(global.data)))
    // The username and chat only; the token is not printed here or anywhere else.
    process.stdout.write(
      stored === undefined ? `Not paired.${EOL}` : `Paired as @${stored.username}, chat ${stored.chatID}.${EOL}`,
    )
  }),
)
