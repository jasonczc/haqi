# Quick Start

<Steps>

## Install HAQI

::: code-group

```bash [npm]
npm install -g @twsxtd/haqi
```

```bash [Homebrew]
brew install tiann/tap/hapi
```

```bash [npx (one-off)]
npx @twsxtd/haqi
```

:::

Other install options: [Installation](./installation.md)

## Start the hub

```bash
haqi hub --relay
```

On first run, HAQI prints an access token and saves it to `~/.hapi/settings.json`.

`haqi server` remains supported as an alias.

The terminal will display a URL and QR code for remote access.

> End-to-end encrypted with WireGuard + TLS.

## Start a coding session

```bash
haqi
```

This starts Claude Code wrapped with HAQI. The session appears in the web UI.

## Open the UI

Open the URL shown in the terminal, or scan the QR code with your phone.

Enter your access token to log in.

</Steps>

## Next steps

- [Seamless Handoff](./how-it-works.md#seamless-handoff) - Switch between terminal and phone seamlessly
- [Hub setup](./installation.md#hub-setup) - Access HAQI from anywhere
- [Notifications](./installation.md#telegram-setup) - Set up Telegram notifications
- [Install the App](./pwa.md) - Add HAQI to your home screen
