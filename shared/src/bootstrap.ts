import type {
    EnvironmentTemplate,
    RepositoryRef,
    RepositorySpec,
    WorkspaceSource
} from './types'

function normalizeRef(value: RepositoryRef | undefined): RepositoryRef | undefined {
    if (!value) {
        return undefined
    }
    const normalized: RepositoryRef = {}
    if (value.branch?.trim()) {
        normalized.branch = value.branch.trim()
    }
    if (value.tag?.trim()) {
        normalized.tag = value.tag.trim()
    }
    if (value.commit?.trim()) {
        normalized.commit = value.commit.trim()
    }
    if (value.pr?.trim()) {
        normalized.pr = value.pr.trim()
    }
    return Object.keys(normalized).length > 0 ? normalized : undefined
}

export function mergeRepositorySpec(
    base: RepositorySpec | undefined,
    override: RepositorySpec | undefined
): RepositorySpec | undefined {
    if (!base) {
        return override
    }
    if (!override) {
        return base
    }

    return {
        ...base,
        ...override,
        ref: {
            ...(normalizeRef(base.ref) ?? {}),
            ...(normalizeRef(override.ref) ?? {})
        },
        branchStrategy: {
            ...(base.branchStrategy ?? {}),
            ...(override.branchStrategy ?? {})
        }
    }
}

export function resolveWorkspaceSourceWithEnvironment(params: {
    workspaceSource?: WorkspaceSource
    environment?: EnvironmentTemplate
}): WorkspaceSource | undefined {
    const environmentRepository = params.environment?.repository
    if (!environmentRepository) {
        return params.workspaceSource
    }

    if (params.workspaceSource?.repository) {
        return {
            ...params.workspaceSource,
            type: params.workspaceSource.type ?? 'repo',
            repository: mergeRepositorySpec(environmentRepository, params.workspaceSource.repository)
        }
    }

    if (params.workspaceSource) {
        return params.workspaceSource
    }

    return {
        type: 'repo',
        repository: environmentRepository
    }
}

function slugifySegment(input: string): string {
    return input
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48)
}

function resolveBranchStem(params: {
    requestId: string
    explicitName?: string
    worktreeName?: string
    initialPrompt?: string
}): string {
    const candidates = [
        params.explicitName,
        params.worktreeName,
        params.initialPrompt
    ]
    for (const candidate of candidates) {
        if (!candidate?.trim()) {
            continue
        }
        const slug = slugifySegment(candidate)
        if (slug) {
            return slug
        }
    }
    return params.requestId.slice(0, 12)
}

function normalizeBranchPrefix(prefix: string | undefined): string {
    const trimmed = prefix?.trim()
    if (!trimmed) {
        return 'haqi/'
    }
    return trimmed.endsWith('/') ? trimmed : `${trimmed}/`
}

export function resolveRepositoryBaseBranch(repository: RepositorySpec | undefined): string | undefined {
    const baseBranch = repository?.branchStrategy?.baseBranch?.trim()
    if (baseBranch) {
        return baseBranch
    }
    return repository?.ref?.branch?.trim() || undefined
}

export function resolveManagedWorkspaceBranch(params: {
    requestId: string
    repository?: RepositorySpec
    worktreeName?: string
    initialPrompt?: string
}): string | undefined {
    const repository = params.repository
    if (!repository) {
        return undefined
    }

    const mode = repository.branchStrategy?.mode ?? 'create'
    if (mode === 'detached') {
        return undefined
    }

    const baseBranch = resolveRepositoryBaseBranch(repository)
    if (mode === 'reuse') {
        return baseBranch
    }

    const stem = resolveBranchStem({
        requestId: params.requestId,
        explicitName: repository.branchStrategy?.name,
        worktreeName: params.worktreeName,
        initialPrompt: params.initialPrompt
    })
    return `${normalizeBranchPrefix(repository.branchStrategy?.prefix)}${stem}`
}
