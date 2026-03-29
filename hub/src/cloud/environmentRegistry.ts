import type { EnvironmentTemplate, RuntimeKind } from '@hapi/protocol/types'

export type CloudEnvironmentRecord = {
    machineId: string
    environmentId: string
    version: string
    source?: EnvironmentTemplate['source']
    runtimeKind?: RuntimeKind
    repositoryUrl?: string
    template?: EnvironmentTemplate
    updatedAt: number
}

export class EnvironmentRegistry {
    private readonly environments = new Map<string, EnvironmentTemplate>()
    private readonly recordsByMachineId = new Map<string, Map<string, CloudEnvironmentRecord>>()

    list(): EnvironmentTemplate[] {
        return [...this.environments.values()]
    }

    get(id: string): EnvironmentTemplate | null {
        return this.environments.get(id) ?? null
    }

    register(template: EnvironmentTemplate): EnvironmentTemplate {
        const id = template.id?.trim()
        if (!id) {
            throw new Error('Environment template id is required')
        }

        const normalized: EnvironmentTemplate = {
            ...template,
            id
        }
        this.environments.set(id, normalized)
        return normalized
    }

    record(input: Omit<CloudEnvironmentRecord, 'updatedAt'> & { updatedAt?: number }): CloudEnvironmentRecord {
        const environmentId = input.environmentId.trim()
        const machineId = input.machineId.trim()
        if (!environmentId || !machineId) {
            throw new Error('machineId and environmentId are required')
        }

        const record: CloudEnvironmentRecord = {
            ...input,
            machineId,
            environmentId,
            updatedAt: input.updatedAt ?? Date.now()
        }

        const machineMap = this.recordsByMachineId.get(machineId) ?? new Map<string, CloudEnvironmentRecord>()
        machineMap.set(environmentId, record)
        this.recordsByMachineId.set(machineId, machineMap)
        return record
    }

    getRecord(machineId: string, environmentId: string): CloudEnvironmentRecord | null {
        return this.recordsByMachineId.get(machineId)?.get(environmentId) ?? null
    }

    listForMachine(machineId: string): CloudEnvironmentRecord[] {
        return [...(this.recordsByMachineId.get(machineId)?.values() ?? [])]
    }

    clearMachine(machineId: string): void {
        this.recordsByMachineId.delete(machineId)
    }

    clear(): void {
        this.environments.clear()
        this.recordsByMachineId.clear()
    }
}
