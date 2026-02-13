# HAPI

Run official Claude Code / Codex / Gemini / OpenCode sessions locally and control them remotely through a Web / PWA / Telegram Mini App.

> **Why HAPI?** HAPI is a local-first alternative to Happy. See [Why Not Happy?](docs/guide/why-hapi.md) for the key differences.

## Features

- **Seamless Handoff** - Work locally, switch to remote when needed, switch back anytime. No context loss, no session restart.
- **Native First** - HAPI wraps your AI agent instead of replacing it. Same terminal, same experience, same muscle memory.
- **AFK Without Stopping** - Step away from your desk? Approve AI requests from your phone with one tap.
- **Your AI, Your Choice** - Claude Code, Codex, Gemini, OpenCode—different models, one unified workflow.
- **Terminal Anywhere** - Run commands from your phone or browser, directly connected to the working machine.
- **Voice Control** - Talk to your AI agent hands-free using the built-in voice assistant.

## Branch-only features（本分支独有功能）

This branch includes a focused set of web UX upgrades. Based on the commit history, the optimizations are grouped as follows:

### 1) Session Sidebar / 项目会话侧边栏

- **Project-level quick create (+)**  
  Add a new session directly under an existing project entry.
- **Density switch (comfortable / compact)**  
  Sidebar list can switch between two densities.
- **Desktop resizable sidebar**  
  VSCode-like drag-to-resize splitter behavior.
- **Responsive sidebar behavior**
  - Desktop supports show/hide.
  - Mobile uses drawer-style interaction with improved controls.
- **Project reorder by drag-and-drop (persisted)**
  - No dedicated handle button required.
  - Desktop direct drag; mobile long-press drag.
  - Order is persisted locally.
- **Virtualized session list**
  Better performance and smoother rendering with many items.

### 2) Chat History Loading / 聊天历史加载体验

- **Stabilized auto-load scroll retention**
  Loading older messages keeps viewport position stable.
- **Reduced jump-to-top behavior across batches**
  Improved continuity while scrolling through long history.
- **History loading feedback + behavior tuning**
  Better loading-state handling during top-triggered history fetch.

### 3) Quality & Test Coverage / 质量与测试

- Added targeted tests for:
  - **history scroll retention logic**
  - **project group reorder helpers**

## Demo

https://github.com/user-attachments/assets/38230353-94c6-4dbe-9c29-b2a2cc457546

## Getting Started

```bash
npx @twsxtd/hapi hub --relay     # start hub with E2E encrypted relay
npx @twsxtd/hapi                 # run claude code
```

`hapi server` remains supported as an alias.

The terminal will display a URL and QR code. Scan the QR code with your phone or open the URL to access.

> The relay uses WireGuard + TLS for end-to-end encryption. Your data is encrypted from your device to your machine.

For self-hosted options (Cloudflare Tunnel, Tailscale), see [Installation](docs/guide/installation.md)

## Docs

- [App](docs/guide/pwa.md)
- [How it Works](docs/guide/how-it-works.md)
- [Voice Assistant](docs/guide/voice-assistant.md)
- [Why HAPI](docs/guide/why-hapi.md)
- [FAQ](docs/guide/faq.md)

## Build from source

```bash
bun install
bun run build:single-exe
```

## Credits

HAPI means "哈皮" a Chinese transliteration of [Happy](https://github.com/slopus/happy). Great credit to the original project.
