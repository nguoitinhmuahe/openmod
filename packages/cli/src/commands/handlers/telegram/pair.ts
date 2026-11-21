import { EOL } from "os"
import { join } from "node:path"
import { Effect } from "effect"
import { Global } from "@opencode/util/global"
import { Commands } from "../../commands"
import { Runtime } from "../../../framework/runtime"
import { save } from "@opencode/core/telegram/token"

const path = (data: string) => join(data, "telegram.json")

/**
 * `opencode telegram pair` — store a bot token and the chat to answer.
 *
 * The token goes to a file, never to config: config is read into logs and error
 * messages by other code, and a token there leaks the first time anything prints it.
 * The token is checked against Telegram before it is stored, so a typo is reported
 * now rather than looking like a broken bridge later.
 */
export default Runtime.handler(
  Commands.commands.telegram.commands.pair,
  Effect.fn("cli.telegram.pair")(function* (input) {
    const global = yield* Global.Service
    const checked = yield* Effect.result(
      Effect.tryPromise({
        try: async () => {
          const response = await fetch(`https://api.telegram.org/bot${input.token}/getMe`)
          const payload = (await response.json()) as {
            ok: boolean
            result?: { username?: string }
            description?: string
          }
          if (!payload.ok) throw new Error(payload.description ?? "the token was rejected")
          return payload.result?.username ?? "unknown"
        },
        catch: (error) => String(error),
      }),
    )

    if (checked._tag === "Failure") {
      process.stderr.write(`Token rejected: ${checked.failure}${EOL}`)
      process.exitCode = 1
      return
    }

    const chatID = Number(input.chat)
    if (!Number.isFinite(chatID)) {
      process.stderr.write(`Chat id must be a number, got: ${input.chat}${EOL}`)
      process.exitCode = 1
      return
    }

    yield* Effect.promise(() => save(path(global.data), { token: input.token, chatID, username: checked.success }))
    process.stdout.write(`Paired as @${checked.success}, notifying chat ${chatID}.${EOL}`)
    process.stdout.write(`Restart the server for the bridge to start.${EOL}`)
  }),
)
