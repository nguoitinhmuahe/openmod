// A minimal Telegram Bot API client.
//
// Only the four calls this bridge needs, and `fetch` is injected so the whole
// bridge can be tested against a fake. Nothing here logs the token.

export type Update = {
  readonly update_id: number
  readonly message?: {
    readonly message_id: number
    readonly chat: { readonly id: number }
    readonly text?: string
    readonly reply_to_message?: { readonly message_id: number }
  }
}

export type BotCommand = { readonly command: string; readonly description: string }

export type Bot = {
  /**
   * Long-polls for updates after `offset`. Resolves empty on timeout.
   *
   * Takes a signal so the caller can stop it: the poll blocks for `pollSeconds`, and
   * without one a closed window would leave the request running.
   */
  readonly getUpdates: (offset: number, signal?: AbortSignal) => Promise<Update[]>
  /** Sends a message and returns its id, so a reply to it can be routed back. */
  readonly sendMessage: (input: { chatID: number; text: string; replyTo?: number }) => Promise<number>
  /** Publishes the slash menu Telegram shows above the keyboard. */
  readonly setMyCommands: (commands: ReadonlyArray<BotCommand>) => Promise<void>
  /** Confirms the token, returning the bot's username. Throws when the token is wrong. */
  readonly whoami: () => Promise<string>
}

type Options = {
  readonly token: string
  readonly fetch?: typeof globalThis.fetch
  /** Long-poll wait, in seconds. Tests pass 0 so they never block. */
  readonly pollSeconds?: number
  readonly signal?: AbortSignal
}

export class TelegramError extends Error {
  constructor(
    readonly method: string,
    readonly status: number,
    readonly description: string,
  ) {
    super(`Telegram ${method} failed (${status}): ${description}`)
  }
}

export function createBot(options: Options): Bot {
  const doFetch = options.fetch ?? globalThis.fetch
  const base = `https://api.telegram.org/bot${options.token}`
  const poll = options.pollSeconds ?? 25

  const call = async <A>(method: string, body: unknown, signal?: AbortSignal): Promise<A> => {
    const response = await doFetch(`${base}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: signal ?? options.signal,
    })
    const payload = (await response.json().catch(() => undefined)) as
      | { ok: boolean; result?: A; description?: string }
      | undefined
    if (!response.ok || !payload?.ok) {
      // The description is Telegram's own text; the token never appears in it.
      throw new TelegramError(method, response.status, payload?.description ?? "no description")
    }
    return payload.result as A
  }

  return {
    async getUpdates(offset, signal) {
      const updates = await call<Update[]>(
        "getUpdates",
        { offset, timeout: poll, allowed_updates: ["message"] },
        signal,
      )
      return updates ?? []
    },
    async sendMessage(input) {
      const sent = await call<{ message_id: number }>("sendMessage", {
        chat_id: input.chatID,
        text: input.text,
        ...(input.replyTo === undefined ? {} : { reply_to_message_id: input.replyTo }),
      })
      return sent.message_id
    },
    async setMyCommands(commands) {
      await call("setMyCommands", { commands })
    },
    async whoami() {
      const me = await call<{ username?: string }>("getMe", {})
      return me.username ?? "unknown"
    },
  }
}
