# HAQI Desktop App — Design (MVP)

- Status: Draft (awaiting user review)
- Date: 2026-05-01
- Owner: jasonczc
- Branch: feat/cursor-ui-port (or new branch)

## 1. Goal

Ship a one-click local desktop client for HAQI that replaces the current
two-step `npx @jasonczc/haqi hub` + open-browser flow with a single
double-click installable app. The app reuses the existing `web/` SPA and the
existing `haqi` single-binary hub; it adds only the Electron shell, the
hub-lifecycle glue, and per-platform installers.

The reference architecture is **Claude Desktop**, which has been verified by
extracting `/Applications/Claude.app/Contents/Resources/app.asar` to be a
straightforward Electron + electron-forge + Vite + React + Tailwind app. HAQI
already ships those parts (React 19, Vite 7, Tailwind 4, Bun-compiled hub).
The desktop scope is therefore intentionally minimal: it is a chrome wrapper,
not a rewrite.

## 2. Non-goals (explicit out-of-scope for v1)

- System tray / menu-bar presence
- Global hotkey
- Auto-update via Squirrel feed (Squirrel maker is configured so future
  releases can flip it on without restructuring)
- `haqi://` URL scheme registration
- `haqi app [PATH]` CLI subcommand (Codex-style) — deferred to v2
- MCP host parity with Claude Desktop (separate workstream)
- Linux packaging (mac + win only for v1)
- Multi-window, in-app terminal, in-app SSH

## 3. Reference: Claude Desktop stack (verified, not aspirational)

Extracted from `/Applications/Claude.app/Contents/Resources/app.asar`:

```
@ant/desktop:
  electron 41.3.0
  @electron-forge/cli 7.8.3
  @electron-forge/plugin-vite
  @electron-forge/maker-{dmg, squirrel, msix, pkg, zip}
  @electron-forge/publisher-gcs
  @electron/fuses, @electron/notarize
  vite 6.4.1, @vitejs/plugin-react 4.x
  react 18, react-dom 18
  tailwindcss 3.4
  @modelcontextprotocol/sdk 1.28.0
  @anthropic-ai/claude-agent-sdk
  electron-store, electron-window-state
  node-pty, ssh2 (out of scope for v1)
  drizzle-orm + better-sqlite3 (out of scope for v1)
```

HAQI v1 will adopt the framework subset (`electron`, `electron-forge`,
`plugin-vite`, `maker-{dmg, squirrel, zip}`, `electron-store`,
`electron-window-state`) and skip the data-layer and agent-side parts —
those live in the existing `hub/` workspace and are reached over HTTP.

## 4. Architecture

### 4.1 Repo layout

A new bun workspace `desktop/` is added alongside `cli/ hub/ web/ shared/`:

```
haqi/
├── cli/                      # unchanged
├── hub/                      # unchanged
├── web/                      # unchanged (will be loaded via http://)
├── shared/                   # unchanged
├── desktop/                  # NEW
│   ├── package.json
│   ├── forge.config.ts       # electron-forge config (makers + plugins)
│   ├── vite.main.config.ts   # main process bundle
│   ├── vite.preload.config.ts
│   ├── tsconfig.json
│   └── src/
│       ├── main.ts           # app lifecycle, BrowserWindow
│       ├── preload.ts        # IPC bridge (no-op in v1)
│       ├── hubManager.ts     # detect / spawn / kill hub
│       ├── binaryResolver.ts # find packaged haqi binary or PATH fallback
│       └── windowState.ts    # persist window bounds via electron-window-state
└── package.json              # workspaces += "desktop"
```

The renderer is **not** built inside `desktop/`. The window loads
`http://127.0.0.1:<port>` served by the existing hub, which already embeds
the built `web/` assets via `cli/scripts/build-executable.ts --with-web-assets`.

### 4.2 Process model

```
┌── desktop main proc (Electron Node)
│     ├── hubManager: spawn / supervise haqi binary
│     │     └── child: haqi hub  (Bun-compiled binary, embedded web assets)
│     │             └── child(s): claude / codex / cursor / ... (existing runner pattern)
│     └── BrowserWindow → loadURL("http://127.0.0.1:3006")
└── desktop renderer proc (Chromium) — runs the React SPA
```

