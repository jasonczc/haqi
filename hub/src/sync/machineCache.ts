import { MachineMetadataSchema, RunnerStateSchema } from '@hapi/protocol/schemas'
import type { Store } from '../store'
import { clampAliveTime } from './aliveTime'
import { EventPublisher } from './eventPublisher'

export interface Machine {
    id: string
    namespace: string
    seq: number
    createdAt: number
    updatedAt: number
    active: boolean
    activeAt: number
    metadata: {
        host: string
        platform: string
        happyCliVersion: string
        displayName?: string
        homeDir?: string
        happyHomeDir?: string
        happyLibDir?: string
        executorType?: 'local' | 'cloud-self-hosted' | 'cloud-managed'
        provider?: string
        region?: string
        zone?: string
        image?: string
        environmentId?: string
        workerVersion?: string
        labels?: string[]
        capabilities?: unknown
        resources?: unknown
        repoCache?: unknown
    } | null
    metadataVersion: number
    runnerState: unknown | null
    runnerStateVersion: number
}

export class MachineCache {
    private readonly machines: Map<string, Machine> = new Map()
    private readonly lastBroadcastAtByMachineId: Map<string, number> = new Map()
    // Last time we wrote active/active_at to DB for each machine. Throttles
    // heartbeat persistence so we don't write every 20s keepalive; writes
    // always fire on state transitions regardless of this throttle.
    private readonly lastActivityPersistAtByMachineId: Map<string, number> = new Map()
    private static readonly ACTIVITY_PERSIST_INTERVAL_MS = 60_000

    constructor(
        private readonly store: Store,
        private readonly publisher: EventPublisher
    ) {
    }

    private persistActivity(machine: Machine, active: boolean, activeAt: number, force = false): void {
        if (!force) {
            const last = this.lastActivityPersistAtByMachineId.get(machine.id) ?? 0
            if (activeAt - last < MachineCache.ACTIVITY_PERSIST_INTERVAL_MS) {
                return
            }
        }
        this.lastActivityPersistAtByMachineId.set(machine.id, activeAt)
        this.store.machines.updateMachineActivity(machine.id, machine.namespace, active, activeAt)
    }

    getMachines(): Machine[] {
        return Array.from(this.machines.values())
    }

    getMachinesByNamespace(namespace: string): Machine[] {
        return this.getMachines().filter((machine) => machine.namespace === namespace)
    }

    getMachine(machineId: string): Machine | undefined {
        return this.machines.get(machineId)
    }

    getMachineByNamespace(machineId: string, namespace: string): Machine | undefined {
        const machine = this.machines.get(machineId)
        if (!machine || machine.namespace !== namespace) {
            return undefined
        }
        return machine
    }

    getOnlineMachines(): Machine[] {
        return this.getMachines().filter((machine) => machine.active)
    }

    getOnlineMachinesByNamespace(namespace: string): Machine[] {
        return this.getMachinesByNamespace(namespace).filter((machine) => machine.active)
    }

    getOrCreateMachine(id: string, metadata: unknown, runnerState: unknown, namespace: string): Machine {
        const stored = this.store.machines.getOrCreateMachine(id, metadata, runnerState, namespace)
        return this.refreshMachine(stored.id) ?? (() => { throw new Error('Failed to load machine') })()
    }

    removeMachineByNamespace(machineId: string, namespace: string): boolean {
        const removed = this.store.machines.deleteMachineByNamespace(machineId, namespace)
        if (!removed) return false
        if (this.machines.delete(machineId)) {
            this.publisher.emit({ type: 'machine-updated', machineId, data: null })
        }
        this.lastBroadcastAtByMachineId.delete(machineId)
        this.lastActivityPersistAtByMachineId.delete(machineId)
        return true
    }

