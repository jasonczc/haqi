import type { BrowserWindow, Rectangle } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

export interface SavedWindowState {
    width: number
    height: number
    x?: number
    y?: number
}

const DEFAULT_STATE: SavedWindowState = {
    width: 1280,
    height: 800
}

function isValidBounds(value: unknown): value is SavedWindowState {
    if (!value || typeof value !== 'object') {
        return false
    }
    const candidate = value as Partial<SavedWindowState>
    return typeof candidate.width === 'number'
        && candidate.width >= 800
        && typeof candidate.height === 'number'
        && candidate.height >= 600
}

export function loadWindowState(userDataPath: string): SavedWindowState {
    const file = join(userDataPath, 'window-state.json')
    try {
        if (!existsSync(file)) {
            return DEFAULT_STATE
        }
        const parsed = JSON.parse(readFileSync(file, 'utf8')) as unknown
        return isValidBounds(parsed) ? parsed : DEFAULT_STATE
    } catch {
        return DEFAULT_STATE
    }
}

export function saveWindowState(userDataPath: string, bounds: Rectangle): void {
    const file = join(userDataPath, 'window-state.json')
    mkdirSync(dirname(file), { recursive: true })
    const next: SavedWindowState = {
        x: bounds.x,
        y: bounds.y,
        width: Math.max(800, bounds.width),
        height: Math.max(600, bounds.height)
    }
    writeFileSync(file, JSON.stringify(next, null, 2), 'utf8')
}

export function persistWindowState(win: BrowserWindow, userDataPath: string): void {
    win.on('close', () => {
        saveWindowState(userDataPath, win.getBounds())
    })
}