Same pattern Codex.app uses: Electron shell + a single bundled native binary
(`Codex.app/Contents/Resources/codex`) acting as the agent backend.

### 4.3 Hub lifecycle (decision P2-A)

`hubManager.ts` invariants:

1. On `app.whenReady`, read `HAPI_LISTEN_PORT` env (default 3006) and
   `~/.hapi/runner.state.json` (if present) to learn the expected port.
2. Probe `GET http://127.0.0.1:<port>/health` (already implemented in
   `hub/src/web/server.ts`) with a short timeout (~250 ms).
3. **If the probe succeeds** — record `weStarted = false`. Do not spawn.
4. **If the probe fails** — `child_process.spawn(haqiBin, ['hub'], { stdio:
   'pipe', detached: false })`. Record `weStarted = true`. Pipe child stdout
   /stderr into a rolling log buffer surfaced under
   `~/Library/Application Support/Haqi/logs/hub.log` (mac) and equivalents.
5. Poll `/health` for up to 15 s; if it never comes up, surface the log tail
   in a native dialog and quit.
6. On `app.before-quit` — only kill the child if `weStarted === true`. If we
   adopted an existing hub, leave it alone (preserves runner-style long-run).

**Rationale.** This matches HAQI's existing runner philosophy (the runner is
explicitly designed to outlive any individual CLI invocation; the desktop is
no different). It also avoids the surprise where a user has `haqi runner
start` running and the desktop quit kills their long-lived sessions.

### 4.4 Binary discovery (decision P1-A)

`binaryResolver.ts` resolution order:

1. **Packaged path** — when running inside a packaged Electron app, look up
   `path.join(process.resourcesPath, platform === 'win32' ? 'hapi.exe' :
   'hapi')`. The forge config gives `extraResource` the explicit binary
   *file* path (not the directory) so it lands directly under `Resources/`
   — exactly mirroring `Codex.app/Contents/Resources/codex`.
2. **Dev path** — when running unpackaged (`bun run --cwd desktop start`),
   resolve to `../cli/dist-exe/<host-target>/hapi` if it exists, else
   spawn `bun ../cli/src/index.ts hub` directly so contributors don't have
   to pre-build the binary.
3. **PATH fallback** — final fallback: spawn `haqi` from `$PATH` (covers
   users running the unpacked dev build with a globally installed haqi).
4. **Missing** — if none of the above resolve, surface a dialog pointing at
   the GitHub release page; do not silently continue.

**Sizing impact.** macOS arm64 binary today is ~50-80 MB; bundling it doubles
the desktop app size. Acceptable: Codex.app bundles a 198 MB Rust binary in
the same place. We accept the trade-off because it is the only way to give
"download → drag to Applications → double-click" a zero-prerequisite path.

### 4.5 Window & state

- Use `electron-window-state` to persist position / size between launches.
- Initial size: 1280 × 800. Minimum 800 × 600.
- Use `electron-store` for any future Electron-only preferences. v1 does not
  store any state itself; web/ already manages session/UI state.
- Title: derived from `__APP_VERSION__` (already injected by `web/`'s
  vite.config.ts, so the same version constant flows through).

## 5. Build, dev, and distribution

### 5.1 Dev workflow

```bash
# Terminal 1 — hub watcher (optional, only if we want hub HMR; usually not)
bun run dev:hub

# Terminal 2 — web SPA dev server (Vite, port 5173)
bun run dev:web

# Terminal 3 — desktop in dev mode
bun run --cwd desktop start          # electron-forge start
```

In dev mode, `hubManager` should **prefer `http://127.0.0.1:5173`** (Vite
dev server with HMR) over the hub-served bundle when `HAQI_DESKTOP_DEV_URL`
is set. The hub still spawns to provide the API endpoints; only the renderer
URL changes. Production builds always use the hub-served bundle (single
origin, no CORS, no extra port).

### 5.2 Build pipeline

Add to root `package.json`:

