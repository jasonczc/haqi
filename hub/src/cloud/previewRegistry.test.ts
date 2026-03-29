import { describe, expect, it } from 'bun:test'
import { PreviewRegistry } from './previewRegistry'

describe('PreviewRegistry', () => {
    it('stores previews by session and lists them', () => {
        const registry = new PreviewRegistry()

        const previews = [
            {
                id: 'preview-1',
                name: 'web',
                port: 3000,
                url: 'http://127.0.0.1:3000',
                visibility: 'private' as const
            }
        ]

        registry.setSessionPreviews('session-1', previews)

        expect(registry.getSessionPreviews('session-1')).toEqual(previews)
        expect(registry.get('session-1')).toEqual(expect.objectContaining({
            sessionId: 'session-1',
            previews
        }))
        expect(registry.list()).toHaveLength(1)
        expect(registry.getPreviewCount('session-1')).toBe(1)
    })

    it('clears previews when empty previews are registered', () => {
        const registry = new PreviewRegistry()

        registry.setSessionPreviews('session-1', [
            {
                id: 'preview-1',
                port: 3000
            }
        ])
        registry.setSessionPreviews('session-1', [])

        expect(registry.get('session-1')).toBeNull()
        expect(registry.list()).toEqual([])
    })
})
