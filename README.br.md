<p align="center">
  <a href="https://github.com/nguoitinhmuahe/openmod">
    <picture>
      <source srcset=".github/assets/logo-ornate-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset=".github/assets/logo-ornate-light.svg" media="(prefers-color-scheme: light)">
      <img src=".github/assets/logo-ornate-light.svg" alt="Logo do OpenMod">
    </picture>
  </a>
</p>
<p align="center">O agente de programação com IA de código aberto.</p>
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

### Instalação

```bash
# YOLO
curl -fsSL https://opencode.ai/v2/install | bash

# Gerenciadores de pacotes
npm i -g @opencode/cli@latest      # ou bun/pnpm/yarn
brew install anomalyco/tap/opencode-v2 # macOS e Linux (recomendado, sempre atualizado)
brew install opencode              # macOS e Linux (fórmula oficial do brew, atualiza menos)
sudo pacman -S opencode            # Arch Linux (Stable)
paru -S opencode-beta              # Arch Linux (Latest from AUR)
mise use -g opencode               # qualquer sistema
nix run github:anomalyco/opencode  # Nix
```

> [!TIP]
> Remova versões anteriores a 0.1.x antes de instalar.

### App desktop (BETA)

O OpenMod também está disponível como aplicativo desktop. Baixe em [opencode.ai/download](https://opencode.ai/download).

| Plataforma            | Download                           |
| --------------------- | ---------------------------------- |
| macOS (Apple Silicon) | `opencode-desktop-mac-arm64.dmg`   |
| macOS (Intel)         | `opencode-desktop-mac-x64.dmg`     |
| Windows               | `opencode-desktop-win-x64.exe`     |
| Linux                 | `.deb`, `.rpm` ou AppImage         |

```bash
# macOS (Homebrew)
brew install --cask opencode-desktop
```

#### Diretório de instalação

O script de instalação instala o OpenMod em `$HOME/.opencode/bin`.

### Agents

O OpenMod inclui dois agents integrados, que você pode alternar com a tecla `Tab`.

- **build** - Padrão, agent com acesso total para trabalho de desenvolvimento
- **plan** - Agent somente leitura para análise e exploração de código
  - Nega edições de arquivos por padrão
  - Pede permissão antes de executar comandos bash
  - Ideal para explorar codebases desconhecidas ou planejar mudanças

Também há um subagent **general** para buscas complexas e tarefas em várias etapas.
Ele é usado internamente e pode ser invocado com `@general` nas mensagens.

Saiba mais sobre [agents](https://opencode.ai/docs/agents).

### Documentação

Para mais informações sobre como configurar o OpenMod, [**veja nossa documentação**](https://opencode.ai/docs).

### Contribuir

Se você tem interesse em contribuir com o OpenMod, leia os [contributing docs](./CONTRIBUTING.md) antes de enviar um pull request.

### Attribution

OpenMod is an independent fork of [opencode](https://github.com/anomalyco/opencode), Copyright (c) 2025 opencode, released under the [MIT License](./LICENSE). The original copyright notice and licence text are retained in full.


---

**This fork:** [github.com/nguoitinhmuahe/openmod](https://github.com/nguoitinhmuahe/openmod) · **Upstream opencode:** [github.com/anomalyco/opencode](https://github.com/anomalyco/opencode)
