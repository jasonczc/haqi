import { execFile, type ExecFileOptions } from 'child_process'
import { lstat, readdir } from 'fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'path'
import { promisify } from 'util'
import type { RpcHandlerManager } from '@/api/rpc/RpcHandlerManager'
import { validatePath } from '../pathSecurity'
import { rpcError } from '../rpcResponses'

const execFileAsync = promisify(execFile)
const GIT_STATUS_ARGS = ['status', '--porcelain=v2', '--branch', '--untracked-files=all']
const DISCOVERY_CACHE_TTL_MS = 3_000
const MAX_DISCOVERY_DEPTH = 4
const MAX_DISCOVERY_REPOS = 64
const MAX_DISCOVERY_DIRECTORIES = 2_000
const HAPI_REPO_SECTION_PREFIX = '@@HAPI_REPO '
const HAPI_REPO_SECTION_END = '@@HAPI_REPO_END'
const SKIPPED_DIRECTORY_NAMES = new Set([
    '.git',
    'node_modules',
    '.idea',
    '.vscode',
    'dist',
    'build',
    'target',
    '.next',
    '.cache',
    '.turbo',
    '.pnpm-store',
    'coverage'
])

interface GitStatusRequest {
    cwd?: string
    timeout?: number
}

interface GitDiffNumstatRequest {
    cwd?: string
    staged?: boolean
    timeout?: number
}

interface GitDiffFileRequest {
    cwd?: string
    filePath: string
    staged?: boolean
    timeout?: number
}

interface GitCommandResponse {
    success: boolean
    stdout?: string
    stderr?: string
    exitCode?: number
    error?: string
}

interface DiscoveredGitRepo {
    absolutePath: string
    relativePath: string
}

interface RepoDiscoveryCacheEntry {
    expiresAt: number
    repos: DiscoveredGitRepo[]
}

function resolveCwd(requestedCwd: string | undefined, workingDirectory: string): { cwd: string; error?: string } {
    const cwd = requestedCwd ?? workingDirectory
    const validation = validatePath(cwd, workingDirectory)
    if (!validation.valid) {
        return { cwd, error: validation.error ?? 'Invalid working directory' }
    }
    return { cwd }
}

function validateFilePath(filePath: string, workingDirectory: string): string | null {
    const validation = validatePath(filePath, workingDirectory)
    if (!validation.valid) {
        return validation.error ?? 'Invalid file path'
    }
    return null
}

async function runGitCommand(
    args: string[],
    cwd: string,
    timeout?: number
): Promise<GitCommandResponse> {
    try {
        const options: ExecFileOptions = {
            cwd,
            timeout: timeout ?? 10_000
        }
        const { stdout, stderr } = await execFileAsync('git', args, options)
        return {
            success: true,
            stdout: stdout ? stdout.toString() : '',
            stderr: stderr ? stderr.toString() : '',
            exitCode: 0
        }
    } catch (error) {
        const execError = error as NodeJS.ErrnoException & {
            stdout?: string
            stderr?: string
            code?: number | string
            killed?: boolean
        }

        if (execError.code === 'ETIMEDOUT' || execError.killed) {
            return rpcError('Command timed out', {
                stdout: execError.stdout ? execError.stdout.toString() : '',
                stderr: execError.stderr ? execError.stderr.toString() : '',
                exitCode: typeof execError.code === 'number' ? execError.code : -1
            })
        }

        return rpcError(execError.message || 'Command failed', {
            stdout: execError.stdout ? execError.stdout.toString() : '',
            stderr: execError.stderr ? execError.stderr.toString() : execError.message || 'Command failed',
            exitCode: typeof execError.code === 'number' ? execError.code : 1
        })
    }
}

function shouldFallbackToNestedRepos(response: GitCommandResponse): boolean {
    if (response.success) return false
    const details = `${response.error ?? ''}\n${response.stderr ?? ''}`.toLowerCase()
    return details.includes('not a git repository')
        || details.includes('use --no-index to compare two paths outside a working tree')
        || details.includes('usage: git diff --no-index')
        || details.includes('unknown option `cached`')
}

function toPosixPath(value: string): string {
    return value.split(sep).join('/')
}

function wrapRepoSectionOutput(repoName: string, output: string): string {
    const encodedRepo = encodeURIComponent(repoName)
    const body = output.trim()
    if (!body) {
        return `${HAPI_REPO_SECTION_PREFIX}${encodedRepo}\n${HAPI_REPO_SECTION_END}`
    }
    return `${HAPI_REPO_SECTION_PREFIX}${encodedRepo}\n${body}\n${HAPI_REPO_SECTION_END}`
}

