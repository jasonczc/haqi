import type { Machine } from '../sync/machineCache'

export type SelectWorkerOptions = {
    labels?: string[]
    requireDocker?: boolean
    requireDockerSession?: boolean
}

function machineLabels(machine: Machine): string[] {
    return machine.metadata?.labels ?? []
}

function hasAllLabels(machine: Machine, labels: string[]): boolean {
    if (labels.length === 0) {
        return true
    }
    const available = new Set(machineLabels(machine))
    return labels.every((label) => available.has(label))
}

function runnerLoad(machine: Machine): { used: number; total: number } {
    const used = machine.runnerState && typeof machine.runnerState === 'object' && machine.runnerState !== null
        && 'capacity' in machine.runnerState
        && typeof machine.runnerState.capacity === 'object'
        && machine.runnerState.capacity !== null
        && 'used' in machine.runnerState.capacity
        && typeof machine.runnerState.capacity.used === 'number'
        ? machine.runnerState.capacity.used
        : 0

    const total = machine.runnerState && typeof machine.runnerState === 'object' && machine.runnerState !== null
        && 'capacity' in machine.runnerState
        && typeof machine.runnerState.capacity === 'object'
        && machine.runnerState.capacity !== null
        && 'total' in machine.runnerState.capacity
        && typeof machine.runnerState.capacity.total === 'number'
        ? machine.runnerState.capacity.total
        : Number.POSITIVE_INFINITY

    return { used, total }
}

export function selectWorker(
    machines: Machine[],
    options: SelectWorkerOptions = {}
): Machine | null {
    const labels = options.labels ?? []

    const filtered = machines.filter((machine) => {
        if (!machine.active) {
            return false
        }

        if (!hasAllLabels(machine, labels)) {
            return false
        }

        const capabilities = machine.metadata?.capabilities as {
            docker?: boolean
            dockerSession?: boolean
        } | undefined

        if (options.requireDocker && capabilities?.docker !== true) {
            return false
        }

        if (options.requireDockerSession && capabilities?.dockerSession !== true) {
            return false
        }

        const load = runnerLoad(machine)
        return load.used < load.total
    })

    if (filtered.length === 0) {
        return null
    }

    filtered.sort((a, b) => {
        const loadA = runnerLoad(a)
        const loadB = runnerLoad(b)

        if (loadA.used !== loadB.used) {
            return loadA.used - loadB.used
        }

        const updatedAtDelta = b.updatedAt - a.updatedAt
        if (updatedAtDelta !== 0) {
            return updatedAtDelta
        }

        return a.id.localeCompare(b.id)
    })

    return filtered[0] ?? null
}
