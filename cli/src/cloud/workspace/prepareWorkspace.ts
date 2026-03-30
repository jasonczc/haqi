import fs from 'node:fs/promises'
import os from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type {
    CloudWorkspaceLeaseBinding,
    RepositorySpec,
    ResolvedSecret,
    WorkspaceSource,
    WorkspaceSpec
} from '@hapi/protocol/types'
import type { PreparedWorkspace } from '@/cloud/types'
import { loadWorkspaceEnvironmentTemplate } from '@/cloud/environment/workspaceEnvironment'
import { applyRepositoryCredential } from '@/cloud/secrets/materializeSecrets'

const execFileAsync = promisify(execFile)

async function runGit(args: string[], cwd?: string): Promise<void> {
    await execFileAsync('git', args, cwd ? { cwd } : undefined)
}

function buildWorkspaceId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
}

async function ensureDir(path: string): Promise<void> {
    await fs.mkdir(path, { recursive: true })
}

async function hasGitRepository(path: string): Promise<boolean> {
    try {
        const stats = await fs.stat(join(path, '.git'))
        return stats.isDirectory()
    } catch {
        return false
    }
}

async function syncRemoteUrl(workspaceRoot: string, repositoryUrl: string, authenticatedUrl: string): Promise<void> {
    const shouldRestore = authenticatedUrl !== repositoryUrl
    if (shouldRestore) {
        await runGit(['remote', 'set-url', 'origin', authenticatedUrl], workspaceRoot)
    }

    try {
        await runGit(['fetch', '--all', '--prune'], workspaceRoot)
    } finally {
        if (shouldRestore) {
            await runGit(['remote', 'set-url', 'origin', repositoryUrl], workspaceRoot).catch(() => undefined)
        }
    }
}

function resolveWorkspaceRoot(options: {
    workspaceId: string
    workspace?: WorkspaceSpec
    workspaceLease?: CloudWorkspaceLeaseBinding
}): string {
    if (options.workspaceLease?.path) {
        return resolve(options.workspaceLease.path)
    }
    const baseDir = options.workspaceLease?.baseDir
        ? resolve(options.workspaceLease.baseDir)
        : options.workspace?.baseDir
            ? resolve(options.workspace.baseDir)
            : join(os.tmpdir(), 'haqi-cloud-workspaces')
    const workspaceName = options.workspaceLease?.name?.trim()
        || options.workspace?.name?.trim()
        || options.workspaceLease?.workspaceKey?.trim()
        || options.workspaceLease?.workspaceId?.trim()
        || options.workspaceId
    return join(baseDir, workspaceName)
}

async function prepareRepositoryWorkspace(
    repository: RepositorySpec,
    workspace: WorkspaceSpec | undefined,
    workspaceLease: CloudWorkspaceLeaseBinding | undefined,
    repositoryCredential: ResolvedSecret | undefined
): Promise<PreparedWorkspace> {
    const workspaceId = workspaceLease?.workspaceId ?? buildWorkspaceId('repo')
    const workspaceRoot = resolveWorkspaceRoot({
        workspaceId,
        workspace,
        workspaceLease
    })
    await ensureDir(dirname(workspaceRoot))

    try {
        await fs.access(workspaceRoot)
        const entries = await fs.readdir(workspaceRoot)
        if (entries.length === 0) {
            await fs.rmdir(workspaceRoot)
        }
    } catch {
        // ignore
    }

    const repositoryUrl = repository.url
    const authenticatedUrl = applyRepositoryCredential(repositoryUrl, repositoryCredential)
    const repositoryAlreadyExists = await hasGitRepository(workspaceRoot)
    if (!repositoryAlreadyExists) {
        const cloneArgs = ['clone']
        if (repository.cloneDepth) {
            cloneArgs.push('--depth', String(repository.cloneDepth))
        }
        cloneArgs.push(authenticatedUrl, workspaceRoot)
        await runGit(cloneArgs)
        if (authenticatedUrl !== repositoryUrl) {
            await runGit(['remote', 'set-url', 'origin', repositoryUrl], workspaceRoot)
        }
    } else {
        await syncRemoteUrl(workspaceRoot, repositoryUrl, authenticatedUrl)
    }

    if (repository.ref?.branch) {
        await runGit(['checkout', repository.ref.branch], workspaceRoot)
        await runGit(['pull', '--ff-only', 'origin', repository.ref.branch], workspaceRoot).catch(() => undefined)
    } else if (repository.ref?.tag) {
        await runGit(['checkout', `tags/${repository.ref.tag}`], workspaceRoot)
    } else if (repository.ref?.commit) {
        await runGit(['checkout', repository.ref.commit], workspaceRoot)
    } else if (repository.ref?.pr) {
        const pullRequestRef = `refs/pull/${repository.ref.pr}/head`
        try {
            await runGit(['fetch', 'origin', `${pullRequestRef}:haqi-pr-${repository.ref.pr}`], workspaceRoot)
        } catch {
            await runGit(['fetch', 'origin', `pull/${repository.ref.pr}/head:haqi-pr-${repository.ref.pr}`], workspaceRoot)
        }
        await runGit(['checkout', `haqi-pr-${repository.ref.pr}`], workspaceRoot)
    }

    if (repository.withSubmodules) {
        await runGit(['submodule', 'update', '--init', '--recursive'], workspaceRoot)
    }

    if (repository.withLfs) {
        await runGit(['lfs', 'install', '--local'], workspaceRoot)
        await runGit(['lfs', 'pull'], workspaceRoot)
    }

    const workingDirectory = repository.subdirectory
        ? join(workspaceRoot, repository.subdirectory)
        : workspaceRoot
    const environment = await loadWorkspaceEnvironmentTemplate([workingDirectory, workspaceRoot])

    return {
        workspaceId,
        workspacePath: workspaceRoot,
        workingDirectory,
        source: {
            type: 'repo',
            repository
        },
        mode: workspaceLease?.mode ?? workspace?.mode,
        spec: workspace,
        environment: environment ?? undefined,
        cleanupPaths: (workspaceLease?.mode ?? workspace?.mode) === 'persistent' ? [] : [workspaceRoot]
    }
}

export async function prepareWorkspace(options: {
    directory?: string
    workspaceSource?: WorkspaceSource
    workspace?: WorkspaceSpec
    workspaceLease?: CloudWorkspaceLeaseBinding
    repositoryCredential?: ResolvedSecret
}): Promise<PreparedWorkspace> {
    const workspaceSource = options.workspaceSource

    if (workspaceSource?.repository) {
        return await prepareRepositoryWorkspace(
            workspaceSource.repository,
            options.workspace,
            options.workspaceLease,
            options.repositoryCredential
        )
    }

    const directory = options.workspaceLease?.path || workspaceSource?.directory || options.directory
    if (!directory) {
        throw new Error('Workspace directory is required')
    }

    const resolvedDirectory = resolve(directory)
    await ensureDir(resolvedDirectory)
    const environment = await loadWorkspaceEnvironmentTemplate([resolvedDirectory])

    return {
        workspaceId: options.workspaceLease?.workspaceId ?? buildWorkspaceId('dir'),
        workspacePath: resolvedDirectory,
        workingDirectory: resolvedDirectory,
        source: workspaceSource ?? {
            type: 'path',
            directory: resolvedDirectory
        },
        mode: options.workspaceLease?.mode ?? options.workspace?.mode,
        spec: options.workspace,
        environment: environment ?? undefined,
        cleanupPaths: []
    }
}
