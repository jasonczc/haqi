export type SessionScrollViewMode = 'normal' | 'cli' | 'brief'

export type SessionScrollSnapshot = {
    top: number
    topIndex?: number
    lastKey: string | null
    savedAt: number
}

const SESSION_SCROLL_STATE_STORAGE_KEY = 'hapi:sessionScrollState:v1'

type SessionScrollStateRecord = Record<string, SessionScrollSnapshot>

function buildStorageKey(sessionId: string, viewMode: SessionScrollViewMode): string {
    return `${sessionId}:${viewMode}`
}

function readAllSnapshots(): SessionScrollStateRecord {
    if (typeof window === 'undefined') {
        return {}
    }
    try {
        const raw = window.localStorage.getItem(SESSION_SCROLL_STATE_STORAGE_KEY)
        if (!raw) {
            return {}
        }
        const parsed = JSON.parse(raw)
        if (!parsed || typeof parsed !== 'object') {
            return {}
        }
        return parsed as SessionScrollStateRecord
    } catch {
        return {}
    }
}

function persistAllSnapshots(value: SessionScrollStateRecord): void {
    if (typeof window === 'undefined') {
        return
    }
    try {
        window.localStorage.setItem(SESSION_SCROLL_STATE_STORAGE_KEY, JSON.stringify(value))
    } catch {
    }
}

export function readSessionScrollSnapshot(
    sessionId: string,
    viewMode: SessionScrollViewMode
): SessionScrollSnapshot | null {
    const snapshot = readAllSnapshots()[buildStorageKey(sessionId, viewMode)]
    if (!snapshot || typeof snapshot !== 'object') {
        return null
    }
    const top = typeof snapshot.top === 'number' && Number.isFinite(snapshot.top)
        ? Math.max(0, snapshot.top)
        : 0
    const topIndex = typeof snapshot.topIndex === 'number' && Number.isFinite(snapshot.topIndex)
        ? Math.max(0, Math.floor(snapshot.topIndex))
        : undefined
    const lastKey = typeof snapshot.lastKey === 'string' ? snapshot.lastKey : null
    const savedAt = typeof snapshot.savedAt === 'number' && Number.isFinite(snapshot.savedAt)
        ? snapshot.savedAt
        : 0
    return { top, topIndex, lastKey, savedAt }
}

export function writeSessionScrollSnapshot(
    sessionId: string,
    viewMode: SessionScrollViewMode,
    snapshot: SessionScrollSnapshot
): void {
    const all = readAllSnapshots()
    all[buildStorageKey(sessionId, viewMode)] = {
        top: Math.max(0, snapshot.top),
        topIndex: snapshot.topIndex !== undefined ? Math.max(0, Math.floor(snapshot.topIndex)) : undefined,
        lastKey: typeof snapshot.lastKey === 'string' ? snapshot.lastKey : null,
        savedAt: snapshot.savedAt
    }
    persistAllSnapshots(all)
}
