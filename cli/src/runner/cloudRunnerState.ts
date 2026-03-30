import type { RunnerState } from '@/api/types'
import type { WorkerLifecycle } from '@hapi/protocol/types'

export type CloudRunnerStateSnapshotInput = {
    baseState: RunnerState | null
    pid: number
    httpPort: number
    usedSessions: number
    startedAt?: number
    currentSessionId?: string | null
    status?: string
    lifecycle?: WorkerLifecycle
    workspacePreparation?: RunnerState['workspacePreparation'] | null
    lastWorkspaceError?: RunnerState['lastWorkspaceError'] | null
    lastSpawnError?: RunnerState['lastSpawnError'] | null
    lastHeartbeatAt?: number
    shutdownRequestedAt?: number
    shutdownSource?: string
    capacityTotal?: number
    publicPreviewBaseUrl?: string
}

export function buildCloudRunnerStateSnapshot(input: CloudRunnerStateSnapshotInput): RunnerState {
    const base = input.baseState ?? { status: input.status ?? 'running' }
    const usedSessions = Math.max(0, input.usedSessions)
    const capacityTotal = Math.max(input.capacityTotal ?? base.capacity?.total ?? 1, usedSessions)

    return {
        ...base,
        status: input.status ?? base.status ?? 'running',
        lifecycle: input.lifecycle ?? (usedSessions > 0 ? 'busy' : 'idle'),
        pid: input.pid,
        httpPort: input.httpPort,
        startedAt: input.startedAt ?? base.startedAt ?? Date.now(),
        currentSessionId: input.currentSessionId !== undefined ? input.currentSessionId : base.currentSessionId,
        capacity: {
            total: capacityTotal,
            used: usedSessions
        },
        workspacePreparation: input.workspacePreparation !== undefined
            ? input.workspacePreparation
            : base.workspacePreparation,
        lastWorkspaceError: input.lastWorkspaceError !== undefined
            ? input.lastWorkspaceError
            : base.lastWorkspaceError,
        lastSpawnError: input.lastSpawnError !== undefined
            ? input.lastSpawnError
            : base.lastSpawnError,
        lastHeartbeatAt: input.lastHeartbeatAt ?? Date.now(),
        shutdownRequestedAt: input.shutdownRequestedAt ?? base.shutdownRequestedAt,
        shutdownSource: input.shutdownSource ?? base.shutdownSource,
        publicPreviewBaseUrl: input.publicPreviewBaseUrl ?? base.publicPreviewBaseUrl
    }
}
