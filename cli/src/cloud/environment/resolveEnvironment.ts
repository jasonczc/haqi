import { isAbsolute, resolve } from 'node:path'
import type { EnvironmentTemplate, RuntimeKind, WorkspaceSource } from '@hapi/protocol/types'
import type { ResolvedEnvironmentTemplate } from '@/cloud/types'
import { mergeEnvironmentTemplates, normalizeEnvironmentTemplatePaths } from './workspaceEnvironment'

type ResolveEnvironmentTemplateInput = {
    runtimeKind?: RuntimeKind
    environmentId?: string
    environment?: EnvironmentTemplate
    resolvedEnvironment?: EnvironmentTemplate
    workspaceEnvironment?: EnvironmentTemplate | null
    workspaceSource?: WorkspaceSource
    workspacePath?: string
}

export function resolveEnvironmentTemplate(
    input: ResolveEnvironmentTemplateInput
): ResolvedEnvironmentTemplate {
    const mergedEnvironment = mergeEnvironmentTemplates(
        input.workspaceEnvironment ?? undefined,
        input.resolvedEnvironment ?? input.environment
    )

    const runtimeKind = input.runtimeKind
        ?? mergedEnvironment?.runtime?.kind
        ?? 'host-process'

    const normalizedEnvironment = mergedEnvironment && input.workspacePath
        ? normalizeEnvironmentTemplatePaths(mergedEnvironment, input.workspacePath)
        : mergedEnvironment

    const services = normalizedEnvironment?.services ?? []
    const workingDirectory = normalizedEnvironment?.workingDir
        ?? normalizedEnvironment?.runtime?.workingDir
        ?? input.workspaceSource?.directory
    const resolvedWorkingDirectory = workingDirectory && input.workspacePath && !isAbsolute(workingDirectory)
        ? resolve(input.workspacePath, workingDirectory)
        : workingDirectory

    return {
        runtimeKind,
        environmentId: input.environmentId ?? normalizedEnvironment?.id,
        environment: normalizedEnvironment,
        services,
        workingDirectory: resolvedWorkingDirectory
    }
}
