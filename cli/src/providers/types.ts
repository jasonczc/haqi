import type { MachineMapping, MachineMappingAuth } from '@hapi/protocol/types'

export type ProviderSettings = {
    ngrok?: {
        enabled?: boolean
        managed?: boolean
        authToken?: string
        region?: string
        apiBaseUrl?: string
    }
}

export type CreateManagedMappingInput = {
    name: string
    kind: MachineMapping['kind']
    localUrl: string
    auth?: MachineMappingAuth
}

export interface MappingProviderController {
    listMappings(): Promise<MachineMapping[]>
    createManagedMapping(input: CreateManagedMappingInput): Promise<MachineMapping>
    deleteManagedMapping(mapping: MachineMapping): Promise<void>
}
