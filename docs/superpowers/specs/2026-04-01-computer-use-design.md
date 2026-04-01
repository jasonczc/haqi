# Computer Use Design: VNC Desktop + Agent Tools + Recording

## Overview

Add Computer Use capabilities to daemon-session containers: a full graphical desktop environment (XFCE + VNC), remote desktop access via noVNC through Hub, agent desktop tools (Claude computer use + Playwright), and video recording of agent sessions.

## Container Desktop Environment

### Dockerfile additions

```dockerfile
RUN apt-get update && apt-get install -y \
    xfce4 xfce4-terminal dbus-x11 \
    tigervnc-standalone-server tigervnc-common \
    novnc websockify \
    chromium-browser \
    xdotool scrot imagemagick \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*
```

Plus Playwright:
```dockerfile
RUN bun add playwright && bunx playwright install chromium --with-deps
```

### Daemon startup

```
haqi-daemon starts
  +- Start Xvfb (virtual X11 display :1, 1280x720)
  +- Start XFCE4 session (lightweight desktop)
  +- Start VNC server (port 5901, token auth)
  +- Start websockify (port 6080, VNC -> WebSocket bridge)
  +- Start HTTP+WS server (port 9876, existing daemon API)
  +- Wait for agent spawn
```

### Container ports

| Port | Purpose |
|------|---------|
| 9876 | daemon HTTP API (existing) |
| 6080 | noVNC WebSocket (new) |

Worker maps both ports when creating container.

## Remote Desktop Access

### Access path

```
User browser
  -> Hub /desktop/:sessionId/
  -> Hub WebSocket proxy
  -> Worker WS bridge
  -> daemon container :6080 (websockify -> VNC)
  -> User sees XFCE desktop, can interact with mouse/keyboard
```

### Implementation

Reuse preview tunnel architecture with WebSocket proxy:

- Hub new route: `/desktop/:sessionId/` 
- HTTP requests: serve noVNC static HTML (embedded noVNC JS client)
- WebSocket upgrade: proxy to Worker -> daemon's websockify port (6080)
- Worker's preview bridge extended to support noVNC port

### Web UI

- Session page adds "Desktop" button
- Opens `/desktop/:sessionId/` in iframe or new window
- User sees agent operating desktop in real-time
- User can take over (mouse/keyboard through noVNC)

### Remote desktop takeover

- User operates via noVNC directly (mouse clicks, keyboard input)
- Shares same X11 display with agent
- Agent's xdotool and user's input both work (whoever acts takes effect)

## Agent Computer Use Tools

### Claude Computer Use (desktop operations)

Daemon new API endpoints:

| Method | Path | Action |
|--------|------|--------|
| POST | `/desktop/screenshot` | `scrot` capture, return base64 PNG |
| POST | `/desktop/click` | `xdotool mousemove --sync X Y click 1` |
| POST | `/desktop/type` | `xdotool type "text"` |
| POST | `/desktop/key` | `xdotool key "shortcut"` (e.g., ctrl+s) |
| POST | `/desktop/scroll` | `xdotool scroll up/down` |
| GET | `/desktop/cursor` | `xdotool getmouselocation` |
| POST | `/desktop/open-browser` | `chromium-browser <url> &` |

Agent computer use loop:
```
Screenshot -> Claude analyzes image -> Decides click/type -> Execute -> Screenshot verify -> Loop
```

### Playwright (precise browser operations)

Daemon new API endpoints:

| Method | Path | Action |
|--------|------|--------|
| POST | `/browser/navigate` | `page.goto(url)` |
| POST | `/browser/click` | `page.click(selector)` |
| POST | `/browser/type` | `page.fill(selector, text)` |
| POST | `/browser/screenshot` | `page.screenshot()` → base64 PNG |
| GET | `/browser/content` | `page.content()` → HTML |
| POST | `/browser/evaluate` | `page.evaluate(script)` → result |

### Tool division

- **Claude computer use**: general desktop operations (any GUI app)
- **Playwright**: precise browser operations (CSS selectors, DOM)

### Agent integration

V1: Agent calls daemon HTTP API directly via `curl`/`fetch` from within the container. Future: wrap as MCP tools.

## Video Recording + Screenshots

### Recording control

| Method | Path | Action |
|--------|------|--------|
| POST | `/recording/start` | `ffmpeg -f x11grab` start recording |
| POST | `/recording/stop` | Stop ffmpeg, return mp4 path |
| GET | `/recording/status` | Is recording active? |
| GET | `/recording/download` | Download mp4 file |
| POST | `/screenshot/capture` | `scrot` capture, save, return ID |
| GET | `/screenshot/:id` | Download screenshot |

### ffmpeg command

```bash
ffmpeg -f x11grab -video_size 1280x720 -framerate 5 \
  -i :1 -c:v libx264 -preset ultrafast -crf 30 \
  /tmp/haqi-recordings/session-<id>.mp4
```

5fps + high compression = small files, sufficient to see agent actions.

### Automatic behavior

- Recording starts automatically for setup sessions (or when user enables)
- Stops when session ends
- Files stored at `/tmp/haqi-recordings/` in container
- Downloadable via daemon API

### Hub integration

- `GET /api/sessions/:id/recordings` — list recording files (proxy to Worker -> daemon)
- `GET /api/sessions/:id/recordings/:fileId` — download file
- Web UI session page shows recording list + video player

## Changes Summary

| Module | Change |
|--------|--------|
| `Dockerfile.workspace` | Install XFCE + VNC + noVNC + Chrome + xdotool + scrot + ffmpeg + Playwright |
| `daemon/src/desktop/vnc.ts` | Start Xvfb + XFCE + VNC + websockify |
| `daemon/src/desktop/computerUse.ts` | screenshot/click/type/key/scroll API |
| `daemon/src/desktop/browser.ts` | Playwright browser control API |
| `daemon/src/desktop/recording.ts` | ffmpeg recording start/stop + file management |
| `daemon/src/server.ts` | Register /desktop/*, /browser/*, /recording/* routes |
| `daemon/src/index.ts` | Initialize desktop environment on startup |
| `cli/src/cloud/executors/WorkspaceContainerManager.ts` | Map port 6080 |
| `hub/src/web/routes/desktop.ts` | /desktop/:sessionId/ route + WS proxy |
| `hub/src/web/server.ts` | Register desktop route |
| `web/src/routes/sessions/desktop.tsx` | noVNC iframe page |
| `web/src/router.tsx` | Add desktop route |

## Testing

- daemon unit tests: VNC startup, screenshot API, recording start/stop
- Playwright API tests: navigate, click, screenshot
- End-to-end: spawn daemon-session -> open /desktop/:sid/ -> see desktop -> agent screenshot -> record video -> download
