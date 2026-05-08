import type { Session, SessionSummary } from '@/types/api'

type SessionLike = Pick<SessionSummary, 'id' | 'metadata'> | Pick<Session, 'id' | 'metadata'>

const HAPI_BLOBS_TITLE_PATH_PATTERN = /@([^\s"'`<>()]*[/\\]hapi-blobs[/\\][^\s"'`<>()]+)/g

export function sanitizeSessionDisplayText(value: string): string {
    return value
        .replace(HAPI_BLOBS_TITLE_PATH_PATTERN, '')
        .replace(/\s+/g, ' ')
        .trim()
}

function cleanTitleCandidate(value: string | undefined): string | undefined {
    const trimmed = value?.trim() ?? ''
    if (!trimmed) return undefined
    const sanitized = sanitizeSessionDisplayText(trimmed)
    return sanitized || undefined
}

export function getSessionTitle(
    session: SessionLike | null | undefined,
    options?: {
        fallbackSessionId?: string | null
        fallbackIdLength?: number
    }
): string {
    const fallbackIdLength = options?.fallbackIdLength ?? 8
    const name = cleanTitleCandidate(session?.metadata?.name)
    if (name) {
        return name
    }

    const summaryText = cleanTitleCandidate(session?.metadata?.summary?.text)
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
