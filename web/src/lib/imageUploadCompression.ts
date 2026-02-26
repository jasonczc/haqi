import { isImageMimeType } from '@/lib/fileAttachments'
import type { ImageUploadCompressionLevel } from '@/lib/imageUploadCompressionSettings'

const NON_COMPRESSIBLE_MIME_TYPES = new Set([
    'image/gif',
    'image/svg+xml'
])

const SCALE_STEPS_BY_LEVEL: Record<ImageUploadCompressionLevel, number[]> = {
    light: [1, 0.95, 0.9, 0.85, 0.8, 0.75],
    balanced: [1, 0.9, 0.8, 0.7, 0.6, 0.5],
    aggressive: [1, 0.85, 0.7, 0.6, 0.5, 0.4, 0.32]
}

const LOSSY_QUALITIES_BY_LEVEL: Record<ImageUploadCompressionLevel, number[]> = {
    light: [0.94, 0.9, 0.86, 0.82],
    balanced: [0.92, 0.85, 0.78, 0.7, 0.62],
    aggressive: [0.86, 0.74, 0.64, 0.54, 0.46]
}

const MIN_SAVINGS_RATIO_BY_LEVEL: Record<ImageUploadCompressionLevel, number> = {
    light: 0.12,
    balanced: 0.08,
    aggressive: 0.02
}

type EncodeAttempt = {
    mimeType: string
    quality?: number
}

type CompressionContext = {
    file: File
    maxBytes: number
    targetBytes: number
    minSavingsRatio: number
}

type CompressionOptions = {
    level?: ImageUploadCompressionLevel
    targetBytes?: number
}

export async function compressImageForUpload(
    file: File,
    maxBytes: number,
    options: CompressionOptions = {}
): Promise<File> {
    const level = options.level ?? 'balanced'
    const scaleSteps = SCALE_STEPS_BY_LEVEL[level] ?? SCALE_STEPS_BY_LEVEL.balanced
    const lossyQualities = LOSSY_QUALITIES_BY_LEVEL[level] ?? LOSSY_QUALITIES_BY_LEVEL.balanced
    const minSavingsRatio = MIN_SAVINGS_RATIO_BY_LEVEL[level] ?? MIN_SAVINGS_RATIO_BY_LEVEL.balanced
    const targetBytes = normalizeTargetBytes(options.targetBytes, maxBytes)
    const originalMimeType = normalizeImageMimeType(file.type)
    if (!originalMimeType || !isImageMimeType(originalMimeType)) {
        return file
    }
    if (NON_COMPRESSIBLE_MIME_TYPES.has(originalMimeType)) {
        return file
    }
    if (typeof document === 'undefined') {
        return file
    }

    const context: CompressionContext = {
        file,
        maxBytes,
        targetBytes,
        minSavingsRatio
    }

    try {
        const image = await loadImageElement(file)
        if (image.naturalWidth <= 0 || image.naturalHeight <= 0) {
            return file
        }

        const canvas = document.createElement('canvas')
        const canvasContext = canvas.getContext('2d')
        if (!canvasContext) {
            return file
        }

        const encodeAttempts = buildEncodeAttempts(originalMimeType, lossyQualities)
        let bestCandidate = file

        for (const scale of scaleSteps) {
            const width = Math.max(1, Math.round(image.naturalWidth * scale))
            const height = Math.max(1, Math.round(image.naturalHeight * scale))

            canvas.width = width
            canvas.height = height
            canvasContext.clearRect(0, 0, width, height)
            canvasContext.drawImage(image, 0, 0, width, height)

            for (const encodeAttempt of encodeAttempts) {
                const blob = await canvasToBlob(canvas, encodeAttempt.mimeType, encodeAttempt.quality)
                if (!blob) {
                    continue
                }

                const candidate = createFileFromBlob(file, blob)
                if (candidate.size >= bestCandidate.size) {
                    continue
                }

                bestCandidate = candidate
                if (candidate.size <= context.targetBytes && shouldUseCompressedCandidate(context, candidate)) {
                    return candidate
                }
            }
        }

        if (shouldUseCompressedCandidate(context, bestCandidate)) {
            return bestCandidate
        }
        return file
    } catch {
        return file
    }
}

function shouldUseCompressedCandidate(context: CompressionContext, candidate: File): boolean {
    if (candidate.size >= context.file.size) {
        return false
    }

    if (context.file.size > context.maxBytes || context.file.size > context.targetBytes) {
        return true
    }

    const reducedBytes = context.file.size - candidate.size
    return reducedBytes >= Math.ceil(context.file.size * context.minSavingsRatio)
}

