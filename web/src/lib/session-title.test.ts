import { describe, expect, it } from 'vitest'
import { getSessionTitle, sanitizeSessionDisplayText } from '@/lib/session-title'

describe('session-title', () => {
    it('removes copied hapi blob paths from display text', () => {
        const text = '@/var/folders/tmp/hapi-blobs/session/image.webp\n\n继续检查侧边栏'
        expect(sanitizeSessionDisplayText(text)).toBe('继续检查侧边栏')
    })

    it('falls back when metadata title only contains a hapi blob path', () => {
        expect(getSessionTitle({
            id: 'session_abcdef',
            metadata: {
                summary: { text: '@/var/folders/tmp/hapi-blobs/session/image.webp' },
                path: '/Users/jasonczc/workspace/haqi'
            }
        })).toBe('haqi')
    })
})