```json
"scripts": {
  "build:desktop": "bun run build:single-exe && bun run --cwd desktop make",
  "dev:desktop": "concurrently \"bun run dev:hub\" \"bun run dev:web\" \"bun run --cwd desktop start\""
}
```

`bun run --cwd desktop make` runs `electron-forge make`, which:

1. Reads `forge.config.ts`
2. Bundles main + preload via `@electron-forge/plugin-vite`
3. Copies the platform-matched binary from `cli/dist-exe/<target>/` into
   `Resources/bin/` (via the `extraResource` field on the platform
   config)
4. Produces:
   - `desktop/out/make/Haqi-darwin-arm64-<version>.dmg`
   - `desktop/out/make/Haqi-darwin-x64-<version>.dmg`
   - `desktop/out/make/squirrel.windows/x64/Haqi-Setup-<version>.exe`
   - `desktop/out/make/zip/<platform>/<arch>/Haqi-<version>.zip`
     (used by future auto-update feeds)

### 5.3 CI / release integration

- Reuse the existing GitHub Actions release workflow that already builds
  per-platform `haqi` binaries via the `Release` workflow (tag-driven,
  `cli/package.json` version-locked).
- Add a `desktop-build` matrix job that runs **after** the binary build job
  and consumes the platform binary as an artifact:

```yaml
desktop-build:
  needs: build-binaries
  strategy:
    matrix:
      include:
        - { os: macos-14, target: bun-darwin-arm64 }
        - { os: macos-13, target: bun-darwin-x64 }
        - { os: windows-2022, target: bun-windows-x64 }
  steps:
    - uses: actions/download-artifact@v4
      with: { name: haqi-binary-${{ matrix.target }}, path: cli/dist-exe }
    - run: bun install
    - run: bun run --cwd desktop make
    - uses: actions/upload-artifact@v4
      with: { name: haqi-desktop-${{ matrix.target }}, path: desktop/out/make }
```

- Code signing / notarization is **not** wired in v1. Builds are ad-hoc
  signed (mac) and unsigned (win); the GitHub Release page will note that
  users may need to override Gatekeeper / SmartScreen. Anthropic-style
  proper signing + `@electron/notarize` is a v1.1 follow-up.

## 6. Detailed component specs

### 6.1 `desktop/package.json`

Pinned to versions verified inside Claude Desktop's `app.asar` where
practical, upgraded only where HAQI's existing stack diverges (we use
React 19, Vite 7, Tailwind 4 already, so the renderer carries those
versions; desktop main only needs Electron-side deps).

```jsonc
{
  "name": "haqi-desktop",
  "private": true,
  "version": "0.15.5",                          // mirrors cli/package.json
  "main": ".vite/build/main.js",
  "scripts": {
    "start": "electron-forge start",
    "package": "electron-forge package",
    "make": "electron-forge make",
    "lint": "tsc --noEmit"
  },
  "devDependencies": {
    "@electron-forge/cli": "^7.10.0",
    "@electron-forge/plugin-vite": "^7.10.0",
    "@electron-forge/maker-dmg": "^7.10.0",
    "@electron-forge/maker-squirrel": "^7.10.0",
    "@electron-forge/maker-zip": "^7.10.0",
    "@electron/fuses": "^1.8.0",
    "electron": "^41.3.0",
    "typescript": "^5.9.3",
    "vite": "^7.3.0"
  },
  "dependencies": {
    "electron-store": "^8.2.0",
    "electron-window-state": "^5.0.3"
  }
}
```

### 6.2 `desktop/forge.config.ts` (key shape)

