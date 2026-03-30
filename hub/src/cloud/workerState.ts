import { RunnerStateSchema } from '@hapi/protocol/schemas'
import type { RunnerState } from '@hapi/protocol/types'

export type RunnerStateSummary = {
    status?: RunnerState['status']
    lifecycle?: RunnerState['lifecycle']
    pid?: RunnerState['pid']
    httpPort?: RunnerState['httpPort']
    startedAt?: RunnerState['startedAt']
    shutdownRequestedAt?: RunnerState['shutdownRequestedAt']
    shutdownSource?: RunnerState['shutdownSource']
    currentSessionId?: RunnerState['currentSessionId']
    capacity?: RunnerState['capacity']
    workspacePreparation?: RunnerState['workspacePreparation']
    lastProvisionError?: RunnerState['lastProvisionError']
    lastWorkspaceError?: RunnerState['lastWorkspaceError']
    lastSpawnError?: RunnerState['lastSpawnError']
    lastHeartbeatAt?: RunnerState['lastHeartbeatAt']
    publicPreviewBaseUrl?: RunnerState['publicPreviewBaseUrl']
    leaseExpiresAt?: RunnerState['leaseExpiresAt']
    ttlExpiresAt?: RunnerState['ttlExpiresAt']
    costHint?: RunnerState['costHint']
}

const TERMINAL_LIFECYCLES = new Set<NonNullable<RunnerState['lifecycle']>>([
    'draining',
    'stopped',
    'failed'
])

const STARTING_LIFECYCLES = new Set<NonNullable<RunnerState['lifecycle']>>([
    'provisioning',
    'booting'
])

const TERMINAL_STATUSES = new Set([
    'shutting-down',
    'shutdown',
    'stopping',
    'stopped',
    'failed'
])

export function summarizeRunnerState(runnerState: unknown | null | undefined): RunnerStateSummary | null {
    if (runnerState == null) {
        return null
    }

    const parsed = RunnerStateSchema.safeParse(runnerState)
    if (!parsed.success) {
        return null
    }

    const state = parsed.data
    return {
        status: state.status,
        lifecycle: state.lifecycle,
        pid: state.pid,
        httpPort: state.httpPort,
        startedAt: state.startedAt,
        shutdownRequestedAt: state.shutdownRequestedAt,
        shutdownSource: state.shutdownSource,
        currentSessionId: state.currentSessionId,
        capacity: state.capacity,
        workspacePreparation: state.workspacePreparation,
        lastProvisionError: state.lastProvisionError,
        lastWorkspaceError: state.lastWorkspaceError,
        lastSpawnError: state.lastSpawnError,
        lastHeartbeatAt: state.lastHeartbeatAt,
        publicPreviewBaseUrl: state.publicPreviewBaseUrl,
        leaseExpiresAt: state.leaseExpiresAt,
        ttlExpiresAt: state.ttlExpiresAt,
        costHint: state.costHint
    }
}

export function isRunnerStateSelectable(runnerState: RunnerStateSummary | null): boolean {
    if (!runnerState) {
        return true
    }

    if (runnerState.status && TERMINAL_STATUSES.has(runnerState.status.trim().toLowerCase())) {
        return false
    }

    if (runnerState.lifecycle && (TERMINAL_LIFECYCLES.has(runnerState.lifecycle) || STARTING_LIFECYCLES.has(runnerState.lifecycle))) {
        return false
    }

    return true
}

export function getRunnerStateCapacity(runnerState: RunnerStateSummary | null): { used: number; total: number } {
    return runnerState?.capacity
        ? {
            used: runnerState.capacity.used,
            total: runnerState.capacity.total
        }
        : {
            used: 0,
            total: Number.POSITIVE_INFINITY
        }
}
