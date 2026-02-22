import { logger } from '@/ui/logger'
import { open, readFile, stat, writeFile } from 'fs/promises'
import { createHash } from 'crypto'
import type { RpcHandlerManager } from '@/api/rpc/RpcHandlerManager'
import { resolveValidatedExistingPath, validatePath } from '../pathSecurity'
import { getErrorMessage, rpcError } from '../rpcResponses'

interface ReadFileRequest {
    path: string
    maxBytes?: number
    allowOutsideWorkingDirectory?: boolean
}

interface ReadFileResponse {
    success: boolean
    content?: string
    size?: number
    truncated?: boolean
    error?: string
}

interface WriteFileRequest {
    path: string
    content: string
    expectedHash?: string | null
}

interface WriteFileResponse {
    success: boolean
    hash?: string
    error?: string
}

export function registerFileHandlers(rpcHandlerManager: RpcHandlerManager, workingDirectory: string): void {
    rpcHandlerManager.registerHandler<ReadFileRequest, ReadFileResponse>('readFile', async (data) => {
        logger.debug('Read file request:', data.path)

        try {
            const maxBytesValue = typeof data.maxBytes === 'number' && Number.isFinite(data.maxBytes)
                ? Math.max(0, Math.floor(data.maxBytes))
                : undefined
            const allowOutsideWorkingDirectory = data.allowOutsideWorkingDirectory === true

            const validation = await resolveValidatedExistingPath(data.path, workingDirectory, {
                allowOutsideWorkingDirectory
            })
            if (!validation.valid || !validation.resolvedPath) {
                return rpcError(validation.error ?? 'Invalid file path')
            }

            const resolvedPath = validation.resolvedPath
            const stats = await stat(resolvedPath)
            if (!stats.isFile()) {
                return rpcError('Path is not a regular file')
            }

            const size = stats.size
            let truncated = false
            let buffer: Buffer

            if (maxBytesValue !== undefined && size > maxBytesValue) {
                truncated = true
                if (maxBytesValue === 0) {
                    buffer = Buffer.alloc(0)
                } else {
                    const handle = await open(resolvedPath, 'r')
                    try {
                        buffer = Buffer.alloc(maxBytesValue)
                        const { bytesRead } = await handle.read(buffer, 0, maxBytesValue, 0)
                        buffer = buffer.subarray(0, bytesRead)
                    } finally {
                        await handle.close()
                    }
                }
            } else {
                buffer = await readFile(resolvedPath)
            }

            const content = buffer.toString('base64')
            return { success: true, content, size, truncated }
        } catch (error) {
            logger.debug('Failed to read file:', error)
            return rpcError(getErrorMessage(error, 'Failed to read file'))
        }
    })

    rpcHandlerManager.registerHandler<WriteFileRequest, WriteFileResponse>('writeFile', async (data) => {
        logger.debug('Write file request:', data.path)

        const validation = validatePath(data.path, workingDirectory)
        if (!validation.valid) {
            return rpcError(validation.error ?? 'Invalid file path')
        }

        try {
            if (data.expectedHash !== null && data.expectedHash !== undefined) {
                try {
                    const existingBuffer = await readFile(data.path)
                    const existingHash = createHash('sha256').update(existingBuffer).digest('hex')

                    if (existingHash !== data.expectedHash) {
                        return rpcError(`File hash mismatch. Expected: ${data.expectedHash}, Actual: ${existingHash}`)
                    }
                } catch (error) {
                    const nodeError = error as NodeJS.ErrnoException
                    if (nodeError.code !== 'ENOENT') {
                        throw error
                    }
                    return rpcError('File does not exist but hash was provided')
                }
            } else {
                try {
                    await stat(data.path)
                    return rpcError('File already exists but was expected to be new')
                } catch (error) {
                    const nodeError = error as NodeJS.ErrnoException
                    if (nodeError.code !== 'ENOENT') {
                        throw error
                    }
                }
            }

            const buffer = Buffer.from(data.content, 'base64')
            await writeFile(data.path, buffer)

            const hash = createHash('sha256').update(buffer).digest('hex')

            return { success: true, hash }
        } catch (error) {
            logger.debug('Failed to write file:', error)
            return rpcError(getErrorMessage(error, 'Failed to write file'))
        }
    })
}
