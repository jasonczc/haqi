import type { PreviewTarget } from '@hapi/protocol/types'

type PreviewRegistryEntry = {
    sessionId: string
    updatedAt: number
    previews: PreviewTarget[]
}

export class PreviewRegistry {
    private readonly previewsBySessionId = new Map<string, PreviewRegistryEntry>()

    list(): PreviewRegistryEntry[] {
        return [...this.previewsBySessionId.values()]
    }

    get(sessionId: string): PreviewRegistryEntry | null {
        return this.previewsBySessionId.get(sessionId) ?? null
    }

    setSessionPreviews(sessionId: string, previews: PreviewTarget[] | undefined): void {
        if (!previews || previews.length === 0) {
            this.previewsBySessionId.delete(sessionId)
            return
        }

        this.previewsBySessionId.set(sessionId, {
            sessionId,
            updatedAt: Date.now(),
            previews
        })
    }

    getSessionPreviews(sessionId: string): PreviewTarget[] {
        return this.previewsBySessionId.get(sessionId)?.previews ?? []
    }

    getPreviewCount(sessionId: string): number {
        return this.getSessionPreviews(sessionId).length
    }

    clearSession(sessionId: string): void {
        this.previewsBySessionId.delete(sessionId)
    }
}
