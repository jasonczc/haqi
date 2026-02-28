import { getSettingsFile, readSettingsOrThrow, writeSettings } from './settings'

export type ReportPublicBaseUrlSource = 'env' | 'file' | 'default'

export type ReportPublicBaseUrlSettings = {
    value: string
    source: ReportPublicBaseUrlSource
    envOverride: boolean
}

const REPORT_PUBLIC_BASE_URL_ENV_KEYS = [
    'HAPI_REPORT_PUBLIC_BASE_URL',
    'HAPI_REPORT_PUBLIC_URL'
] as const

function trimTrailingSlash(value: string): string {
    return value.replace(/\/+$/, '')
}

function normalizeAbsoluteHttpUrl(value: string): string {
    const trimmed = value.trim()
    if (!trimmed) {
        throw new Error('URL cannot be empty')
    }

    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('URL must use http:// or https://')
    }

    return trimTrailingSlash(parsed.toString())
}

function readEnvReportPublicBaseUrl(): string | null {
    for (const key of REPORT_PUBLIC_BASE_URL_ENV_KEYS) {
        const raw = process.env[key]
        if (!raw || !raw.trim()) {
            continue
        }
        return normalizeAbsoluteHttpUrl(raw)
    }
    return null
}

export function normalizeReportPublicBaseUrlInput(value: string): string {
    return normalizeAbsoluteHttpUrl(value)
}

export async function loadReportPublicBaseUrlSettings(options: {
    dataDir: string
    fallbackPublicUrl: string
}): Promise<ReportPublicBaseUrlSettings> {
    const envValue = readEnvReportPublicBaseUrl()
    if (envValue) {
        return {
            value: envValue,
            source: 'env',
            envOverride: true
        }
    }

    const settingsFile = getSettingsFile(options.dataDir)
    const settings = await readSettingsOrThrow(settingsFile)
    const rawSetting = typeof settings.reportPublicBaseUrl === 'string'
        ? settings.reportPublicBaseUrl.trim()
        : ''

    if (rawSetting) {
        return {
            value: normalizeAbsoluteHttpUrl(rawSetting),
            source: 'file',
            envOverride: false
        }
    }

    return {
        value: normalizeAbsoluteHttpUrl(options.fallbackPublicUrl),
        source: 'default',
        envOverride: false
    }
}

export async function saveReportPublicBaseUrlSetting(options: {
    dataDir: string
    domain: string | null
    fallbackPublicUrl: string
}): Promise<ReportPublicBaseUrlSettings> {
    const envValue = readEnvReportPublicBaseUrl()
    if (envValue) {
        return {
            value: envValue,
            source: 'env',
            envOverride: true
        }
    }

    const settingsFile = getSettingsFile(options.dataDir)
    const settings = await readSettingsOrThrow(settingsFile)

    const normalizedDomain = options.domain && options.domain.trim().length > 0
        ? normalizeAbsoluteHttpUrl(options.domain)
        : null

    if (normalizedDomain) {
        settings.reportPublicBaseUrl = normalizedDomain
    } else {
        delete settings.reportPublicBaseUrl
    }

    await writeSettings(settingsFile, settings)

    if (normalizedDomain) {
        return {
            value: normalizedDomain,
            source: 'file',
            envOverride: false
        }
    }

    return {
        value: normalizeAbsoluteHttpUrl(options.fallbackPublicUrl),
        source: 'default',
        envOverride: false
    }
}
