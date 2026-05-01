import { isAbsolute, resolve } from 'node:path'

export type DesktopRoute =
    | { kind: 'sessions' }
    | { kind: 'new-session'; directory: string }

const PROTOCOL = 'haqi:'

export function findDeepLinkArg(args: readonly string[]): string | null {
    for (const arg of args) {
        if (arg.startsWith('haqi://')) {
            return arg
        }
    }
    return null
}

export function parseDeepLink(value: string | null | undefined): DesktopRoute {
    if (!value) {
        return { kind: 'sessions' }
    }

    let url: URL
    try {
        url = new URL(value)
    } catch {
        return { kind: 'sessions' }
    }

    if (url.protocol !== PROTOCOL) {
        return { kind: 'sessions' }
    }

    const section = url.hostname
    const path = url.pathname.replace(/^\/+/, '')

    if (section === 'code' && path === 'new') {
        const folder = url.searchParams.get('folder')?.trim()
        if (!folder) {
            return { kind: 'sessions' }
        }

        return {
            kind: 'new-session',
            directory: normalizeLinkedDirectory(folder)
        }
    }

    return { kind: 'sessions' }
}

function normalizeLinkedDirectory(folder: string): string {
    if (isAbsolute(folder)) {
        return resolve(folder)
    }
    return resolve(folder)
}

export function buildRendererPath(route: DesktopRoute): string {
    if (route.kind === 'new-session') {
        const params = new URLSearchParams({ directory: route.directory })
        return `/sessions/new?${params.toString()}`
    }
    return '/sessions'
}

export function buildRendererUrl(baseUrl: string, route: DesktopRoute): string {
    const url = new URL(baseUrl)
    const path = buildRendererPath(route)
    const marker = path.indexOf('?')
    if (marker >= 0) {
        url.pathname = path.slice(0, marker)
        url.search = path.slice(marker)
    } else {
        url.pathname = path
        url.search = ''
    }
    url.hash = ''
    return url.toString()
}
