import fs from 'node:fs/promises'
import os from 'node:os'
import { join, resolve } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { RepositorySpec, WorkspaceSource, WorkspaceSpec } from '@hapi/protocol/types'
import type { PreparedWorkspace } from '@/cloud/types'

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

async function prepareRepositoryWorkspace(repository: RepositorySpec, workspace: WorkspaceSpec | undefined): Promise<PreparedWorkspace> {
    const workspaceId = buildWorkspaceId('repo')
    const baseDir = workspace?.baseDir
        ? resolve(workspace.baseDir)
        : join(os.tmpdir(), 'haqi-cloud-workspaces')
    const workspaceName = workspace?.name?.trim()
    const workspaceRoot = join(baseDir, workspaceName || workspaceId)
    await ensureDir(baseDir)

    try {
        await fs.access(workspaceRoot)
        const entries = await fs.readdir(workspaceRoot)
        if (entries.length === 0) {
            await fs.rmdir(workspaceRoot)
        }
    } catch {
        // ignore
    }

    const cloneArgs = ['clone']
    if (repository.cloneDepth) {
        cloneArgs.push('--depth', String(repository.cloneDepth))
    }
    cloneArgs.push(repository.url, workspaceRoot)
    await runGit(cloneArgs)

    if (repository.ref?.branch) {
        await runGit(['checkout', repository.ref.branch], workspaceRoot)
    } else if (repository.ref?.tag) {
        await runGit(['checkout', `tags/${repository.ref.tag}`], workspaceRoot)
    } else if (repository.ref?.commit) {
        await runGit(['checkout', repository.ref.commit], workspaceRoot)
    }

    if (repository.withSubmodules) {
        await runGit(['submodule', 'update', '--init', '--recursive'], workspaceRoot)
    }

    const workingDirectory = repository.subdirectory
        ? join(workspaceRoot, repository.subdirectory)
        : workspaceRoot

    return {
        workspaceId,
        workspacePath: workspaceRoot,
        workingDirectory,
        source: {
            type: 'repo',
            repository
        },
        mode: workspace?.mode,
        spec: workspace,
        cleanupPaths: [workspaceRoot]
    }
}

export async function prepareWorkspace(options: {
    directory?: string
    workspaceSource?: WorkspaceSource
    workspace?: WorkspaceSpec
}): Promise<PreparedWorkspace> {
    const workspaceSource = options.workspaceSource

    if (workspaceSource?.repository) {
        return await prepareRepositoryWorkspace(workspaceSource.repository, options.workspace)
    }

    const directory = workspaceSource?.directory || options.directory
    if (!directory) {
        throw new Error('Workspace directory is required')
    }

    const resolvedDirectory = resolve(directory)
    await ensureDir(resolvedDirectory)

    return {
        workspaceId: buildWorkspaceId('dir'),
        workspacePath: resolvedDirectory,
        workingDirectory: resolvedDirectory,
        source: workspaceSource ?? {
            type: 'path',
            directory: resolvedDirectory
        },
        mode: options.workspace?.mode,
        spec: options.workspace,
        cleanupPaths: []
    }
}
