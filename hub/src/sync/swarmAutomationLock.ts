const swarmAutomationLocks = new Map<string, Promise<void>>()

function buildSwarmAutomationLockKey(swarmId: string, namespace: string): string {
    return `${namespace}:${swarmId}`
}

export async function withSwarmAutomationLock<T>(
    swarmId: string,
    namespace: string,
    task: () => Promise<T>
): Promise<T> {
    const key = buildSwarmAutomationLockKey(swarmId, namespace)
    const previous = swarmAutomationLocks.get(key) ?? Promise.resolve()

    let releaseCurrent: () => void = () => undefined
    const current = new Promise<void>((resolve) => {
        releaseCurrent = resolve
    })
    const chained = previous.catch(() => undefined).then(() => current)
    swarmAutomationLocks.set(key, chained)

    await previous.catch(() => undefined)

    try {
        return await task()
    } finally {
        releaseCurrent()
        if (swarmAutomationLocks.get(key) === chained) {
            swarmAutomationLocks.delete(key)
        }
    }
}