```ts
import type { ForgeConfig } from '@electron-forge/shared-types';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import { resolve } from 'node:path';

function platformBinPath(): string {
  const binName = process.platform === 'win32' ? 'hapi.exe' : 'hapi';
  if (process.platform === 'darwin') {
    const dir = process.arch === 'arm64' ? 'bun-darwin-arm64' : 'bun-darwin-x64';
    return resolve(__dirname, `../cli/dist-exe/${dir}/${binName}`);
  }
  if (process.platform === 'win32') {
    return resolve(__dirname, `../cli/dist-exe/bun-windows-x64/${binName}`);
  }
  if (process.platform === 'linux') {
    const dir = process.arch === 'arm64' ? 'bun-linux-arm64' : 'bun-linux-x64-baseline';
    return resolve(__dirname, `../cli/dist-exe/${dir}/${binName}`);
  }
  throw new Error(`Unsupported platform ${process.platform}/${process.arch}`);
}

export default {
  packagerConfig: {
    asar: true,
    name: 'Haqi',
    appBundleId: 'run.hapi.desktop',
    // File path, not directory: electron-packager copies the file into
    // Resources/, giving Resources/hapi (or Resources/hapi.exe on win).
    extraResource: [platformBinPath()]
  },
  makers: [
    new MakerDMG({}),
    new MakerSquirrel({ name: 'haqi' }),
    new MakerZIP({}, ['darwin', 'win32'])
  ],
  plugins: [
    new VitePlugin({
      build: [
        { entry: 'src/main.ts',    config: 'vite.main.config.ts',    target: 'main' },
        { entry: 'src/preload.ts', config: 'vite.preload.config.ts', target: 'preload' }
      ],
      renderer: []        // no renderer here — we load remote URL
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.OnlyLoadAppFromAsar]: true
    })
  ]
} satisfies ForgeConfig;
```

### 6.3 `desktop/src/main.ts` (skeleton)

```ts
import { app, BrowserWindow, dialog, shell } from 'electron';
import path from 'node:path';
import { ensureHubRunning, shutdownIfWeStartedIt } from './hubManager';
import { restoreWindowState } from './windowState';

async function createWindow() {
  let port: number;
  try {
    port = await ensureHubRunning();
  } catch (err) {
    dialog.showErrorBox('Haqi failed to start the local hub', String(err));
    app.quit();
    return;
  }

  const winState = restoreWindowState();
  const win = new BrowserWindow({
    ...winState,
    minWidth: 800,
    minHeight: 600,
    title: 'Haqi',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true
    }
  });

  const devUrl = process.env.HAQI_DESKTOP_DEV_URL;
  await win.loadURL(devUrl ?? `http://127.0.0.1:${port}`);

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
app.on('before-quit', shutdownIfWeStartedIt);
```

### 6.4 `desktop/src/hubManager.ts` (contract)

```ts
export async function ensureHubRunning(): Promise<number>;
// Returns the listening port. Sets module-private `weStarted` flag.

export async function shutdownIfWeStartedIt(): Promise<void>;
// No-op if we adopted an existing hub. Else SIGTERM the child, wait up to
// 5 s for graceful exit, then SIGKILL.

// Internals (not exported, listed here for spec clarity):
function probeHealth(port: number): Promise<boolean>;
function spawnHubChild(binary: string, port: number): ChildProcess;
function pollUntilHealthy(port: number, timeoutMs: number): Promise<void>;
function readRunnerStatePort(): number | null;   // ~/.hapi/runner.state.json
```

The probe target is `GET /health` which is already exposed at
`hub/src/web/server.ts:92`.

### 6.5 `desktop/src/binaryResolver.ts` (contract)

```ts
export interface ResolvedBinary {
  kind: 'packaged' | 'dev-built' | 'dev-source' | 'path';
  command: string;
  args: string[];
}

