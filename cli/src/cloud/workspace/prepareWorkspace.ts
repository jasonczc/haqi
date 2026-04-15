import fs from 'node:fs/promises'
import os from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type {
    CloudWorkspaceLeaseBinding,
    RepositorySpec,
    ResolvedSecret,
    RuntimeKind,
    WorkspaceSource,
    WorkspaceSpec
} from '@hapi/protocol/types'
import type { PreparedWorkspace } from '@/cloud/types'
import { loadWorkspaceEnvironmentTemplate } from '@/cloud/environment/workspaceEnvironment'
import { applyRepositoryCredential } from '@/cloud/secrets/materializeSecrets'

const execFileAsync = promisify(execFile)
const DAEMON_WORKSPACE_ROOT = '/workspace'
const DAEMON_DESKTOP_STATE_DIR = '/home/haqi/.haqi-desktop'
const DAEMON_INNER_DOCKER_STATE_DIR = '/home/haqi/.local/share/docker'

async function runGit(args: string[], cwd?: string): Promise<void> {
    await execFileAsync('git', args, cwd ? { cwd } : undefined)
}

function buildWorkspaceId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
}

async function ensureDir(path: string): Promise<void> {
    await fs.mkdir(path, { recursive: true })
}

function sanitizeVolumeComponent(value: string): string {
    return value.replace(/[^a-zA-Z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'ws'
}

function workspaceVolumeName(workspaceId: string, suffix: string): string {
    return `haqi-ws-${sanitizeVolumeComponent(workspaceId)}-${suffix}`
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
            // Use /tmp on macOS instead of os.tmpdir() (/var/folders/...) because
            // Docker Desktop only shares /tmp (/private/tmp), not /var/folders.
            : join(process.platform === 'darwin' ? '/tmp' : os.tmpdir(), 'haqi-cloud-workspaces')
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
    repositoryCredential: ResolvedSecret | undefined,
    runtimeKind: RuntimeKind | undefined
): Promise<PreparedWorkspace> {
    const workspaceId = workspaceLease?.workspaceId ?? buildWorkspaceId('repo')
    const workspaceMode = workspaceLease?.mode ?? workspace?.mode
    if (runtimeKind === 'daemon-session') {
        const workingDirectory = repository.subdirectory
            ? join(DAEMON_WORKSPACE_ROOT, repository.subdirectory)
            : DAEMON_WORKSPACE_ROOT

        return {
            workspaceId,
            workspacePath: DAEMON_WORKSPACE_ROOT,
            repoVolumePath: DAEMON_WORKSPACE_ROOT,
            desktopStatePath: DAEMON_DESKTOP_STATE_DIR,
            innerDockerStatePath: DAEMON_INNER_DOCKER_STATE_DIR,
            workingDirectory,
            workspaceBranch: workspaceLease?.workspaceBranch,
            checkpointId: workspaceLease?.checkpointId,
            source: {
                type: 'repo',
                repository
            },
            mode: workspaceMode,
            spec: workspace,
            cleanupPaths: [],
            cleanupVolumeNames: []
        }
    }

    const workspaceRoot = workspaceLease?.repoVolumePath
        ? resolve(workspaceLease.repoVolumePath)
        : resolveWorkspaceRoot({
            workspaceId,
            workspace,
            workspaceLease
        })
    const desktopStatePath = workspaceLease?.desktopStateVolumePath
        ? resolve(workspaceLease.desktopStateVolumePath)
        : join(dirname(workspaceRoot), '.haqi-desktop')
    const innerDockerStatePath = join(dirname(workspaceRoot), '.haqi-inner-docker', workspaceId)
    const checkpointId = workspaceLease?.checkpointId
    const workspaceBranch = workspaceLease?.workspaceBranch
    await ensureDir(dirname(workspaceRoot))
    await ensureDir(desktopStatePath)
    await ensureDir(innerDockerStatePath)

    if (workspaceLease?.repoVolumePath) {
        await ensureDir(workspaceRoot)
        const workingDirectory = repository.subdirectory
            ? join(workspaceRoot, repository.subdirectory)
            : workspaceRoot
        const environment = await loadWorkspaceEnvironmentTemplate([workingDirectory, workspaceRoot])

        return {
            workspaceId,
            workspacePath: workspaceRoot,
            repoVolumePath: workspaceRoot,
            desktopStatePath,
            innerDockerStatePath,
            workingDirectory,
            workspaceBranch,
            checkpointId,
            source: {
                type: 'repo',
                repository
            },
            mode: workspaceMode,
            spec: workspace,
            environment: environment ?? undefined,
            cleanupPaths: workspaceMode === 'persistent' ? [] : [workspaceRoot, desktopStatePath, innerDockerStatePath],
            cleanupVolumeNames: []
        }
    }

    const resolvedWorkspaceRoot = resolveWorkspaceRoot({
        workspaceId,
        workspace,
        workspaceLease
    })
    await ensureDir(dirname(resolvedWorkspaceRoot))

    try {
        await fs.access(resolvedWorkspaceRoot)
        const entries = await fs.readdir(resolvedWorkspaceRoot)
        if (entries.length === 0) {
            await fs.rmdir(resolvedWorkspaceRoot)
        }
    } catch {
        // ignore
    }

    const repositoryUrl = repository.url
    const authenticatedUrl = applyRepositoryCredential(repositoryUrl, repositoryCredential)
    const repositoryAlreadyExists = await hasGitRepository(resolvedWorkspaceRoot)
    if (!repositoryAlreadyExists) {
        const cloneArgs = ['clone']
        if (repository.cloneDepth) {
            cloneArgs.push('--depth', String(repository.cloneDepth))
        }
        cloneArgs.push(authenticatedUrl, resolvedWorkspaceRoot)
        await runGit(cloneArgs)
        if (authenticatedUrl !== repositoryUrl) {
            await runGit(['remote', 'set-url', 'origin', repositoryUrl], resolvedWorkspaceRoot)
        }
    } else {
        await syncRemoteUrl(resolvedWorkspaceRoot, repositoryUrl, authenticatedUrl)
    }

    if (repository.ref?.branch) {
        await runGit(['checkout', repository.ref.branch], resolvedWorkspaceRoot)
        await runGit(['pull', '--ff-only', 'origin', repository.ref.branch], resolvedWorkspaceRoot).catch(() => undefined)
    } else if (repository.ref?.tag) {
        await runGit(['checkout', `tags/${repository.ref.tag}`], resolvedWorkspaceRoot)
    } else if (repository.ref?.commit) {
        await runGit(['checkout', repository.ref.commit], resolvedWorkspaceRoot)
    } else if (repository.ref?.pr) {
        const pullRequestRef = `refs/pull/${repository.ref.pr}/head`
        try {
            await runGit(['fetch', 'origin', `${pullRequestRef}:haqi-pr-${repository.ref.pr}`], resolvedWorkspaceRoot)
        } catch {
            await runGit(['fetch', 'origin', `pull/${repository.ref.pr}/head:haqi-pr-${repository.ref.pr}`], resolvedWorkspaceRoot)
        }
        await runGit(['checkout', `haqi-pr-${repository.ref.pr}`], resolvedWorkspaceRoot)
    }

    if (repository.withSubmodules) {
        await runGit(['submodule', 'update', '--init', '--recursive'], resolvedWorkspaceRoot)
    }

    if (repository.withLfs) {
        await runGit(['lfs', 'install', '--local'], resolvedWorkspaceRoot)
        await runGit(['lfs', 'pull'], resolvedWorkspaceRoot)
    }

    const workingDirectory = repository.subdirectory
        ? join(resolvedWorkspaceRoot, repository.subdirectory)
        : resolvedWorkspaceRoot
    const environment = await loadWorkspaceEnvironmentTemplate([workingDirectory, resolvedWorkspaceRoot])

    return {
        workspaceId,
        workspacePath: resolvedWorkspaceRoot,
        repoVolumePath: resolvedWorkspaceRoot,
        desktopStatePath,
        innerDockerStatePath,
        workingDirectory,
        workspaceBranch,
        checkpointId,
        source: {
            type: 'repo',
            repository
        },
        mode: workspaceMode,
        spec: workspace,
        environment: environment ?? undefined,
        cleanupPaths: workspaceMode === 'persistent' ? [] : [resolvedWorkspaceRoot, desktopStatePath, innerDockerStatePath],
        cleanupVolumeNames: []
    }
}

export async function prepareWorkspace(options: {
    directory?: string
    workspaceSource?: WorkspaceSource
    workspace?: WorkspaceSpec
    workspaceLease?: CloudWorkspaceLeaseBinding
    repositoryCredential?: ResolvedSecret
    runtimeKind?: RuntimeKind
}): Promise<PreparedWorkspace> {
    const workspaceSource = options.workspaceSource

    if (workspaceSource?.repository) {
        return await prepareRepositoryWorkspace(
            workspaceSource.repository,
            options.workspace,
            options.workspaceLease,
            options.repositoryCredential,
            options.runtimeKind
        )
    }

    const directory = options.workspaceLease?.path || workspaceSource?.directory || options.directory
    if (!directory) {
        throw new Error('Workspace directory is required')
    }

    const workspaceId = options.workspaceLease?.workspaceId ?? buildWorkspaceId('dir')
    const resolvedDirectory = resolve(directory)
    await ensureDir(resolvedDirectory)
    if (options.runtimeKind === 'daemon-session') {
        const environment = await loadWorkspaceEnvironmentTemplate([resolvedDirectory])

        return {
            workspaceId,
            workspacePath: DAEMON_WORKSPACE_ROOT,
            repoVolumePath: DAEMON_WORKSPACE_ROOT,
            workingDirectory: DAEMON_WORKSPACE_ROOT,
            desktopStatePath: options.workspaceLease?.desktopStateVolumePath
                ? resolve(options.workspaceLease.desktopStateVolumePath)
                : undefined,
            innerDockerStatePath: DAEMON_INNER_DOCKER_STATE_DIR,
            workspaceBranch: options.workspaceLease?.workspaceBranch,
            checkpointId: options.workspaceLease?.checkpointId,
            source: workspaceSource ?? {
                type: 'path',
                directory: resolvedDirectory
            },
            mode: options.workspaceLease?.mode ?? options.workspace?.mode,
            spec: options.workspace,
            environment: environment ?? undefined,
            cleanupPaths: [],
            cleanupVolumeNames: []
        }
    }

    const innerDockerStatePath = join(
        process.platform === 'darwin' ? '/tmp' : os.tmpdir(),
        'haqi-cloud-workspaces',
        `${workspaceId}-inner-docker`
    )
    await ensureDir(innerDockerStatePath)
    const environment = await loadWorkspaceEnvironmentTemplate([resolvedDirectory])
    const cleanupPaths = [innerDockerStatePath]

    return {
        workspaceId,
        workspacePath: resolvedDirectory,
        repoVolumePath: resolvedDirectory,
        workingDirectory: resolvedDirectory,
        desktopStatePath: options.workspaceLease?.desktopStateVolumePath
            ? resolve(options.workspaceLease.desktopStateVolumePath)
            : undefined,
        innerDockerStatePath,
        workspaceBranch: options.workspaceLease?.workspaceBranch,
        checkpointId: options.workspaceLease?.checkpointId,
        source: workspaceSource ?? {
            type: 'path',
            directory: resolvedDirectory
        },
        mode: options.workspaceLease?.mode ?? options.workspace?.mode,
        spec: options.workspace,
        environment: environment ?? undefined,
        cleanupPaths: (options.workspaceLease?.mode ?? options.workspace?.mode) === 'persistent' ? [] : cleanupPaths,
        cleanupVolumeNames: []
    }
}
