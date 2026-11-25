<p align="center">
  <a href="https://github.com/nguoitinhmuahe/openmod">
    <picture>
      <source srcset=".github/assets/logo-ornate-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset=".github/assets/logo-ornate-light.svg" media="(prefers-color-scheme: light)">
      <img src=".github/assets/logo-ornate-light.svg" alt="OpenMod logo">
    </picture>
  </a>
</p>
<p align="center">Otwartoźródłowy agent kodujący AI.</p>
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

### Instalacja

```bash
# YOLO
curl -fsSL https://opencode.ai/v2/install | bash

# Menedżery pakietów
npm i -g @opencode/cli@latest      # albo bun/pnpm/yarn
brew install anomalyco/tap/opencode-v2 # macOS i Linux (polecane, zawsze aktualne)
brew install opencode              # macOS i Linux (oficjalna formuła brew, rzadziej aktualizowana)
sudo pacman -S opencode            # Arch Linux (Stable)
paru -S opencode-beta              # Arch Linux (Latest from AUR)
mise use -g opencode               # dowolny system
nix run github:anomalyco/opencode  # Nix
```

> [!TIP]
> Przed instalacją usuń wersje starsze niż 0.1.x.

### Aplikacja desktopowa (BETA)

OpenMod jest także dostępny jako aplikacja desktopowa. Pobierz ją z [opencode.ai/download](https://opencode.ai/download).

| Platforma             | Pobieranie                         |
| --------------------- | ---------------------------------- |
| macOS (Apple Silicon) | `opencode-desktop-mac-arm64.dmg`   |
| macOS (Intel)         | `opencode-desktop-mac-x64.dmg`     |
| Windows               | `opencode-desktop-win-x64.exe`     |
| Linux                 | `.deb`, `.rpm` lub AppImage        |

```bash
# macOS (Homebrew)
brew install --cask opencode-desktop
```

#### Katalog instalacji

Skrypt instalacyjny instaluje OpenMod w `$HOME/.opencode/bin`.

### Agents

OpenMod zawiera dwóch wbudowanych agentów, między którymi możesz przełączać się klawiszem `Tab`.

- **build** - Domyślny agent z pełnym dostępem do pracy developerskiej
- **plan** - Agent tylko do odczytu do analizy i eksploracji kodu
  - Domyślnie odmawia edycji plików
  - Pyta o zgodę przed uruchomieniem komend bash
  - Idealny do poznawania nieznanych baz kodu lub planowania zmian

Dodatkowo jest subagent **general** do złożonych wyszukiwań i wieloetapowych zadań.
Jest używany wewnętrznie i można go wywołać w wiadomościach przez `@general`.

Dowiedz się więcej o [agents](https://opencode.ai/docs/agents).

### Dokumentacja

Więcej informacji o konfiguracji OpenMod znajdziesz w [**dokumentacji**](https://opencode.ai/docs).

### Współtworzenie

Jeśli chcesz współtworzyć OpenMod, przeczytaj [contributing docs](./CONTRIBUTING.md) przed wysłaniem pull requesta.

### Attribution

OpenMod is an independent fork of [opencode](https://github.com/anomalyco/opencode), Copyright (c) 2025 opencode, released under the [MIT License](./LICENSE). The original copyright notice and licence text are retained in full.


---

**This fork:** [github.com/nguoitinhmuahe/openmod](https://github.com/nguoitinhmuahe/openmod) · **Upstream opencode:** [github.com/anomalyco/opencode](https://github.com/anomalyco/opencode)