function shouldSkipDirectory(name: string): boolean {
    if (name === '.git') return true
    if (SKIPPED_DIRECTORY_NAMES.has(name)) return true
    return name.startsWith('.')
}

async function hasGitMetadata(dirPath: string): Promise<boolean> {
    try {
        const gitMetaPath = join(dirPath, '.git')
        const stats = await lstat(gitMetaPath)
        return stats.isDirectory() || stats.isFile()
    } catch {
        return false
    }
}

async function discoverNestedGitRepos(baseCwd: string): Promise<DiscoveredGitRepo[]> {
    const queue: Array<{ path: string; depth: number }> = [{ path: baseCwd, depth: 0 }]
    const discovered: DiscoveredGitRepo[] = []
    let scannedDirectories = 0

    for (let index = 0; index < queue.length; index += 1) {
        if (discovered.length >= MAX_DISCOVERY_REPOS) break
        if (scannedDirectories >= MAX_DISCOVERY_DIRECTORIES) break

        const current = queue[index]
        if (!current) break
        scannedDirectories += 1

        if (current.depth > 0 && await hasGitMetadata(current.path)) {
            const relPath = toPosixPath(relative(baseCwd, current.path))
            if (relPath && !relPath.startsWith('..')) {
                discovered.push({
                    absolutePath: current.path,
                    relativePath: relPath
                })
            }
            continue
        }

        if (current.depth >= MAX_DISCOVERY_DEPTH) {
            continue
        }

        let entries: Array<{ name: string; isDirectory: () => boolean }> = []
        try {
            entries = await readdir(current.path, { withFileTypes: true, encoding: 'utf8' })
        } catch {
            continue
        }

        for (const entry of entries) {
            if (!entry.isDirectory()) continue
            if (shouldSkipDirectory(entry.name)) continue
            queue.push({
                path: join(current.path, entry.name),
                depth: current.depth + 1
            })
        }
    }

    discovered.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
    return discovered
}

function isPathInside(targetPath: string, parentPath: string): boolean {
    const resolvedTarget = resolve(targetPath)
    const resolvedParent = resolve(parentPath)
    const rel = relative(resolvedParent, resolvedTarget)
    if (!rel) return true
    if (rel.startsWith('..')) return false
    if (isAbsolute(rel)) return false
    return true
}

