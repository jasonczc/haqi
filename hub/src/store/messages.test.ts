import { describe, expect, it } from 'bun:test'

import { Store } from './index'

const uploadPath = '/var/folders/tmp/hapi-blobs/session-abc/1778226295654-image.webp'

function userMessage(text: string, options?: {
    sentFrom?: string
    attachments?: Array<{ id: string; filename: string; mimeType: string; size: number; path: string; previewUrl?: string }>
}): unknown {
    return {
        role: 'user',
        content: {
            type: 'text',
            text,
            attachments: options?.attachments
        },
        meta: options?.sentFrom ? { sentFrom: options.sentFrom } : undefined
    }
}

function agentMessage(text: string): unknown {
    return {
        role: 'agent',
        content: {
            type: 'output',
            data: {
                type: 'assistant',
                message: {
                    role: 'assistant',
                    content: [{ type: 'text', text }]
                }
            }
        }
    }
}

function getText(content: unknown): string {
    const record = content as { content?: { text?: string } }
    return record.content?.text ?? ''
}

function createSessionPair(store: Store): { sourceId: string; targetId: string } {
    const source = store.sessions.getOrCreateSession('source', { path: '/tmp/source' }, null, 'default')
    const target = store.sessions.getOrCreateSession('target', { path: '/tmp/target' }, null, 'default')
    return { sourceId: source.id, targetId: target.id }
}

describe('copySessionMessages', () => {
    it('skips cli upload-path echoes when canonical attachment message exists', () => {
        const store = new Store(':memory:')
        const { sourceId, targetId } = createSessionPair(store)

        store.messages.addMessage(sourceId, userMessage('please inspect this', {
            sentFrom: 'webapp',
            attachments: [{
                id: 'att-1',
                filename: 'image.webp',
                mimeType: 'image/webp',
                size: 123,
                path: uploadPath,
                previewUrl: 'data:image/webp;base64,abc'
            }]
        }))
        store.messages.addMessage(sourceId, userMessage(`@${uploadPath}\n\nplease inspect this`, { sentFrom: 'cli' }))
        store.messages.addMessage(sourceId, agentMessage('done'))

        const result = store.messages.copySessionMessages(sourceId, targetId)
        const copied = store.messages.getMessages(targetId)

        expect(result.copied).toBe(2)
        expect(copied).toHaveLength(2)
        expect(getText(copied[0]!.content)).toBe('please inspect this')
        expect(copied.map((message) => getText(message.content))).not.toContain(`@${uploadPath}\n\nplease inspect this`)
    })

    it('redacts orphan cli upload paths instead of copying absolute temp paths', () => {
        const store = new Store(':memory:')
        const { sourceId, targetId } = createSessionPair(store)

        store.messages.addMessage(sourceId, userMessage(`@${uploadPath}\n\nwhat is in this image?`, { sentFrom: 'cli' }))

        const result = store.messages.copySessionMessages(sourceId, targetId)
        const copied = store.messages.getMessages(targetId)

        expect(result.copied).toBe(1)
        expect(copied).toHaveLength(1)
        expect(getText(copied[0]!.content)).toBe('@[1778226295654-image.webp]\n\nwhat is in this image?')
    })
})
