import { Plugin, type PluginContext } from "./src/plugin.ts"

// The external half of the mod: the pieces that only make sense as an opt-in user
// plugin, listed in config.
//
// Telegram is deliberately NOT here. It has to work the moment a token is paired,
// without the user editing config to enable anything, so it lives as an internal
// plugin in core (packages/core/src/tool/plugin/telegram.ts). Having it in both
// places meant two bridges ran at once, each polling the same bot.
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
  },
})
