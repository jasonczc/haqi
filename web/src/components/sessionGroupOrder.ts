const STORAGE_KEY = 'hapi:sessionsGroupOrder'
const PROJECT_OFFLINE_STORAGE_KEY = 'hapi:sessionsProjectOffline'

export function normalizeSessionGroupOrder(value: string | null): string[] {
    if (!value) return []
    try {
        const parsed = JSON.parse(value) as unknown
        if (!Array.isArray(parsed)) return []
        const seen = new Set<string>()
        const result: string[] = []
        for (const item of parsed) {
            if (typeof item !== 'string') continue
            const directory = item.trim()
            if (!directory || seen.has(directory)) continue
            seen.add(directory)
            result.push(directory)
        }
        return result
    } catch {
        return []
    }
}

export function loadSessionGroupOrder(): string[] {
    try {
        return normalizeSessionGroupOrder(localStorage.getItem(STORAGE_KEY))
    } catch {
        return []
    }
}

export function persistSessionGroupOrder(order: string[]): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(order))
    } catch {
        // ignore storage failures
    }
}

export function loadSessionProjectOffline(): string[] {
    try {
        return normalizeSessionGroupOrder(localStorage.getItem(PROJECT_OFFLINE_STORAGE_KEY))
    } catch {
        return []
    }
}

export function persistSessionProjectOffline(directories: string[]): void {
    const normalized = Array.from(new Set(directories.map((value) => value.trim()).filter(Boolean)))
    try {
        localStorage.setItem(PROJECT_OFFLINE_STORAGE_KEY, JSON.stringify(normalized))
    } catch {
        // ignore storage failures
    }
}

export function reconcileSessionGroupOrder(order: string[], directories: string[]): string[] {
    const valid = new Set(directories)
    const kept = order.filter((directory) => valid.has(directory))
    const keptSet = new Set(kept)
    const appended = directories.filter((directory) => !keptSet.has(directory))
    return [...kept, ...appended]
}

export function applySessionGroupOrder<T extends { directory: string }>(groups: T[], order: string[]): T[] {
    if (groups.length <= 1) return groups
    const orderIndex = new Map<string, number>()
    order.forEach((directory, idx) => {
        orderIndex.set(directory, idx)
    })
    return [...groups].sort((a, b) => {
        const rankA = orderIndex.get(a.directory)
        const rankB = orderIndex.get(b.directory)
        if (rankA === undefined && rankB === undefined) return 0
        if (rankA === undefined) return 1
        if (rankB === undefined) return -1
        return rankA - rankB
    })
}

export function moveSessionGroup(order: string[], sourceDirectory: string, targetDirectory: string): string[] {
    const sourceIndex = order.indexOf(sourceDirectory)
    const targetIndex = order.indexOf(targetDirectory)
    if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) {
        return order
    }

    const next = [...order]
    const [moved] = next.splice(sourceIndex, 1)
    next.splice(targetIndex, 0, moved)
    return next
}
