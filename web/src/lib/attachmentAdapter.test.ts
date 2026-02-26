import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PendingAttachment } from '@assistant-ui/react'
import type { ApiClient } from '@/api/client'
import { createAttachmentAdapter, preserveUploadPathsForQueue } from '@/lib/attachmentAdapter'
import { compressImageForUpload } from '@/lib/imageUploadCompression'
import {
    imageUploadCompressionTargetSizeToBytes,
    readImageUploadCompressionSettings
} from '@/lib/imageUploadCompressionSettings'

vi.mock('@/lib/imageUploadCompression', () => ({
    compressImageForUpload: vi.fn(async (file: File) => file)
}))

vi.mock('@/lib/imageUploadCompressionSettings', () => ({
    imageUploadCompressionTargetSizeToBytes: vi.fn((targetSize: string) => {
        if (targetSize === '1mb') {
            return 1024 * 1024
        }
        if (targetSize === '500kb') {
            return 500 * 1024
        }
        return undefined
    }),
    readImageUploadCompressionSettings: vi.fn(() => ({
        enabled: true,
        level: 'balanced',
        targetSize: 'auto'
    }))
}))

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024

beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(compressImageForUpload).mockImplementation(async (file: File) => file)
    vi.mocked(imageUploadCompressionTargetSizeToBytes).mockImplementation((targetSize: string) => {
        if (targetSize === '1mb') {
            return 1024 * 1024
        }
        if (targetSize === '500kb') {
            return 500 * 1024
        }
        return undefined
    })
    vi.mocked(readImageUploadCompressionSettings).mockReturnValue({
        enabled: true,
        level: 'balanced',
        targetSize: 'auto'
    })
})

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

