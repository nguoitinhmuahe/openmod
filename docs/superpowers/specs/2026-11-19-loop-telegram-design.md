# Loop, Telegram bridge, and parity features — design

**Date:** 2026-11-19
**Status:** approved in conversation; not yet committed
**Repo:** `C:\Users\trant\Desktop\opencode-ts` (fork of `anomalyco/opencode`, dev branch)

## Intent

OpenMod (this fork) should carry the features the archived Go fork had, plus two
new ones the user asked for: `/loop` and a Telegram bridge. The rule the user
set: **where v2 already does it, skip it; where v2 has only part of it, add the
missing part and nothing more.**

## Goals

1. `/loop` with two modes, described below.
2. A Telegram bridge that notifies every session's progress and accepts replies
   that route back to the right session. Set up once per machine, then it runs.
3. Parity: add only what v2 genuinely lacks, verified by behaviour rather than by
   comparing command names.

## Non-goals

- Cost budget. Explicitly rejected twice by the user.
- Windows shell backend. Explicitly dropped.
- Rebuilding what v2 already does: session fork, session export/import, model
  favourites, tool-group expand/collapse, `worktree_diff`/`worktree_apply`,
  post-edit hooks.
- Telegram as a second UI. It is a notification and reply channel, not a TUI.

## Anti-goals

- A Telegram bot that sends one message per streamed token, or re-sends history.
- A loop that keeps burning tokens when it is stuck, or that stacks runs.
- A `/` menu on Telegram that lists commands which silently do nothing.
- Anything that puts the Telegram token into a chat transcript.

## Constraints

- Bun 1.4.4, Effect, SolidJS TUI over OpenTUI. Tests run with `bun test`.
- The fork must stay mergeable: core edits only where a hook or type genuinely
  blocks the feature (the two `Types.Mutable<Tool.Result>` edits already
  recorded in `OPENMOD-NOTES.md` are the precedent).
- Shell is PowerShell/Bash on Windows; paths are Windows.
- Every claim of "done" needs a test that failed first.

## What v2 already provides (verified by reading the code)

| Area | Where | Verdict |
|---|---|---|
| Timer/cron/event scheduler | `core/src/automation.ts`, `Automation.Service` | Exists, but project-scoped, sends prompts *to* a session from outside. Kept as-is, not reused for loop. |
| Slash-command registry | `tui/src/context/keymap.tsx` (`slash: {name, aliases, arguments}`), `component/command-palette.tsx` | Exists. `/loop` registers here. |
| Session prompt API | `Session.Service.prompt({sessionID, text, delivery})` | Exists. Loop uses it. |
| Idle/status events | `schema/src/session-status-event.ts` (`session.status`, `session.idle`) | Exists. Loop waits on `session.idle`. |
| Config-driven slash commands | `schema/src/config.ts` → `config.commands` (`ConfigCommand.Info`) | Exists. These are prompt-body commands and *can* run from Telegram. |
| Compaction settings | `core/src/session/compaction.ts` (`Settings {auto, buffer, keep, background}`), `core/src/config/plugin/compaction.ts` | Exists. Compacts at 85% by default (`RESERVE_SHARE = 0.15`). **No dialog to change it.** |
| File-level undo | `core/src/session/revert.ts` (uses `Snapshot`) | Exists. Needs behaviour check before adding anything. |
| Usage | `tui/src/usage.tsx`, `/usage` slash command | Exists. |
| Secret storage | `core/src/credential.ts` (`create/list/get/remove`, integration-scoped) | Exists, but shaped for provider integrations. Telegram token does not fit it. |

## Approaches considered

**Loop, three ways.**

- *On top of `Automation`.* Reuse the scheduler, `action: {type: "prompt", to: {session}}`.
  Rejected: automation always runs from the outside on a timer, has no notion of
  "this session's current run finished, start the next", no progress detection,
  and its own enable flag and project scoping would have to be worked around.
- *In the TUI process.* A Solid signal driving re-prompts.
  Rejected: it dies with the window, and the user wants loops to survive, and to
  be answerable from Telegram.
- ***Chosen: a small core service, `Loop.Service`, one record per session, state
  in the `kv` table.*** It owns the two modes, the caps, and the progress check;
  it prompts through `Session.Service` and listens for `session.idle`. No new
  table, so no mergeable-`schema.gen.ts` churn.

**Telegram, three ways.**

- *Standalone bot process the user starts.* Rejected: contradicts "set up once
  and it keeps running".
- *Second core subsystem, `core/src/telegram/`.* Rejected: it is fork-only; core
  edits are what make upstream merges hurt.
