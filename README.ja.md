<p align="center">
  <a href="https://github.com/nguoitinhmuahe/openmod">
    <picture>
      <source srcset=".github/assets/logo-ornate-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset=".github/assets/logo-ornate-light.svg" media="(prefers-color-scheme: light)">
      <img src=".github/assets/logo-ornate-light.svg" alt="OpenMod logo">
    </picture>
  </a>
</p>
<p align="center">オープンソースのAIコーディングエージェント。</p>
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
> **OpenMod is a fork** of [opencode](https://github.com/anomalyco/opencode), which is MIT licensed and copyright its authors.
> The install commands, download links and `opencode.ai` URLs in this document refer to **upstream opencode**, not to this fork.
> The OpenMod-specific changes are listed in [README.md](./README.md#whats-different) and [`OPENMOD-NOTES.md`](./OPENMOD-NOTES.md).

[![OpenMod Terminal UI](services/site/public/v1/docs/assets/lander/screenshot.png)](https://github.com/nguoitinhmuahe/openmod)

---

### インストール

```bash
# YOLO
curl -fsSL https://opencode.ai/v2/install | bash

# パッケージマネージャー
npm i -g @opencode/cli@latest      # bun/pnpm/yarn でもOK
brew install anomalyco/tap/opencode-v2 # macOS と Linux（推奨。常に最新）
brew install opencode              # macOS と Linux（公式 brew formula。更新頻度は低め）
sudo pacman -S opencode            # Arch Linux (Stable)
paru -S opencode-beta              # Arch Linux (Latest from AUR)
mise use -g opencode               # どのOSでも
nix run github:anomalyco/opencode  # Nix
```

> [!TIP]
> インストール前に 0.1.x より古いバージョンを削除してください。

### デスクトップアプリ (BETA)

OpenMod はデスクトップアプリとしても利用できます。[opencode.ai/download](https://opencode.ai/download) からダウンロードしてください。

| プラットフォーム      | ダウンロード                       |
| --------------------- | ---------------------------------- |
| macOS (Apple Silicon) | `opencode-desktop-mac-arm64.dmg`   |
| macOS (Intel)         | `opencode-desktop-mac-x64.dmg`     |
| Windows               | `opencode-desktop-win-x64.exe`     |
| Linux                 | `.deb`、`.rpm`、または AppImage    |

```bash
# macOS (Homebrew)
brew install --cask opencode-desktop
```

#### インストールディレクトリ

インストールスクリプトは、OpenMod を `$HOME/.opencode/bin` にインストールします。

### Agents

OpenMod には組み込みの Agent が2つあり、`Tab` キーで切り替えられます。

- **build** - デフォルト。開発向けのフルアクセス Agent
- **plan** - 分析とコード探索向けの読み取り専用 Agent
  - デフォルトでファイル編集を拒否
  - bash コマンド実行前に確認
  - 未知のコードベース探索や変更計画に最適

また、複雑な検索やマルチステップのタスク向けに **general** サブ Agent も含まれています。
内部的に使用されており、メッセージで `@general` と入力して呼び出せます。

[agents](https://opencode.ai/docs/agents) の詳細はこちら。

### ドキュメント

OpenMod の設定については [**ドキュメント**](https://opencode.ai/docs) を参照してください。

### コントリビュート

OpenMod に貢献したい場合は、Pull Request を送る前に [contributing docs](./CONTRIBUTING.md) を読んでください。

### Attribution

OpenMod is an independent fork of [opencode](https://github.com/anomalyco/opencode), Copyright (c) 2025 opencode, released under the [MIT License](./LICENSE). The original copyright notice and licence text are retained in full.


---

**This fork:** [github.com/nguoitinhmuahe/openmod](https://github.com/nguoitinhmuahe/openmod) · **Upstream opencode:** [github.com/anomalyco/opencode](https://github.com/anomalyco/opencode)
