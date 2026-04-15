import { exec, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile } from 'node:fs/promises'
import type { ScreenshotResponse, ClickRequest, TypeRequest, KeyRequest, ScrollRequest } from '../types'
import { resolveDesktopBrowserExecutable } from './browserExecutable'
import { getDesktopEnv } from './desktopEnv'

const execAsync = promisify(exec)

export async function takeScreenshot(): Promise<ScreenshotResponse> {
    const path = `/tmp/screenshot-${Date.now()}.png`
    await execAsync(`scrot -o ${path}`, { env: getDesktopEnv() })
    const buffer = await readFile(path)
    const image = buffer.toString('base64')
    // Get dimensions
    const { stdout } = await execAsync(`identify -format '%wx%h' ${path}`, { env: getDesktopEnv() })
    const [width, height] = stdout.split('x').map(Number)
    return { image, width: width || 1280, height: height || 720 }
}

export async function click(req: ClickRequest): Promise<void> {
    if (req.x < 0 || req.y < 0) throw new Error('Coordinates must be non-negative')
    const button = req.button === 'right' ? '3' : req.button === 'middle' ? '2' : '1'
    await execAsync(`xdotool mousemove --sync ${req.x} ${req.y} click ${button}`, { env: getDesktopEnv() })
}

export async function typeText(req: TypeRequest): Promise<void> {
    if (!req.text) return
    await execAsync(`xdotool type --delay 50 -- "${req.text.replace(/"/g, '\\"')}"`, { env: getDesktopEnv() })
}

export async function pressKey(req: KeyRequest): Promise<void> {
    if (!req.key.trim()) throw new Error('Key must not be empty')
    await execAsync(`xdotool key -- ${req.key}`, { env: getDesktopEnv() })
}

export async function scroll(req: ScrollRequest): Promise<void> {
    const clicks = req.clicks ?? 3
    if (req.x !== undefined && req.y !== undefined) {
        await execAsync(`xdotool mousemove --sync ${req.x} ${req.y}`, { env: getDesktopEnv() })
    }
    const button = req.direction === 'up' ? '4' : '5'
    await execAsync(`xdotool click --repeat ${clicks} ${button}`, { env: getDesktopEnv() })
}

export async function getCursorPosition(): Promise<{ x: number; y: number }> {
    const { stdout } = await execAsync('xdotool getmouselocation', { env: getDesktopEnv() })
    const match = stdout.match(/x:(\d+)\s+y:(\d+)/)
    return { x: Number(match?.[1] ?? 0), y: Number(match?.[2] ?? 0) }
}

export function openBrowser(url: string): void {
    const executable = resolveDesktopBrowserExecutable()
    if (!executable) {
        throw new Error('No supported desktop browser executable found')
    }

    spawn(executable, ['--disable-gpu', url], {
        stdio: 'ignore',
        detached: true,
        env: getDesktopEnv()
    }).unref()
}