export function registerGitHandlers(rpcHandlerManager: RpcHandlerManager, workingDirectory: string): void {
    const repoDiscoveryCache = new Map<string, RepoDiscoveryCacheEntry>()

    const getNestedRepos = async (baseCwd: string): Promise<DiscoveredGitRepo[]> => {
        const cached = repoDiscoveryCache.get(baseCwd)
        const now = Date.now()
        if (cached && cached.expiresAt > now) {
            return cached.repos
        }

        const repos = await discoverNestedGitRepos(baseCwd)
        repoDiscoveryCache.set(baseCwd, {
            repos,
            expiresAt: now + DISCOVERY_CACHE_TTL_MS
        })
        return repos
    }

    const runNestedStatusFallback = async (baseCwd: string, timeout?: number): Promise<GitCommandResponse> => {
        const repos = await getNestedRepos(baseCwd)
        if (repos.length === 0) {
            return rpcError('Not a git repository and no nested git repositories were found')
        }

        const outputs: string[] = []
        const errors: string[] = []
        let hasSuccess = false

        for (const repo of repos) {
            const result = await runGitCommand(GIT_STATUS_ARGS, repo.absolutePath, timeout)
            if (!result.success) {
                errors.push(`[${repo.relativePath}] ${result.error ?? result.stderr ?? 'status failed'}`)
                continue
            }

            hasSuccess = true
            outputs.push(wrapRepoSectionOutput(repo.relativePath, result.stdout ?? ''))
        }

        if (!hasSuccess) {
            const fallbackError = errors[0] ?? 'Nested git status unavailable'
            return rpcError(fallbackError, { stderr: errors.join('\n') })
        }

        return {
            success: true,
            stdout: outputs.join('\n'),
            stderr: errors.join('\n'),
            exitCode: 0
        }
    }

    const runNestedNumstatFallback = async (
        baseCwd: string,
        staged: boolean,
        timeout?: number
    ): Promise<GitCommandResponse> => {
        const repos = await getNestedRepos(baseCwd)
        if (repos.length === 0) {
            return rpcError('Not a git repository and no nested git repositories were found')
        }

        const args = staged ? ['diff', '--cached', '--numstat'] : ['diff', '--numstat']
        const outputs: string[] = []
        const errors: string[] = []
        let hasSuccess = false

        for (const repo of repos) {
            const result = await runGitCommand(args, repo.absolutePath, timeout)
            if (!result.success) {
                errors.push(`[${repo.relativePath}] ${result.error ?? result.stderr ?? 'diff failed'}`)
                continue
            }

            hasSuccess = true
            outputs.push(wrapRepoSectionOutput(repo.relativePath, result.stdout ?? ''))
        }

        if (!hasSuccess) {
            const fallbackError = errors[0] ?? 'Nested git diff unavailable'
            return rpcError(fallbackError, { stderr: errors.join('\n') })
        }

        return {
            success: true,
            stdout: outputs.join('\n'),
            stderr: errors.join('\n'),
            exitCode: 0
        }
    }

    const runNestedDiffFileFallback = async (
        baseCwd: string,
        filePath: string,
        staged: boolean | undefined,
        timeout?: number
    ): Promise<GitCommandResponse> => {
        const repos = await getNestedRepos(baseCwd)
        if (repos.length === 0) {
            return rpcError('Not a git repository and no nested git repositories were found')
        }

        const absoluteFilePath = resolve(baseCwd, filePath)
        const matchingRepos = repos
            .filter((repo) => isPathInside(absoluteFilePath, repo.absolutePath))
            .sort((a, b) => b.absolutePath.length - a.absolutePath.length)
        const targetRepo = matchingRepos[0]
        if (!targetRepo) {
            return rpcError(`File '${filePath}' is not inside a nested git repository`)
        }

        const repoRelativePath = relative(targetRepo.absolutePath, absoluteFilePath)
        if (!repoRelativePath || repoRelativePath.startsWith('..') || isAbsolute(repoRelativePath)) {
            return rpcError(`Invalid git diff file path '${filePath}'`)
        }

        const args = staged
            ? ['diff', '--cached', '--no-ext-diff', '--', repoRelativePath]
            : ['diff', '--no-ext-diff', '--', repoRelativePath]

        return await runGitCommand(args, targetRepo.absolutePath, timeout)
    }

    rpcHandlerManager.registerHandler<GitStatusRequest, GitCommandResponse>('git-status', async (data) => {
        const resolved = resolveCwd(data.cwd, workingDirectory)
        if (resolved.error) {
            return rpcError(resolved.error)
        }

        const result = await runGitCommand(
            GIT_STATUS_ARGS,
            resolved.cwd,
            data.timeout
        )
        if (result.success || !shouldFallbackToNestedRepos(result)) {
            return result
        }

        return await runNestedStatusFallback(resolved.cwd, data.timeout)
    })

    rpcHandlerManager.registerHandler<GitDiffNumstatRequest, GitCommandResponse>('git-diff-numstat', async (data) => {
        const resolved = resolveCwd(data.cwd, workingDirectory)
        if (resolved.error) {
            return rpcError(resolved.error)
        }
        const args = data.staged
            ? ['diff', '--cached', '--numstat']
            : ['diff', '--numstat']
        const result = await runGitCommand(args, resolved.cwd, data.timeout)
        if (result.success || !shouldFallbackToNestedRepos(result)) {
            return result
        }

        return await runNestedNumstatFallback(resolved.cwd, data.staged === true, data.timeout)
    })

    rpcHandlerManager.registerHandler<GitDiffFileRequest, GitCommandResponse>('git-diff-file', async (data) => {
        const resolved = resolveCwd(data.cwd, workingDirectory)
        if (resolved.error) {
            return rpcError(resolved.error)
        }
        const fileError = validateFilePath(data.filePath, workingDirectory)
        if (fileError) {
            return rpcError(fileError)
        }

        const args = data.staged
            ? ['diff', '--cached', '--no-ext-diff', '--', data.filePath]
            : ['diff', '--no-ext-diff', '--', data.filePath]
        const result = await runGitCommand(args, resolved.cwd, data.timeout)
        if (result.success || !shouldFallbackToNestedRepos(result)) {
            return result
        }

        return await runNestedDiffFileFallback(resolved.cwd, data.filePath, data.staged, data.timeout)
    })
}
