import { app, BrowserWindow, dialog, shell } from 'electron'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildRendererUrl, findDeepLinkArg, parseDeepLink, type DesktopRoute } from './deepLink'
import { ensureHubRunning, readHubLogTail, shutdownIfWeStartedIt } from './hubManager'
import { loadWindowState, persistWindowState } from './windowState'

const __dirname = dirname(fileURLToPath(import.meta.url))

let mainWindow: BrowserWindow | null = null
let rendererBaseUrl: string | null = null
let pendingRoute: DesktopRoute = parseDeepLink(findDeepLinkArg(process.argv))
let shutdownStarted = false

function registerProtocolClient(): void {
    if (process.defaultApp) {
        const appPath = process.argv[1]
        if (appPath) {
            app.setAsDefaultProtocolClient('haqi', process.execPath, [appPath])
            return
        }
    }
    app.setAsDefaultProtocolClient('haqi')
}

function routeFromCommandLine(commandLine: readonly string[]): DesktopRoute | null {
    const link = findDeepLinkArg(commandLine)
    return link ? parseDeepLink(link) : null
}

async function loadRoute(route: DesktopRoute): Promise<void> {
    if (!mainWindow || !rendererBaseUrl) {
        pendingRoute = route
        return
    }
    await mainWindow.loadURL(buildRendererUrl(rendererBaseUrl, route))
    if (mainWindow.isMinimized()) {
        mainWindow.restore()
    }
    mainWindow.show()
    mainWindow.focus()
}

async function createWindow(): Promise<void> {
    let port: number
    try {
        port = await ensureHubRunning({
            isPackaged: app.isPackaged,
            resourcesPath: process.resourcesPath,
            cwd: app.isPackaged ? process.cwd() : join(__dirname, '..', '..'),
            logDir: app.getPath('logs')
        })
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const logTail = readHubLogTail()
        dialog.showErrorBox(
            'HAQI failed to start the local hub',
            logTail ? `${message}\n\n${logTail}` : message
        )
        app.quit()
        return
    }

    rendererBaseUrl = process.env.HAQI_DESKTOP_DEV_URL || `http://127.0.0.1:${port}`
    const windowState = loadWindowState(app.getPath('userData'))
    mainWindow = new BrowserWindow({
        ...windowState,
        minWidth: 800,
        minHeight: 600,
        title: 'HAQI',
        show: false,
        webPreferences: {
            preload: join(__dirname, 'preload.js'),
            contextIsolation: true,
            sandbox: true,
            nodeIntegration: false
        }
    })
    persistWindowState(mainWindow, app.getPath('userData'))

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        void shell.openExternal(url)
        return { action: 'deny' }
    })

    mainWindow.on('closed', () => {
        mainWindow = null
    })

    await loadRoute(pendingRoute)
}

const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
    app.quit()
} else {
    app.on('second-instance', (_event, commandLine) => {
        const route = routeFromCommandLine(commandLine) ?? { kind: 'sessions' }
        void loadRoute(route)
    })

    app.on('open-url', (event, url) => {
        event.preventDefault()
        void loadRoute(parseDeepLink(url))
    })

    app.whenReady().then(async () => {
        registerProtocolClient()
        await createWindow()
    }).catch((error: unknown) => {
        dialog.showErrorBox('HAQI failed to start', error instanceof Error ? error.message : String(error))
        app.quit()
    })

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            void createWindow()
        } else if (mainWindow) {
            mainWindow.show()
            mainWindow.focus()
        }
    })

    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') {
            app.quit()
        }
    })

    app.on('before-quit', (event) => {
        if (shutdownStarted) {
            return
        }
        shutdownStarted = true
        event.preventDefault()
        void shutdownIfWeStartedIt().finally(() => app.exit(0))
    })
}