describe('attachmentAdapter image compression', () => {
    it('compresses image attachments before upload and keeps updated metadata', async () => {
        const api = {
            uploadFile: vi.fn(async () => ({ success: true, path: '/tmp/upload-compressed' })),
            deleteUploadFile: vi.fn(async () => ({ success: true }))
        } as unknown as ApiClient

        const sessionId = 'session-image-compress'
        const adapter = createAttachmentAdapter(api, sessionId)
        const original = new File([new Uint8Array([1, 2, 3, 4, 5, 6])], 'screenshot.png', { type: 'image/png' })
        const compressed = new File([new Uint8Array([1, 2, 3])], 'screenshot.jpg', { type: 'image/jpeg' })

        vi.mocked(compressImageForUpload).mockResolvedValueOnce(compressed)

        const states = await collectAddStates(adapter, original)

        expect(compressImageForUpload).toHaveBeenCalledTimes(1)
        expect(compressImageForUpload).toHaveBeenCalledWith(original, MAX_UPLOAD_BYTES, {
            level: 'balanced',
            targetBytes: undefined
        })
        expect(imageUploadCompressionTargetSizeToBytes).toHaveBeenCalledWith('auto')
        expect(api.uploadFile).toHaveBeenCalledTimes(1)
        expect(api.uploadFile).toHaveBeenCalledWith(
            sessionId,
            compressed.name,
            expect.any(String),
            compressed.type
        )

        const finalState = states.at(-1)
        expect(finalState?.status.type).toBe('requires-action')
        expect(finalState?.name).toBe(compressed.name)
        expect(finalState?.contentType).toBe(compressed.type)
        expect(finalState?.file?.size).toBe(compressed.size)
        expect((finalState as { previewUrl?: string } | undefined)?.previewUrl).toContain('data:image/jpeg;base64,')
    })

    it('rejects attachment when compressed image still exceeds upload limit', async () => {
        const api = {
            uploadFile: vi.fn(async () => ({ success: true, path: '/tmp/upload-too-big' })),
            deleteUploadFile: vi.fn(async () => ({ success: true }))
        } as unknown as ApiClient

        const adapter = createAttachmentAdapter(api, 'session-too-big')
        const original = new File([new Uint8Array([7, 8, 9])], 'huge.png', { type: 'image/png' })
        const compressedTooLarge = {
            name: 'huge.jpg',
            type: 'image/jpeg',
            size: MAX_UPLOAD_BYTES + 1
        } as unknown as File

        vi.mocked(compressImageForUpload).mockResolvedValueOnce(compressedTooLarge)

        const states = await collectAddStates(adapter, original)
        const finalState = states.at(-1)

        expect(compressImageForUpload).toHaveBeenCalledTimes(1)
        expect(imageUploadCompressionTargetSizeToBytes).toHaveBeenCalledWith('auto')
        expect(api.uploadFile).not.toHaveBeenCalled()
        expect(finalState?.status.type).toBe('incomplete')
        expect(finalState?.name).toBe(compressedTooLarge.name)
        expect(finalState?.contentType).toBe(compressedTooLarge.type)
        expect(finalState?.file?.size).toBe(compressedTooLarge.size)
    })

    it('keeps existing non-image upload flow', async () => {
        const api = {
            uploadFile: vi.fn(async () => ({ success: true, path: '/tmp/upload-text' })),
            deleteUploadFile: vi.fn(async () => ({ success: true }))
        } as unknown as ApiClient

        const sessionId = 'session-non-image'
        const adapter = createAttachmentAdapter(api, sessionId)
        const file = new File([new Uint8Array([97, 98, 99])], 'notes.txt', { type: 'text/plain' })

        const states = await collectAddStates(adapter, file)
        const finalState = states.at(-1)

        expect(compressImageForUpload).not.toHaveBeenCalled()
        expect(imageUploadCompressionTargetSizeToBytes).not.toHaveBeenCalled()
        expect(api.uploadFile).toHaveBeenCalledTimes(1)
        expect(api.uploadFile).toHaveBeenCalledWith(
            sessionId,
            file.name,
            expect.any(String),
            file.type
        )
        expect(finalState?.status.type).toBe('requires-action')
        expect(finalState?.name).toBe(file.name)
        expect(finalState?.contentType).toBe(file.type)
    })

    it('skips compression when image compression setting is disabled', async () => {
        const api = {
            uploadFile: vi.fn(async () => ({ success: true, path: '/tmp/upload-image-no-compress' })),
            deleteUploadFile: vi.fn(async () => ({ success: true }))
        } as unknown as ApiClient

        vi.mocked(readImageUploadCompressionSettings).mockReturnValueOnce({
            enabled: false,
            level: 'aggressive',
            targetSize: 'auto'
        })

        const sessionId = 'session-image-no-compress'
        const adapter = createAttachmentAdapter(api, sessionId)
        const image = new File([new Uint8Array([1, 2, 3, 4, 5, 6])], 'photo.png', { type: 'image/png' })

        const states = await collectAddStates(adapter, image)
        const finalState = states.at(-1)

        expect(compressImageForUpload).not.toHaveBeenCalled()
        expect(api.uploadFile).toHaveBeenCalledTimes(1)
        expect(api.uploadFile).toHaveBeenCalledWith(
            sessionId,
            image.name,
            expect.any(String),
            image.type
        )
        expect(finalState?.status.type).toBe('requires-action')
        expect(finalState?.name).toBe(image.name)
    })

    it('passes targetBytes when target size setting is selected', async () => {
        const api = {
            uploadFile: vi.fn(async () => ({ success: true, path: '/tmp/upload-target-size' })),
            deleteUploadFile: vi.fn(async () => ({ success: true }))
        } as unknown as ApiClient

        vi.mocked(readImageUploadCompressionSettings).mockReturnValueOnce({
            enabled: true,
            level: 'balanced',
            targetSize: '1mb'
        })

        const sessionId = 'session-image-target-size'
        const adapter = createAttachmentAdapter(api, sessionId)
        const image = new File([new Uint8Array([1, 2, 3, 4, 5, 6])], 'target.png', { type: 'image/png' })

        await collectAddStates(adapter, image)

        expect(compressImageForUpload).toHaveBeenCalledWith(image, MAX_UPLOAD_BYTES, {
            level: 'balanced',
            targetBytes: 1024 * 1024
        })
        expect(imageUploadCompressionTargetSizeToBytes).toHaveBeenCalledWith('1mb')
    })
})

async function collectAddStates(
    adapter: ReturnType<typeof createAttachmentAdapter>,
    file: File
): Promise<PendingAttachment[]> {
    const states: PendingAttachment[] = []
    const result = adapter.add({ file })
    if (isAsyncIterable<PendingAttachment>(result)) {
        for await (const state of result) {
            states.push(state)
        }
        return states
    }
    states.push(await result)
    return states
}

function isAsyncIterable<T>(value: unknown): value is AsyncIterable<T> {
    return typeof value === 'object' &&
        value !== null &&
        Symbol.asyncIterator in value &&
        typeof (value as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] === 'function'
}
