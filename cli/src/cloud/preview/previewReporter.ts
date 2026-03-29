import type { PreviewTarget } from '@hapi/protocol/types'

export function mergePreviewTargets(
    base: PreviewTarget[] | undefined,
    extra: PreviewTarget[] | undefined
): PreviewTarget[] | undefined {
    const items = [...(base ?? []), ...(extra ?? [])]
    if (items.length === 0) {
        return undefined
    }

    const deduped = new Map<string, PreviewTarget>()
    for (const target of items) {
        deduped.set(target.id, target)
    }

    return [...deduped.values()]
}

export function createPreviewTargetsFromBindings(
    containerId: string,
    bindings: Record<number, number>,
    visibility: 'private' | 'public' = 'private'
): PreviewTarget[] {
    return Object.entries(bindings).map(([containerPortRaw, hostPort]) => {
        const containerPort = Number(containerPortRaw)
        return {
            id: `${containerId.slice(0, 12)}-${containerPort}`,
            name: `preview:${containerPort}`,
            port: hostPort,
            url: `http://127.0.0.1:${hostPort}`,
            visibility
        }
    })
}
