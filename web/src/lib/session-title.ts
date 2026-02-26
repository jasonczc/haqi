import type { Session, SessionSummary } from '@/types/api'

type SessionLike = Pick<SessionSummary, 'id' | 'metadata'> | Pick<Session, 'id' | 'metadata'>

export function getSessionTitle(
    session: SessionLike | null | undefined,
    options?: {
        fallbackSessionId?: string | null
        fallbackIdLength?: number
    }
): string {
    const fallbackIdLength = options?.fallbackIdLength ?? 8
    const name = session?.metadata?.name?.trim()
    if (name) {
        return name
    }

    const summaryText = session?.metadata?.summary?.text?.trim()
    if (summaryText) {
        return summaryText
    }

    const path = session?.metadata?.path?.trim()
    if (path) {
        const parts = path.split(/[\\/]+/).filter(Boolean)
        if (parts.length > 0) {
            return parts[parts.length - 1]
        }
    }

    const fallbackId = options?.fallbackSessionId ?? session?.id
    if (fallbackId) {
        return fallbackId.slice(0, fallbackIdLength)
    }

    return 'unknown'
}
