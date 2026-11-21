import { createSignal } from "solid-js"
import { useDialog } from "../ui/dialog"
import { DialogPrompt } from "../ui/dialog-prompt"
import { DialogAlert } from "../ui/dialog-alert"
import { DialogConfirm } from "../ui/dialog-confirm"
import { pathFor, save } from "@opencode/core/telegram/token"
import { createBot } from "@opencode/core/telegram/bot"

/**
 * `/telegram` — connect the bridge from inside the window.
 *
 * The token is typed here and written to a file, never to config: config is read
 * into logs and error messages by other code, and a token there leaks the first
 * time anything prints it. The file is what the bridge reads at startup.
 *
 * The token is checked against Telegram before it is stored, so a typo is reported
 * now rather than looking like a silent bridge later.
 */

export function TelegramSetup(props: { onClose: () => void }) {
  const dialog = useDialog()
  const [busy, setBusy] = createSignal(false)

  const done = (message: string) => {
    dialog.replace(() => <DialogAlert title="Telegram" message={message} onConfirm={props.onClose} />)
  }

  const store = async (token: string, chat: string) => {
    setBusy(true)
    try {
      const username = await createBot({ token }).whoami()
      const chatID = Number(chat)
      if (!Number.isFinite(chatID)) throw new Error("the chat id must be a number")
      await save(pathFor(), { token, chatID, username })
      done(`Paired as @${username}, notifying chat ${chatID}.\n\nOpen a new window for the bridge to start.`)
    } catch (error) {
      // The message from Telegram is its own text and never contains the token.
      done(`Could not pair: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <DialogPrompt
      title="Telegram bot token"
      subtitle="From @BotFather. Stored in a file only this account can read."
      placeholder="123456:ABC-DEF..."
      busy={busy()}
      busyText="Checking the token..."
      onConfirm={(token) => {
        const trimmed = token.trim()
        if (trimmed === "") return props.onClose()
        dialog.replace(() => (
          <DialogPrompt
            title="Chat id"
            subtitle="From @userinfobot. Only this chat is answered."
            placeholder="8401176022"
            onConfirm={(chat) => void store(trimmed, chat.trim())}
            onCancel={() => props.onClose()}
          />
        ))
      }}
      onCancel={() => props.onClose()}
    />
  )
}

/** Shows what is paired, or that nothing is. */
export function TelegramStatus(props: { onClose: () => void }) {
  const [text, setText] = createSignal("Checking...")
  void (async () => {
    const { load } = await import("@opencode/core/telegram/token")
    const stored = await load(pathFor())
    // The username and chat only; the token is not shown here or anywhere else.
    setText(stored === undefined ? "Not paired." : `Paired as @${stored.username}, chat ${stored.chatID}.`)
  })()
  return <DialogAlert title="Telegram" message={text()} onConfirm={props.onClose} />
}

/** Forgets the stored token after asking. */
export function TelegramLogout(props: { onClose: () => void }) {
  const dialog = useDialog()
  return (
    <DialogConfirm
      title="Forget the Telegram token?"
      message="The bridge stops sending notifications until it is paired again."
      onConfirm={() => {
        void (async () => {
          const { clear } = await import("@opencode/core/telegram/token")
          await clear(pathFor())
          dialog.replace(() => <DialogAlert title="Telegram" message="Forgotten." onConfirm={props.onClose} />)
        })()
      }}
      onCancel={() => props.onClose()}
    />
  )
}
