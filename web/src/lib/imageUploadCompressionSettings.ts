export type ImageUploadCompressionLevel = 'light' | 'balanced' | 'aggressive'
export type ImageUploadCompressionTargetSize = 'auto' | '500kb' | '1mb' | '2mb' | '5mb'

export type ImageUploadCompressionSettings = {
    enabled: boolean
    level: ImageUploadCompressionLevel
    targetSize: ImageUploadCompressionTargetSize
}

export const IMAGE_UPLOAD_COMPRESSION_ENABLED_KEY = 'hapi:imageUploadCompressionEnabled'
export const IMAGE_UPLOAD_COMPRESSION_LEVEL_KEY = 'hapi:imageUploadCompressionLevel'
export const IMAGE_UPLOAD_COMPRESSION_TARGET_SIZE_KEY = 'hapi:imageUploadCompressionTargetSize'

const DEFAULT_IMAGE_UPLOAD_COMPRESSION_SETTINGS: ImageUploadCompressionSettings = {
    enabled: true,
    level: 'balanced',
    targetSize: 'auto'
}

function getStorage(storage?: Storage | null): Storage | null {
    if (storage !== undefined) {
        return storage
    }
    if (typeof window === 'undefined') {
        return null
    }
    return window.localStorage
}

export function normalizeImageUploadCompressionLevel(value: string | null): ImageUploadCompressionLevel {
    if (value === 'light' || value === 'balanced' || value === 'aggressive') {
        return value
    }
    return DEFAULT_IMAGE_UPLOAD_COMPRESSION_SETTINGS.level
}

export function normalizeImageUploadCompressionTargetSize(value: string | null): ImageUploadCompressionTargetSize {
    if (value === 'auto' || value === '500kb' || value === '1mb' || value === '2mb' || value === '5mb') {
        return value
    }
    return DEFAULT_IMAGE_UPLOAD_COMPRESSION_SETTINGS.targetSize
}

export function normalizeImageUploadCompressionEnabled(value: string | null): boolean {
    if (value === null) {
        return DEFAULT_IMAGE_UPLOAD_COMPRESSION_SETTINGS.enabled
    }
    const normalized = value.trim().toLowerCase()
    if (normalized === '0' || normalized === 'false' || normalized === 'off') {
        return false
    }
    if (normalized === '1' || normalized === 'true' || normalized === 'on') {
        return true
    }
    return DEFAULT_IMAGE_UPLOAD_COMPRESSION_SETTINGS.enabled
}

export function readImageUploadCompressionSettings(storage?: Storage | null): ImageUploadCompressionSettings {
    const resolvedStorage = getStorage(storage)
    if (!resolvedStorage) {
        return { ...DEFAULT_IMAGE_UPLOAD_COMPRESSION_SETTINGS }
    }
    try {
        return {
            enabled: normalizeImageUploadCompressionEnabled(
                resolvedStorage.getItem(IMAGE_UPLOAD_COMPRESSION_ENABLED_KEY)
            ),
            level: normalizeImageUploadCompressionLevel(
                resolvedStorage.getItem(IMAGE_UPLOAD_COMPRESSION_LEVEL_KEY)
            ),
            targetSize: normalizeImageUploadCompressionTargetSize(
                resolvedStorage.getItem(IMAGE_UPLOAD_COMPRESSION_TARGET_SIZE_KEY)
            )
        }
    } catch {
        return { ...DEFAULT_IMAGE_UPLOAD_COMPRESSION_SETTINGS }
    }
}

export function writeImageUploadCompressionEnabled(value: boolean, storage?: Storage | null): void {
    const resolvedStorage = getStorage(storage)
    if (!resolvedStorage) {
        return
    }
    try {
        resolvedStorage.setItem(IMAGE_UPLOAD_COMPRESSION_ENABLED_KEY, value ? '1' : '0')
    } catch {
        // Ignore storage errors
    }
}

export function writeImageUploadCompressionLevel(level: ImageUploadCompressionLevel, storage?: Storage | null): void {
    const resolvedStorage = getStorage(storage)
    if (!resolvedStorage) {
        return
    }
    try {
        resolvedStorage.setItem(IMAGE_UPLOAD_COMPRESSION_LEVEL_KEY, level)
    } catch {
        // Ignore storage errors
    }
}

export function writeImageUploadCompressionTargetSize(
    targetSize: ImageUploadCompressionTargetSize,
    storage?: Storage | null
): void {
    const resolvedStorage = getStorage(storage)
    if (!resolvedStorage) {
        return
    }
    try {
        resolvedStorage.setItem(IMAGE_UPLOAD_COMPRESSION_TARGET_SIZE_KEY, targetSize)
    } catch {
        // Ignore storage errors
    }
}

export function isImageUploadCompressionStorageKey(key: string | null): boolean {
    return key === IMAGE_UPLOAD_COMPRESSION_ENABLED_KEY ||
        key === IMAGE_UPLOAD_COMPRESSION_LEVEL_KEY ||
        key === IMAGE_UPLOAD_COMPRESSION_TARGET_SIZE_KEY
}

export function imageUploadCompressionTargetSizeToBytes(
    targetSize: ImageUploadCompressionTargetSize
): number | undefined {
    if (targetSize === '500kb') {
        return 500 * 1024
    }
    if (targetSize === '1mb') {
        return 1024 * 1024
    }
    if (targetSize === '2mb') {
        return 2 * 1024 * 1024
    }
    if (targetSize === '5mb') {
        return 5 * 1024 * 1024
    }
    return undefined
}
