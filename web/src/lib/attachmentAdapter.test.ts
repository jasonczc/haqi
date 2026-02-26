import { describe, expect, it, vi } from 'vitest'
import type { ApiClient } from '@/api/client'
import { createAttachmentAdapter, preserveUploadPathsForQueue } from '@/lib/attachmentAdapter'

describe('attachmentAdapter queue preservation', () => {
    it('keeps preserved upload path when clearing queued attachments', async () => {
        const api = {
            deleteUploadFile: vi.fn(async () => ({ success: true }))
        } as unknown as ApiClient

        const sessionId = 'session-queue-preserve'
        const path = '/tmp/hapi-upload.txt'
        const adapter = createAttachmentAdapter(api, sessionId)

        preserveUploadPathsForQueue(sessionId, [path])

        await adapter.remove({ id: 'att-1', path } as unknown as Parameters<typeof adapter.remove>[0])
        expect(api.deleteUploadFile).not.toHaveBeenCalled()

        await adapter.remove({ id: 'att-2', path } as unknown as Parameters<typeof adapter.remove>[0])
        expect(api.deleteUploadFile).toHaveBeenCalledTimes(1)
        expect(api.deleteUploadFile).toHaveBeenCalledWith(sessionId, path)
    })

    it('deletes upload immediately when path is not preserved', async () => {
        const api = {
            deleteUploadFile: vi.fn(async () => ({ success: true }))
        } as unknown as ApiClient

        const sessionId = 'session-normal-remove'
        const path = '/tmp/hapi-normal.txt'
        const adapter = createAttachmentAdapter(api, sessionId)

        await adapter.remove({ id: 'att-normal', path } as unknown as Parameters<typeof adapter.remove>[0])
        expect(api.deleteUploadFile).toHaveBeenCalledTimes(1)
        expect(api.deleteUploadFile).toHaveBeenCalledWith(sessionId, path)
    })

    it('isolates preserved paths by session', async () => {
        const apiA = {
            deleteUploadFile: vi.fn(async () => ({ success: true }))
        } as unknown as ApiClient
        const apiB = {
            deleteUploadFile: vi.fn(async () => ({ success: true }))
        } as unknown as ApiClient

        const sessionA = 'session-A'
        const sessionB = 'session-B'
        const path = '/tmp/hapi-shared.txt'
        const adapterA = createAttachmentAdapter(apiA, sessionA)
        const adapterB = createAttachmentAdapter(apiB, sessionB)

        preserveUploadPathsForQueue(sessionA, [path])

        await adapterB.remove({ id: 'att-b', path } as unknown as Parameters<typeof adapterB.remove>[0])
        expect(apiB.deleteUploadFile).toHaveBeenCalledTimes(1)
        expect(apiB.deleteUploadFile).toHaveBeenCalledWith(sessionB, path)

        await adapterA.remove({ id: 'att-a', path } as unknown as Parameters<typeof adapterA.remove>[0])
        expect(apiA.deleteUploadFile).not.toHaveBeenCalled()
    })
})