export function resolveHaqiBinary(): ResolvedBinary;
// Throws with a user-actionable message if nothing resolves.
```

Resolution order documented in §4.4.

## 7. Risks and open questions

| # | Risk | Mitigation |
|---|------|------------|
| R1 | electron-forge plugin-vite + bun workspace untested | Spike before scoping work — if `bun install` symlink layout breaks `electron`, fall back to `nodeLinker: node-modules` workaround |
| R2 | Bun-compiled `haqi hub` binary spawns sub-binaries (claude, codex, ripgrep) — those may inherit Electron's signed environment in a way that confuses macOS Gatekeeper | Test signed-but-not-notarized DMG end-to-end before declaring v1 done; Anthropic's app.asar uses `cowork-plugin-shim.sh` for similar cross-bin handoff, may need similar shim |
| R3 | Hub default port 3006 may collide with user-started hub running on a different port | `readRunnerStatePort()` reads canonical port from `runner.state.json`; only spawn on default if no state file |
| R4 | First-launch hub spawn time > UX-acceptable | Surface a splash window during the up-to-15 s window; if it exceeds 15 s, dialog shows tail of `hub.log` rather than failing silently |
| R5 | Code signing / notarization missing in v1 | Documented in release notes; Gatekeeper override one-time per user; v1.1 will add `@electron/notarize` |
| R6 | App store distribution (MAS / MS Store) excluded | Out of scope; can be added later via `maker-pkg` (mac) or existing `maker-msix` (win) |
| R7 | `web/`'s VitePWA registers a service worker; loading via Electron may either silently install it (harmless) or interact poorly with `app.asar`-style caches | Disable SW in renderer when `navigator.userAgent` reports Electron (small patch in `web/src/main.tsx` or via `VITE_DISABLE_PWA` env wired through hub) |
| R8 | `actions/download-artifact` name in §5.3 must match the upload name in the existing release workflow | Audit `.github/workflows/*.yml` while wiring the new `desktop-build` job; either align names or add an upload step in the binary job |

## 8. Testing plan

- **Unit**: `hubManager.ts` (mock fetch + spawn; assert `weStarted` flag,
  graceful shutdown, port-already-bound path).
- **Unit**: `binaryResolver.ts` (mock `process.resourcesPath` + filesystem;
  assert ordering and dev-fallback behavior).
- **Manual smoke** (per platform, before merging):
  1. Fresh user, never run `haqi` before → install DMG → launch → window
     opens against fresh hub spawn.
  2. User has `haqi runner start` running → launch desktop → window opens
     against existing hub; quit desktop → runner still running.
  3. Hub spawn times out (simulated by env-blocking `/health`) → dialog
     shows log tail; app quits cleanly.
  4. Window position persists across quit/relaunch.

## 9. Migration / rollout

- **Branch**: `feat/desktop-shell` off `main`.
- **No breaking changes** to `cli/`, `hub/`, or `web/`. Desktop is purely
  additive.
- **Release**: First desktop release will be `v0.16.0` (minor bump from
  current `0.15.5`). DMG + Squirrel artifacts attached to the GitHub
  release alongside existing per-platform binaries.
- **README**: A "Desktop App" section will be added to root `README.md`
  pointing at the GitHub Release page. The existing `npx @jasonczc/haqi`
  flow remains supported and recommended for power users / headless boxes.

## 10. Future (v1.1+)

In rough priority order:

1. `@electron/notarize` + Apple Developer ID + Microsoft code-signing cert.
2. Squirrel auto-update feed + `update-electron-app` integration.
3. `haqi://` URL scheme + macOS `cfBundleURLTypes` registration.
4. `haqi app [PATH]` CLI subcommand (Codex pattern) — packaged binary is
   already inside the app bundle, just expose the launcher path on PATH.
5. System tray + global hotkey.
6. Linux AppImage (low priority — neither Claude Desktop nor Codex Desktop
   ship Linux as of 2026-05).
7. Embedded MCP host (Claude Desktop parity) — significantly larger
   workstream; deserves its own spec.

## 11. Decisions log (locked-in for this spec)

| ID  | Decision | Chosen | Reason |
|-----|----------|--------|--------|
| P1  | Where does the desktop find the `haqi` binary? | Ship inside the app bundle (`Resources/bin/`) | Zero-prerequisite install; matches Codex.app |
| P2  | Hub lifecycle when desktop quits | Kill only what we spawned; leave adopted hubs running | Preserves HAQI's runner long-run philosophy |
| P3  | Platforms in v1 | macOS (arm64 + x64) + Windows x64 | Matches Claude Desktop scope; Linux deferred |
| P4  | Renderer source | Load `http://127.0.0.1:<port>` (hub-served), not bundle a copy of `web/dist` | Single source of truth; auto-updates with hub |
| P5  | Stack | Electron 41 + electron-forge 7 + plugin-vite, electron-store, electron-window-state | Verified identical to Claude Desktop |
