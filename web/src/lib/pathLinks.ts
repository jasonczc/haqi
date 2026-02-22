import type { PermissionMode } from '@/types/api'

const PATH_LINK_PREFIX = 'hapi-file://'
const WINDOWS_ABSOLUTE_PATH_REGEX = /^[A-Za-z]:[\\/]/;

const YOLO_PERMISSION_MODES = new Set<PermissionMode>([
    'yolo',
    'bypassPermissions',
    'auto-approve'
])

export function encodePathLink(path: string): string {
    return `${PATH_LINK_PREFIX}${encodeURIComponent(path)}`
}

export function decodePathLink(href: string | undefined): string | null {
    if (!href || !href.startsWith(PATH_LINK_PREFIX)) {
        return null
    }

    const encodedPath = href.slice(PATH_LINK_PREFIX.length)
    if (!encodedPath) {
        return null
    }

    try {
        return decodeURIComponent(encodedPath)
    } catch {
        return encodedPath
    }
}

export function isOutsideWorkspacePathCandidate(path: string): boolean {
    const normalized = path.replace(/\\/g, '/')
    if (normalized.startsWith('/')) return true
    if (WINDOWS_ABSOLUTE_PATH_REGEX.test(path)) return true
    return normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')
}

export function isYoloPermissionMode(mode: PermissionMode | undefined): boolean {
    if (!mode) return false
    return YOLO_PERMISSION_MODES.has(mode)
}