    refreshMachine(machineId: string): Machine | null {
        const stored = this.store.machines.getMachine(machineId)
        if (!stored) {
            const existed = this.machines.delete(machineId)
            if (existed) {
                this.publisher.emit({ type: 'machine-updated', machineId, data: null })
            }
            return null
        }

        const existing = this.machines.get(machineId)

        const metadata = (() => {
            const parsed = MachineMetadataSchema.safeParse(stored.metadata)
            if (!parsed.success) return null
            const data = parsed.data
            const host = typeof data.host === 'string' ? data.host : 'unknown'
            const platform = typeof data.platform === 'string' ? data.platform : 'unknown'
            const happyCliVersion = typeof data.happyCliVersion === 'string' ? data.happyCliVersion : 'unknown'
            const displayName = typeof data.displayName === 'string' ? data.displayName : undefined
            const homeDir = typeof data.homeDir === 'string' ? data.homeDir : undefined
            const happyHomeDir = typeof data.happyHomeDir === 'string' ? data.happyHomeDir : undefined
            const happyLibDir = typeof data.happyLibDir === 'string' ? data.happyLibDir : undefined
            return {
                host,
                platform,
                happyCliVersion,
                displayName,
                homeDir,
                happyHomeDir,
                happyLibDir,
                executorType: data.executorType,
                provider: data.provider,
                region: data.region,
                zone: data.zone,
                image: data.image,
                environmentId: data.environmentId,
                workerVersion: data.workerVersion,
                labels: data.labels,
                capabilities: data.capabilities,
                resources: data.resources,
                repoCache: data.repoCache
            }
        })()

        const storedActiveAt = stored.activeAt ?? stored.createdAt
        const existingActiveAt = existing?.activeAt ?? 0
        const useStoredActivity = storedActiveAt > existingActiveAt

        const machine: Machine = {
            id: stored.id,
            namespace: stored.namespace,
            seq: stored.seq,
            createdAt: stored.createdAt,
            updatedAt: stored.updatedAt,
            active: useStoredActivity ? stored.active : (existing?.active ?? stored.active),
            activeAt: useStoredActivity ? storedActiveAt : (existingActiveAt || storedActiveAt),
            metadata,
            metadataVersion: stored.metadataVersion,
            runnerState: (() => {
                if (stored.runnerState == null) {
                    return null
                }
                const parsed = RunnerStateSchema.safeParse(stored.runnerState)
                return parsed.success ? parsed.data : stored.runnerState
            })(),
            runnerStateVersion: stored.runnerStateVersion
        }

        this.machines.set(machineId, machine)
        this.publisher.emit({ type: 'machine-updated', machineId, data: machine })
        return machine
    }

    reloadAll(): void {
        const machines = this.store.machines.getMachines()
        for (const machine of machines) {
            this.refreshMachine(machine.id)
        }
    }

    handleMachineAlive(payload: { machineId: string; time: number }): void {
        const t = clampAliveTime(payload.time)
        if (!t) return

        const machine = this.machines.get(payload.machineId) ?? this.refreshMachine(payload.machineId)
        if (!machine) return

        const wasActive = machine.active
        machine.active = true
        machine.activeAt = Math.max(machine.activeAt, t)

        // Persist liveness: always on inactive→active transition, otherwise
        // at most once per ACTIVITY_PERSIST_INTERVAL_MS. Keeps DB in sync so
        // hub restart correctly restores machine state.
        this.persistActivity(machine, true, machine.activeAt, /* force */ !wasActive)

        const now = Date.now()
        const lastBroadcastAt = this.lastBroadcastAtByMachineId.get(machine.id) ?? 0
        const shouldBroadcast = (!wasActive && machine.active) || (now - lastBroadcastAt > 10_000)
        if (shouldBroadcast) {
            this.lastBroadcastAtByMachineId.set(machine.id, now)
            this.publisher.emit({ type: 'machine-updated', machineId: machine.id, data: machine })
        }
    }

    expireInactive(now: number = Date.now()): void {
        const machineTimeoutMs = 45_000
        // Auto-prune fully dead machine records so the worker picker and
        // settings page don't fill up with preempted spot instances. A
        // machine inactive past the TTL is almost certainly gone for good
        // (new spot instances get new machineIds). activeAt is the source
        // of truth: written to DB on transitions and throttled heartbeats
        // so it survives hub restarts.
        const deadMachineTtlMs = 60 * 60 * 1000

        const toPrune: Array<{ id: string; namespace: string }> = []
        for (const machine of this.machines.values()) {
            if (machine.active && now - machine.activeAt > machineTimeoutMs) {
                machine.active = false
                this.persistActivity(machine, false, machine.activeAt, /* force */ true)
                this.publisher.emit({ type: 'machine-updated', machineId: machine.id, data: { active: false } })
            }
            if (!machine.active && now - machine.activeAt > deadMachineTtlMs) {
                toPrune.push({ id: machine.id, namespace: machine.namespace })
            }
        }

        for (const { id, namespace } of toPrune) {
            this.removeMachineByNamespace(id, namespace)
        }
    }
}
