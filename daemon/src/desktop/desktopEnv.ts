import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

function defaultRuntimeDir(): string {
    const user = process.env.USER || process.env.LOGNAME || 'haqi'
    return process.env.XDG_RUNTIME_DIR || `/tmp/xdg-runtime-${user}`
}

function sessionEnvFilePath(): string {
    return process.env.HAQI_DESKTOP_ENV_FILE || join(defaultRuntimeDir(), 'haqi-desktop-session.env')
}

function readDesktopSessionEnvFile(): Record<string, string> {
    const filePath = sessionEnvFilePath()
    if (!existsSync(filePath)) {
        return {}
    }

    const content = readFileSync(filePath, 'utf8')
    const env: Record<string, string> = {}
    for (const rawLine of content.split('\n')) {
        const line = rawLine.trim()
        if (!line || line.startsWith('#')) {
            continue
        }

        const separator = line.indexOf('=')
        if (separator <= 0) {
            continue
        }

        const key = line.slice(0, separator)
        const value = line.slice(separator + 1)
        env[key] = value
    }

    return env
}

export function getDesktopEnv(): NodeJS.ProcessEnv {
    const sessionEnv = readDesktopSessionEnvFile()
    return {
        ...process.env,
        DISPLAY: process.env.DISPLAY || sessionEnv.DISPLAY || ':1',
        ...sessionEnv
    }
}
