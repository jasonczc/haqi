import type { PermissionMode } from '@/types/api'

export type PathProbeState = 'available' | 'missing' | 'blocked' | 'error'
export type PathProbeResult = {
    state: PathProbeState
    errorMessage?: string
}

const MAX_CONCURRENT_PROBES = 6
const MAX_CACHE_ITEMS = 500
const TTL_BY_STATE_MS: Record<PathProbeState, number> = {
    available: 30_000,
    missing: 8_000,
    blocked: 15_000,
    error: 5_000
}

const probeCache = new Map<string, { result: PathProbeResult; expiresAt: number }>()
const inFlightProbes = new Map<string, Promise<PathProbeResult>>()
const pendingQueue: Array<() => void> = []
let runningProbeCount = 0

function dequeueProbe(): void {
    if (runningProbeCount >= MAX_CONCURRENT_PROBES) {
        return
    }
    const next = pendingQueue.shift()
    if (next) {
        next()
    }
}

function scheduleProbe<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const run = () => {
            runningProbeCount += 1
            void task()
                .then(resolve)
                .catch(reject)
                .finally(() => {
                    runningProbeCount = Math.max(0, runningProbeCount - 1)
                    dequeueProbe()
                })
        }

        if (runningProbeCount < MAX_CONCURRENT_PROBES) {
            run()
            return
        }

        pendingQueue.push(run)
    })
}

function trimCacheIfNeeded(): void {
    if (probeCache.size <= MAX_CACHE_ITEMS) {
        return
    }

    const overflow = probeCache.size - MAX_CACHE_ITEMS
    let removed = 0
    for (const key of probeCache.keys()) {
        probeCache.delete(key)
        removed += 1
        if (removed >= overflow) {
            break
        }
    }
}

function getCachedProbeResult(key: string): PathProbeResult | null {
    const cached = probeCache.get(key)
    if (!cached) {
        return null
    }

    if (Date.now() >= cached.expiresAt) {
        probeCache.delete(key)
        return null
    }

    return cached.result
}

function setCachedProbeResult(key: string, result: PathProbeResult): void {
    const ttl = TTL_BY_STATE_MS[result.state] ?? 5_000
    probeCache.set(key, {
        result,
        expiresAt: Date.now() + ttl
    })
    trimCacheIfNeeded()
}

export function buildPathProbeKey(sessionId: string, permissionMode: PermissionMode | undefined, path: string): string {
    return `${sessionId}::${permissionMode ?? 'unknown'}::${path}`
}

export async function getOrLoadPathProbeResult(
    key: string,
    loader: () => Promise<PathProbeResult>
): Promise<PathProbeResult> {
    const cached = getCachedProbeResult(key)
    if (cached) {
        return cached
    }

    const inFlight = inFlightProbes.get(key)
    if (inFlight) {
        return await inFlight
    }

    const promise = scheduleProbe(async () => {
        const result = await loader()
        setCachedProbeResult(key, result)
        return result
    })
        .finally(() => {
            inFlightProbes.delete(key)
        })

    inFlightProbes.set(key, promise)
    return await promise
}

export function __resetPathProbeStoreForTests(): void {
    probeCache.clear()
    inFlightProbes.clear()
    pendingQueue.splice(0, pendingQueue.length)
    runningProbeCount = 0
}
