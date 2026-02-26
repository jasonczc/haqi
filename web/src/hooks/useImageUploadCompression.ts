import { useCallback, useEffect, useState } from 'react'
import {
    type ImageUploadCompressionLevel,
    type ImageUploadCompressionTargetSize,
    isImageUploadCompressionStorageKey,
    normalizeImageUploadCompressionLevel,
    normalizeImageUploadCompressionTargetSize,
    readImageUploadCompressionSettings,
    writeImageUploadCompressionEnabled,
    writeImageUploadCompressionLevel,
    writeImageUploadCompressionTargetSize
} from '@/lib/imageUploadCompressionSettings'

export type {
    ImageUploadCompressionLevel,
    ImageUploadCompressionTargetSize
} from '@/lib/imageUploadCompressionSettings'

export function useImageUploadCompression(): {
    imageUploadCompressionEnabled: boolean
    imageUploadCompressionLevel: ImageUploadCompressionLevel
    imageUploadCompressionTargetSize: ImageUploadCompressionTargetSize
    setImageUploadCompressionEnabled: (value: boolean) => void
    setImageUploadCompressionLevel: (level: ImageUploadCompressionLevel) => void
    setImageUploadCompressionTargetSize: (targetSize: ImageUploadCompressionTargetSize) => void
} {
    const [settings, setSettings] = useState(readImageUploadCompressionSettings)

    const setImageUploadCompressionEnabled = useCallback((value: boolean) => {
        setSettings((prev) => ({ ...prev, enabled: value }))
        writeImageUploadCompressionEnabled(value)
    }, [])

    const setImageUploadCompressionLevel = useCallback((level: ImageUploadCompressionLevel) => {
        const normalizedLevel = normalizeImageUploadCompressionLevel(level)
        setSettings((prev) => ({ ...prev, level: normalizedLevel }))
        writeImageUploadCompressionLevel(normalizedLevel)
    }, [])

    const setImageUploadCompressionTargetSize = useCallback((targetSize: ImageUploadCompressionTargetSize) => {
        const normalizedTargetSize = normalizeImageUploadCompressionTargetSize(targetSize)
        setSettings((prev) => ({ ...prev, targetSize: normalizedTargetSize }))
        writeImageUploadCompressionTargetSize(normalizedTargetSize)
    }, [])

    useEffect(() => {
        if (typeof window === 'undefined') {
            return
        }

        const handleStorage = (event: StorageEvent) => {
            if (!isImageUploadCompressionStorageKey(event.key)) {
                return
            }
            setSettings(readImageUploadCompressionSettings())
        }

        window.addEventListener('storage', handleStorage)
        return () => window.removeEventListener('storage', handleStorage)
    }, [])

    return {
        imageUploadCompressionEnabled: settings.enabled,
        imageUploadCompressionLevel: settings.level,
        imageUploadCompressionTargetSize: settings.targetSize,
        setImageUploadCompressionEnabled,
        setImageUploadCompressionLevel,
        setImageUploadCompressionTargetSize
    }
}
