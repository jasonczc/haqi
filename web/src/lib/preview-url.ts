export function normalizePreviewUrlInput(raw: string): { value: string | null; error?: string } {
    const trimmed = raw.trim()
    if (!trimmed) {
        return { value: null }
    }

    const candidates = trimmed.includes('://')
        ? [trimmed]
        : [`http://${trimmed}`, `https://${trimmed}`]

    for (const candidate of candidates) {
        try {
            const url = new URL(candidate)
            if (url.protocol !== 'http:' && url.protocol !== 'https:') {
                return { value: null, error: 'Preview URL must use http:// or https://' }
            }
            return { value: url.toString() }
        } catch {
        }
    }

    return { value: null, error: 'Invalid preview URL' }
}
