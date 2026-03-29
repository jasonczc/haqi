import type { EnvironmentTemplate, RuntimeKind, WorkspaceSource } from '@hapi/protocol/types'
import type { ResolvedEnvironmentTemplate } from '@/cloud/types'

type ResolveEnvironmentTemplateInput = {
    runtimeKind?: RuntimeKind
    environmentId?: string
    environment?: EnvironmentTemplate
    workspaceSource?: WorkspaceSource
}

export function resolveEnvironmentTemplate(
    input: ResolveEnvironmentTemplateInput
): ResolvedEnvironmentTemplate {
    const runtimeKind = input.runtimeKind
        ?? input.environment?.runtime?.kind
        ?? 'host-process'

    const services = input.environment?.services ?? []
    const workingDirectory = input.environment?.workingDir
        ?? input.environment?.runtime?.workingDir
        ?? input.workspaceSource?.directory

    return {
        runtimeKind,
        environmentId: input.environmentId ?? input.environment?.id,
        environment: input.environment,
        services,
        workingDirectory
    }
}
