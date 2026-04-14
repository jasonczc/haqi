export const DEFAULT_CONTAINER_USER = 'haqi'
export const DEFAULT_CONTAINER_HOME = `/home/${DEFAULT_CONTAINER_USER}`

export type ContainerHomeTarget = {
    user: string
    home: string
    owner: string
}

export function resolveContainerUser(user?: string): string {
    const trimmed = user?.trim()
    return trimmed || DEFAULT_CONTAINER_USER
}

export function resolveContainerHome(user?: string): string {
    const resolvedUser = resolveContainerUser(user)
    if (resolvedUser === 'root') {
        return '/root'
    }
    if (resolvedUser === DEFAULT_CONTAINER_USER) {
        return DEFAULT_CONTAINER_HOME
    }
    return `/home/${resolvedUser}`
}

export function getContainerHomeTargets(user?: string): ContainerHomeTarget[] {
    const targets: ContainerHomeTarget[] = [{
        user: 'root',
        home: '/root',
        owner: 'root:root'
    }]

    const resolvedUser = resolveContainerUser(user)
    if (resolvedUser !== 'root') {
        targets.push({
            user: resolvedUser,
            home: resolveContainerHome(resolvedUser),
            owner: `${resolvedUser}:${resolvedUser}`
        })
    }

    return targets
}
