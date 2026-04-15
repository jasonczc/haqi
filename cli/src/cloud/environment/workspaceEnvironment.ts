import fs from 'node:fs/promises'
import { isAbsolute, resolve, join } from 'node:path'
import type { EnvironmentTemplate } from '@hapi/protocol/types'
import { EnvironmentTemplateSchema } from '@hapi/protocol/schemas'
import { mergeRepositorySpec } from '@hapi/protocol'
import type { DockerCliRuntime } from '@/cloud/docker/dockerCli'

const ENVIRONMENT_RELATIVE_PATHS = [
    join('.haqi', 'environment.json'),
    join('.cursor', 'environment.json')
]

function resolveTemplatePath(templatePath: string, basePath: string): string {
    if (isAbsolute(templatePath)) {
        return templatePath
    }
    return resolve(basePath, templatePath)
}

function mergeDesktopSpec(template: EnvironmentTemplate): EnvironmentTemplate['desktop'] | undefined {
    const legacyTerminals = template.terminals?.map((terminal) => ({
        name: terminal.name,
        command: terminal.command
    }))
    if (!template.desktop && (!legacyTerminals || legacyTerminals.length === 0)) {
        return undefined
    }

    return {
        ...template.desktop,
        terminals: template.desktop?.terminals ?? legacyTerminals
    }
}

export function normalizeEnvironmentTemplatePaths(
    template: EnvironmentTemplate,
    basePath: string
): EnvironmentTemplate {
    const runtime = template.runtime
        ? {
            ...template.runtime,
            ...(template.runtime.buildContext
                ? {
                    buildContext: resolveTemplatePath(template.runtime.buildContext, basePath)
                }
                : {}),
            ...(template.runtime.workingDir
                ? {
                    workingDir: resolveTemplatePath(template.runtime.workingDir, basePath)
                }
                : {})
        }
        : undefined

    return {
        ...template,
        runtime,
        desktop: mergeDesktopSpec(template),
        ...(template.workingDir
            ? {
                workingDir: resolveTemplatePath(template.workingDir, basePath)
            }
            : {})
    }
}

export function mergeEnvironmentTemplates(
    base: EnvironmentTemplate | undefined,
    override: EnvironmentTemplate | undefined
): EnvironmentTemplate | undefined {
    if (!base) {
        return override
    }
    if (!override) {
        return base
    }

    return {
        ...base,
        ...override,
        repository: mergeRepositorySpec(base.repository, override.repository),
        env: base.env || override.env
            ? {
                ...(base.env ?? {}),
                ...(override.env ?? {}),
                files: override.env?.files ?? base.env?.files
            }
            : undefined,
        runtime: base.runtime || override.runtime
            ? {
                ...(base.runtime ?? {}),
                ...(override.runtime ?? {})
            }
            : undefined,
        install: override.install ?? base.install,
        start: override.start ?? base.start,
        terminals: override.terminals ?? base.terminals,
        services: override.services ?? base.services,
        ports: override.ports ?? base.ports,
        resources: override.resources ?? base.resources,
        network: base.network || override.network
            ? {
                ...(base.network ?? {}),
                ...(override.network ?? {})
            }
            : undefined,
        cache: override.cache ?? base.cache,
        secrets: override.secrets ?? base.secrets,
        user: override.user ?? base.user,
        workingDir: override.workingDir ?? base.workingDir,
        repositoryDependencies: override.repositoryDependencies ?? base.repositoryDependencies,
        features: base.features || override.features
            ? {
                ...(base.features ?? {}),
                ...(override.features ?? {})
            }
            : undefined,
        desktop: base.desktop || override.desktop
            ? {
                ...(base.desktop ?? {}),
                ...(override.desktop ?? {}),
                terminals: override.desktop?.terminals ?? base.desktop?.terminals,
                languageServers: override.desktop?.languageServers ?? base.desktop?.languageServers,
                warmup: override.desktop?.warmup ?? base.desktop?.warmup,
                statePaths: override.desktop?.statePaths ?? base.desktop?.statePaths
            }
            : undefined,
        source: override.source ?? base.source
    }
}

async function readEnvironmentTemplate(filePath: string): Promise<EnvironmentTemplate | null> {
    try {
        const raw = await fs.readFile(filePath, 'utf8')
        const parsed = JSON.parse(raw)
        const result = EnvironmentTemplateSchema.safeParse(parsed)
        if (!result.success) {
            throw new Error(`Invalid environment template at ${filePath}`)
        }
        return result.data
    } catch (error) {
        if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
            return null
        }
        throw error
    }
}

async function parseEnvironmentTemplateContent(raw: string, filePath: string): Promise<EnvironmentTemplate | null> {
    try {
        const parsed = JSON.parse(raw)
        const result = EnvironmentTemplateSchema.safeParse(parsed)
        if (!result.success) {
            throw new Error(`Invalid environment template at ${filePath}`)
        }
        return result.data
    } catch (error) {
        if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
            return null
        }
        throw error
    }
}

export async function loadWorkspaceEnvironmentTemplateInContainer(params: {
    runtime: DockerCliRuntime
    containerId: string
    searchRoots: string[]
    user?: string
    home?: string
}): Promise<EnvironmentTemplate | null> {
    for (const root of params.searchRoots) {
        for (const relativePath of ENVIRONMENT_RELATIVE_PATHS) {
            const candidate = resolve(root, relativePath)
            const result = await params.runtime.exec({
                containerId: params.containerId,
                user: params.user,
                env: [
                    ...(params.home ? [`HOME=${params.home}`] : []),
                    ...(params.user ? [`USER=${params.user}`, `LOGNAME=${params.user}`] : [])
                ],
                command: ['sh', '-lc', `if [ -f ${JSON.stringify(candidate)} ]; then cat ${JSON.stringify(candidate)}; fi`]
            }).catch(() => null)
            const raw = result?.stdout?.trim()
            if (!raw) {
                continue
            }
            const template = await parseEnvironmentTemplateContent(raw, candidate)
            if (!template) {
                continue
            }
            const normalized = normalizeEnvironmentTemplatePaths(template, root)
            return {
                ...normalized,
                desktop: mergeDesktopSpec(normalized),
                source: normalized.source ?? 'repo'
            }
        }
    }
    return null
}

export async function loadWorkspaceEnvironmentTemplate(
    searchRoots: string[]
): Promise<EnvironmentTemplate | null> {
    for (const root of searchRoots) {
        for (const relativePath of ENVIRONMENT_RELATIVE_PATHS) {
            const candidate = resolve(root, relativePath)
            const template = await readEnvironmentTemplate(candidate)
            if (!template) {
                continue
            }
            const normalized = normalizeEnvironmentTemplatePaths(template, root)
            return {
                ...normalized,
                desktop: mergeDesktopSpec(normalized),
                source: normalized.source ?? 'repo'
            }
        }
    }

    return null
}
