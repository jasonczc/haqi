import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'

import type { ApiClient } from '@/api/client'
import {
    loadSessionProjectOffline,
    persistSessionProjectOffline
} from '@/components/sessionGroupOrder'

function normalizeProjectOfflineDirectories(directories: Iterable<string>): string[] {
    const seen = new Set<string>()
    const normalized: string[] = []
    for (const directory of directories) {
        const trimmed = directory.trim()
        if (!trimmed || seen.has(trimmed)) {
            continue
        }
        seen.add(trimmed)
        normalized.push(trimmed)
    }
    return normalized
}

export function useProjectOfflineDirectories(api: ApiClient | null): {
    projectOfflineDirectories: Set<string>
    setProjectOfflineDirectories: Dispatch<SetStateAction<Set<string>>>
} {
    const [initialLocalDirectories] = useState<string[]>(
        () => normalizeProjectOfflineDirectories(loadSessionProjectOffline())
    )
    const [projectOfflineDirectories, setProjectOfflineDirectories] = useState<Set<string>>(
        () => new Set(initialLocalDirectories)
    )
    const [remoteReady, setRemoteReady] = useState(false)
    const lastPersistedSerializedRef = useRef<string>(JSON.stringify(initialLocalDirectories))

    useEffect(() => {
        if (!api) {
            setRemoteReady(false)
            return
        }

        let cancelled = false
        setRemoteReady(false)

        void api.getProjectOfflineSettings()
            .then((response) => {
                if (cancelled) {
                    return
                }

                const remoteDirectories = normalizeProjectOfflineDirectories(response.directories)
                const nextDirectories = remoteDirectories.length > 0
                    ? remoteDirectories
                    : normalizeProjectOfflineDirectories(loadSessionProjectOffline())

                if (remoteDirectories.length > 0) {
                    lastPersistedSerializedRef.current = JSON.stringify(remoteDirectories)
                } else {
                    // Remote empty: one-time migration path from existing local storage
                    lastPersistedSerializedRef.current = JSON.stringify([])
                }

                persistSessionProjectOffline(nextDirectories)
                setProjectOfflineDirectories(new Set(nextDirectories))
                setRemoteReady(true)
            })
            .catch(() => {
                if (cancelled) {
                    return
                }
                setRemoteReady(false)
            })

        return () => {
            cancelled = true
        }
    }, [api])

    useEffect(() => {
        const normalized = normalizeProjectOfflineDirectories(projectOfflineDirectories)
        const serialized = JSON.stringify(normalized)

        if (serialized === lastPersistedSerializedRef.current) {
            return
        }

        persistSessionProjectOffline(normalized)

        if (!api || !remoteReady) {
            lastPersistedSerializedRef.current = serialized
            return
        }

        const snapshot = serialized
        void api.updateProjectOfflineSettings({ directories: normalized })
            .then((response) => {
                const canonical = normalizeProjectOfflineDirectories(response.directories)
                const canonicalSerialized = JSON.stringify(canonical)

                lastPersistedSerializedRef.current = canonicalSerialized
                persistSessionProjectOffline(canonical)
                setProjectOfflineDirectories((prev) => {
                    const prevSerialized = JSON.stringify(normalizeProjectOfflineDirectories(prev))
                    if (prevSerialized === canonicalSerialized) {
                        return prev
                    }
                    return new Set(canonical)
                })
            })
            .catch(() => {
                lastPersistedSerializedRef.current = snapshot
            })
    }, [api, remoteReady, projectOfflineDirectories])

    return {
        projectOfflineDirectories,
        setProjectOfflineDirectories
    }
}
