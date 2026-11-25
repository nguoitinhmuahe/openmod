<p align="center">
  <a href="https://github.com/nguoitinhmuahe/openmod">
    <picture>
      <source srcset=".github/assets/logo-ornate-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset=".github/assets/logo-ornate-light.svg" media="(prefers-color-scheme: light)">
      <img src=".github/assets/logo-ornate-light.svg" alt="OpenMod logo">
    </picture>
  </a>
</p>
<p align="center">A custom fork of opencode — the open source AI coding agent.</p>
<p align="center">
  <a href="https://github.com/nguoitinhmuahe/openmod"><img alt="GitHub" src="https://img.shields.io/github/stars/nguoitinhmuahe/openmod?style=flat-square" /></a>
  <a href="https://github.com/nguoitinhmuahe/openmod/blob/dev/LICENSE"><img alt="License" src="https://img.shields.io/github/license/nguoitinhmuahe/openmod?style=flat-square" /></a>
  <a href="https://github.com/anomalyco/opencode"><img alt="Upstream" src="https://img.shields.io/badge/upstream-anomalyco%2Fopencode-555?style=flat-square" /></a>
</p>

<p align="center">
  <a href="README.md">English</a> |
  <a href="README.zh.md">简体中文</a> |
  <a href="README.zht.md">繁體中文</a> |
  <a href="README.ko.md">한국어</a> |
  <a href="README.de.md">Deutsch</a> |
  <a href="README.es.md">Español</a> |
  <a href="README.fr.md">Français</a> |
  <a href="README.it.md">Italiano</a> |
  <a href="README.da.md">Dansk</a> |
  <a href="README.ja.md">日本語</a> |
  <a href="README.pl.md">Polski</a> |
  <a href="README.ru.md">Русский</a> |
  <a href="README.bs.md">Bosanski</a> |
  <a href="README.ar.md">العربية</a> |
  <a href="README.no.md">Norsk</a> |
  <a href="README.br.md">Português (Brasil)</a> |
  <a href="README.th.md">ไทย</a> |
  <a href="README.tr.md">Türkçe</a> |
  <a href="README.uk.md">Українська</a> |
  <a href="README.bn.md">বাংলা</a> |
  <a href="README.gr.md">Ελληνικά</a> |
  <a href="README.vi.md">Tiếng Việt</a>
</p>

> [!IMPORTANT]
> **OpenMod is a personal fork of [opencode](https://github.com/anomalyco/opencode)**, which is MIT licensed and copyright its authors.
> Everything below the fork notes is upstream documentation. Package names, install commands, download links and `opencode.ai` URLs refer to **upstream opencode**, not to this fork. The OpenMod-specific changes are listed under [What's different](#whats-different) and recorded in [`OPENMOD-NOTES.md`](./OPENMOD-NOTES.md).

[![OpenMod Terminal UI](services/site/public/v1/docs/assets/lander/screenshot.png)](https://github.com/nguoitinhmuahe/openmod)

---

### What's different

OpenMod is opencode with a set of local changes, kept on top of `dev`. The full, merge-oriented log is in [`OPENMOD-NOTES.md`](./OPENMOD-NOTES.md).

- **Loop tooling** — `packages/core/src/loop.ts` plus `opencode_loop_start`, `opencode_loop_complete` and the supporting state/progress modules, so a run can drive itself forward and stop on a defined condition.
- **Telegram bridge** — `packages/core/src/telegram/` with `opencode telegram pair|status|logout`, so a running session can notify a chat and take replies and permission answers back.
- **First-party plugin** `packages/plugins/opencode-mod`:
  - `worktree_diff` and `worktree_apply` tools, merging with `git apply --3way`.
  - Post-edit hooks that run a command after a file changes and append its output to the tool result.
  - Accept-edits modes: `off`, `edits`, `all`.
- **Editable tool results** — a small type change in `packages/plugin` lets a hook rewrite `result.content` and have that reach the model in the same step. The runtime already supported it; the type was the only thing blocking it.
- **TUI identity and motion** — the `OPENMOD` logo and a sidebar mascot, with layered flash effects written as pure `(elapsed, geometry)` functions so they can be tested without a terminal.

### Build from source

OpenMod is not published to npm or Homebrew. Build the binary from this checkout:

```bash
bun install
cd packages/cli
bun run script/build.ts --single --skip-web-ui --skip-install
```

The binary lands in `packages/cli/dist/cli-<platform>-<arch>/bin/opencode`. `--skip-install` is deliberate: Bun blocks six postinstall scripts that the TUI does not use.

### Installation (upstream opencode)

The commands below install upstream opencode, not OpenMod. They are kept here for reference.

```bash
# YOLO
curl -fsSL https://opencode.ai/v2/install | bash

# Package managers
npm i -g @opencode/cli@latest      # or bun/pnpm/yarn
brew install anomalyco/tap/opencode-v2 # macOS and Linux (recommended, always up to date)
brew install opencode              # macOS and Linux (official brew formula, updated less)
sudo pacman -S opencode            # Arch Linux (Stable)
paru -S opencode-beta              # Arch Linux (Latest from AUR)
mise use -g opencode               # Any OS
nix run github:anomalyco/opencode  # Nix
```

> [!TIP]
> Remove versions older than 0.1.x before installing.

### Desktop App (BETA)

opencode is also available as a desktop application. Download it from [opencode.ai/download](https://opencode.ai/download).

| Platform              | Download                           |
| --------------------- | ---------------------------------- |
| macOS (Apple Silicon) | `opencode-desktop-mac-arm64.dmg`   |
| macOS (Intel)         | `opencode-desktop-mac-x64.dmg`     |
| Windows               | `opencode-desktop-win-x64.exe`     |
| Linux                 | `.deb`, `.rpm`, or `.AppImage`     |

```bash
# macOS (Homebrew)
brew install --cask opencode-desktop
```

#### Installation Directory

The upstream install script installs opencode to `$HOME/.opencode/bin`.

### Agents

opencode includes two built-in agents you can switch between with the `Tab` key.

- **build** - Default, full-access agent for development work
- **plan** - Read-only agent for analysis and code exploration
  - Denies file edits by default
  - Asks permission before running bash commands
  - Ideal for exploring unfamiliar codebases or planning changes

Also included is a **general** subagent for complex searches and multistep tasks.
This is used internally and can be invoked using `@general` in messages.

Learn more about [agents](https://opencode.ai/docs/agents).

### Documentation

Configuration, providers and the plugin API belong to upstream and are documented there: [**opencode.ai/docs**](https://opencode.ai/docs). The changes specific to this fork are in [`OPENMOD-NOTES.md`](./OPENMOD-NOTES.md) and [`docs/superpowers`](./docs/superpowers).

### Contributing

Issues and pull requests for this fork go to [this repository](./CONTRIBUTING.md). Upstream contributions go to [anomalyco/opencode](https://github.com/anomalyco/opencode); read its [contributing docs](https://github.com/anomalyco/opencode/blob/dev/CONTRIBUTING.md) before opening a pull request there.

### Attribution

OpenMod is a fork of [opencode](https://github.com/anomalyco/opencode), Copyright (c) 2025 opencode, released under the [MIT License](./LICENSE). The original copyright notice and licence text are retained in full. All original work belongs to the opencode authors; this fork only adds the changes listed above.

---

**This fork:** [github.com/nguoitinhmuahe/openmod](https://github.com/nguoitinhmuahe/openmod) · **Upstream opencode:** [github.com/anomalyco/opencode](https://github.com/anomalyco/opencode)
