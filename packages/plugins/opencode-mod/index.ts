import { Plugin, type PluginContext } from "./src/plugin.ts"

export default Plugin.define({
  id: "opencode.mod",
  async setup(ctx: PluginContext) {
    const [worktree, hooks, edits] = await Promise.all([
      import("./src/worktree.ts"),
      import("./src/hooks.ts"),
      import("./src/accept-edits.ts"),
    ])
    await worktree.setup(ctx)
    await hooks.setup(ctx)
    await edits.setup(ctx)
    // Notifications and replies. Runs only when a token was paired; setup() returns
    // at once otherwise, so an unpaired install costs nothing.
    const telegram = await import("./src/telegram/index.ts")
    await telegram.setup(ctx)
  },
})