function normalizeTargetBytes(targetBytes: number | undefined, maxBytes: number): number {
    if (!Number.isFinite(targetBytes) || !targetBytes || targetBytes <= 0) {
        return maxBytes
    }
    return Math.min(Math.floor(targetBytes), maxBytes)
}

function buildEncodeAttempts(originalMimeType: string, lossyQualities: number[]): EncodeAttempt[] {
    const attempts: EncodeAttempt[] = []
    const seen = new Set<string>()

    const add = (mimeType: string, qualities: Array<number | undefined>) => {
        for (const quality of qualities) {
            const key = `${mimeType}:${quality ?? 'auto'}`
            if (seen.has(key)) {
                continue
            }
            seen.add(key)
            attempts.push({ mimeType, quality })
        }
    }

    if (originalMimeType === 'image/png') {
        add('image/png', [undefined])
        add('image/webp', lossyQualities)
        add('image/jpeg', lossyQualities)
        return attempts
    }

    if (originalMimeType === 'image/jpeg' || originalMimeType === 'image/webp') {
        add(originalMimeType, lossyQualities)
        if (originalMimeType !== 'image/webp') {
            add('image/webp', lossyQualities)
        }
        if (originalMimeType !== 'image/jpeg') {
            add('image/jpeg', lossyQualities)
        }
        return attempts
    }

    add(originalMimeType, [undefined])
    add('image/webp', lossyQualities)
    add('image/jpeg', lossyQualities)
    return attempts
}

function normalizeImageMimeType(mimeType: string): string | null {
    const normalized = mimeType.trim().toLowerCase()
    if (normalized.length === 0 || !normalized.startsWith('image/')) {
        return null
    }
    if (normalized === 'image/jpg') {
        return 'image/jpeg'
    }
    return normalized
}

function createFileFromBlob(sourceFile: File, blob: Blob): File {
    const normalizedBlobMime = normalizeImageMimeType(blob.type)
    const mimeType = normalizedBlobMime ?? normalizeImageMimeType(sourceFile.type) ?? 'application/octet-stream'
    const filename = renameFileForMimeType(sourceFile.name, mimeType)

    return new File([blob], filename, {
        type: mimeType,
        lastModified: sourceFile.lastModified
    })
}

function renameFileForMimeType(filename: string, mimeType: string): string {
    const extension = extensionForMimeType(mimeType)
    if (!extension) {
        return filename
    }

    const dotIndex = filename.lastIndexOf('.')
    if (dotIndex <= 0 || dotIndex === filename.length - 1) {
        return `${filename}.${extension}`
    }

    const currentExtension = filename.slice(dotIndex + 1).toLowerCase()
    if (
        currentExtension === extension ||
        (currentExtension === 'jpeg' && extension === 'jpg') ||
        (currentExtension === 'jpg' && extension === 'jpeg')
    ) {
        return filename
    }

    return `${filename.slice(0, dotIndex)}.${extension}`
}

function extensionForMimeType(mimeType: string): string | null {
    if (mimeType === 'image/jpeg') {
        return 'jpg'
    }
    if (mimeType === 'image/png') {
        return 'png'
    }
    if (mimeType === 'image/webp') {
        return 'webp'
    }
    if (mimeType === 'image/avif') {
        return 'avif'
    }
    return null
}

async function loadImageElement(file: File): Promise<HTMLImageElement> {
    const sourceUrl = await createImageSourceUrl(file)
    const image = new Image()

    try {
        await new Promise<void>((resolve, reject) => {
            image.onload = () => resolve()
            image.onerror = () => reject(new Error('Failed to decode image'))
            image.src = sourceUrl
        })
        return image
    } finally {
        if (sourceUrl.startsWith('blob:')) {
            URL.revokeObjectURL(sourceUrl)
        }
    }
}

async function createImageSourceUrl(file: File): Promise<string> {
    if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
        return URL.createObjectURL(file)
    }
    return await fileToDataUrl(file)
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality?: number): Promise<Blob | null> {
    if (typeof canvas.toBlob !== 'function') {
        return Promise.resolve(null)
    }
    return new Promise((resolve) => {
        canvas.toBlob(
            (blob) => resolve(blob),
            mimeType,
            quality
        )
    })
}

function fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
            const result = reader.result
            if (typeof result !== 'string') {
                reject(new Error('Failed to read file'))
                return
            }
            resolve(result)
        }
        reader.onerror = reject
        reader.readAsDataURL(file)
    })
}