- ***Chosen: a module in the existing first-party plugin, `packages/plugins/opencode-mod/src/telegram.ts`,
  running server-side (the plugin's `./server` entry).*** The managed service
  already hosts plugin server code, so the bot lives exactly as long as the
  service does, and a restart reconnects without re-pairing.

**Parity, two ways.**

- *Command-name comparison, port everything not obviously present.* Rejected:
  it would duplicate `revert`, usage, and favourites, and the user's rule is
  explicitly the opposite.
- ***Chosen: behaviour checklist, one item per Go feature, each marked
  present / partial / absent, with the partials getting the missing half only.***

## The `/loop` contract

Two modes, distinguished by whether an interval is given.

```
/loop 5m <instruction>     # interval mode
/loop <instruction>        # until-done mode
/loop status               # show this session's loop
/loop stop                 # cancel it
```

**Interval mode.** Run `<instruction>`. When the session goes idle, wait out the
remainder of the interval, then run it again. The agent **may end the task
itself** by calling `loop_complete`. It is told that reaching a natural stopping
point is a reason to complete, not to keep going.

**Until-done mode.** Run `<instruction>`. When the session goes idle, start the
next run immediately — no clock. The agent **may not** end the task for merely
finishing a turn. It ends only by calling `loop_complete` (goal met) or
`loop_blocked` (needs the user: missing permission, a decision only the user can
make, or repeated attempts with no progress). `loop_blocked` pauses the loop and
notifies; the user's reply resumes it at the same iteration.

**Both modes share:**

- One run in flight at a time. A new run waits for `session.idle`; it never
  stacks on a busy session.
- Hard caps: `maxIterations` (default 25), `maxWallClock` (default 4 h), and a
  no-progress rule — two consecutive iterations that make no tool call and
  change no file pause the loop as `no-progress` rather than continue.
- `/loop stop` from the TUI, a Telegram reply, or `loop_complete` all end it.
- State survives a service restart, because it is a `kv` row, not a signal.
- Loop runs are ordinary session runs. Nothing bypasses permissions.

## The Telegram bridge contract

**Setup, once per machine.** `/telegram setup` in the TUI on the machine. The
token is entered into a masked field and written to a `0600` file under the
OpenMod data directory — never typed into the chat, never echoed, never logged.
Pairing is confirmed with a one-time code. After that the bridge starts with the
service; a Windows login restart reconnects without re-pairing.

**Notifications.** Every session, no per-session setup. Sent on: run started,
each tool call (throttled), input needed (permission or question), error,
paused/blocked, and finished. A run's progress edits **one** message rather than
sending more. Never sent: old history on startup, API keys, whole file contents,
or anything the user marked private.

**Replies.** Replying to a notification routes to the session that produced it,
tracked by the notification's own message id — not "the most recent session".
Any `/` command reply is dispatched the same way. Only the paired account is
accepted. A reply never grants a permission the TUI had not granted.

**The `/` menu.** Built from the same registries the TUI uses, so it cannot drift:

- Commands that are prompt bodies (config `commands`, and plugin commands whose
  whole effect is sending text, such as `automation`) run as prompts.
- Dialog-only commands (`themes`, `models`, `agents`, `exit`, `variants`,
  `connect`, `highlights`, `debug`) are listed but answer with one line saying
  they need the OpenMod window. Listing them and refusing is better than omitting
  them and leaving the user to guess.
- The menu is published with `setMyCommands` on setup and refreshed when the
  registry changes.

An unverified assumption, stated plainly: that Telegram's Bot API and the
service's lifetime allow reconnect without re-pairing. The plan's first task
proves it against a fake Bot API before any UI work.

## Order of work

Three subsystems, three plans, in this order:

1. **`/loop`** — self-contained, testable without any network, and the user asked
   for it first. Plan: `docs/superpowers/plans/2026-11-19-loop.md`.
2. **Telegram bridge** — depends on loop only for "blocked" notifications, so it
   can follow independently.
3. **Parity pass** — `/autocompact-setting` (the 70% dialog), then the behaviour
   checklist for undo-of-files, run queue, session diff, and doctor.

## Where the design is decided vs. left open

Decided: the two loop modes and their end conditions; caps and the no-progress
rule; `kv` for loop state; plugin-hosted Telegram; token in a `0600` file; the
`/` menu's three-way handling; work order.

Left open, for the implementer: the exact throttle window for tool-call
notifications; whether progress edits use `editMessageText` only or also
`editMessageReplyMarkup`; the wording of every notification; whether the loop
stores its prompt verbatim or a normalized form.
