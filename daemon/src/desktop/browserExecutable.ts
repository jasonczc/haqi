import { existsSync } from 'node:fs'

const BROWSER_CANDIDATES = [
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
]

export function resolveDesktopBrowserExecutable(): string | null {
    for (const candidate of BROWSER_CANDIDATES) {
        if (existsSync(candidate)) {
            return candidate
        }
    }

    return null
}
