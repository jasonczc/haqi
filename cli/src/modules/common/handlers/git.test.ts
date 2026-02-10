import { appendFile, mkdir, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { beforeEach, describe, expect, it } from 'vitest'
import { RpcHandlerManager } from '../../../api/rpc/RpcHandlerManager'
import { registerGitHandlers } from './git'

const execFileAsync = promisify(execFile)

type GitResponse = {
    success: boolean
    stdout?: string
    stderr?: string
    error?: string
}

async function createTempDir(prefix: string): Promise<string> {
    const base = tmpdir()
    const path = join(base, `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`)
    await mkdir(path, { recursive: true })
    return path
}

async function runGit(args: string[], cwd: string): Promise<void> {
    await execFileAsync('git', args, { cwd })
}

async function initRepo(repoPath: string): Promise<void> {
    await mkdir(repoPath, { recursive: true })
    await runGit(['init', '-q'], repoPath)
    await runGit(['config', 'user.email', 'test@example.com'], repoPath)
    await runGit(['config', 'user.name', 'Hapi Test'], repoPath)
}

async function callGitHandler(
    rpc: RpcHandlerManager,
    method: 'git-status' | 'git-diff-numstat' | 'git-diff-file',
    params: Record<string, unknown>
): Promise<GitResponse> {
    const response = await rpc.handleRequest({
        method: `session-test:${method}`,
        params: JSON.stringify(params)
    })
    return JSON.parse(response) as GitResponse
}

describe('git RPC handlers', () => {
    let rootDir: string
    let rpc: RpcHandlerManager

    beforeEach(async () => {
        if (rootDir) {
            await rm(rootDir, { recursive: true, force: true })
        }

        rootDir = await createTempDir('hapi-git-handler')
        rpc = new RpcHandlerManager({ scopePrefix: 'session-test' })
        registerGitHandlers(rpc, rootDir)
    })

    it('aggregates nested repository changes when cwd is not a git repository', async () => {
        const repoPath = join(rootDir, 'project-a')
        await initRepo(repoPath)

        await writeFile(join(repoPath, 'tracked.txt'), 'line1\n')
        await runGit(['add', 'tracked.txt'], repoPath)
        await runGit(['-c', 'commit.gpgsign=false', 'commit', '-m', 'init', '-q'], repoPath)

        await appendFile(join(repoPath, 'tracked.txt'), 'line2\n')
        await runGit(['add', 'tracked.txt'], repoPath)
        await appendFile(join(repoPath, 'tracked.txt'), 'line3\n')
        await writeFile(join(repoPath, 'untracked.txt'), 'hello\n')

        const statusResult = await callGitHandler(rpc, 'git-status', { cwd: rootDir })
        expect(statusResult.success).toBe(true)
        expect(statusResult.stdout ?? '').toContain('@@HAPI_REPO project-a')
        expect(statusResult.stdout ?? '').toContain(' tracked.txt')
        expect(statusResult.stdout ?? '').toContain('? untracked.txt')
        expect(statusResult.stdout ?? '').toContain('@@HAPI_REPO_END')

        const numstatResult = await callGitHandler(rpc, 'git-diff-numstat', { cwd: rootDir, staged: false })
        expect(numstatResult.success).toBe(true)
        expect(numstatResult.stdout ?? '').toContain('@@HAPI_REPO project-a')
        expect(numstatResult.stdout ?? '').toContain('\ttracked.txt')

        const stagedNumstatResult = await callGitHandler(rpc, 'git-diff-numstat', { cwd: rootDir, staged: true })
        expect(stagedNumstatResult.success).toBe(true)
        expect(stagedNumstatResult.stdout ?? '').toContain('@@HAPI_REPO project-a')
        expect(stagedNumstatResult.stdout ?? '').toContain('\ttracked.txt')

        const fileDiffResult = await callGitHandler(rpc, 'git-diff-file', {
            cwd: rootDir,
            filePath: 'project-a/tracked.txt',
            staged: false
        })
        expect(fileDiffResult.success).toBe(true)
        expect(fileDiffResult.stdout ?? '').toContain('+line3')

        const stagedFileDiffResult = await callGitHandler(rpc, 'git-diff-file', {
            cwd: rootDir,
            filePath: 'project-a/tracked.txt',
            staged: true
        })
        expect(stagedFileDiffResult.success).toBe(true)
        expect(stagedFileDiffResult.stdout ?? '').toContain('+line2')
    })

    it('returns a clear error when no nested git repository exists', async () => {
        const statusResult = await callGitHandler(rpc, 'git-status', { cwd: rootDir })
        expect(statusResult.success).toBe(false)
        expect(statusResult.error ?? '').toContain('no nested git repositories')
    })
})
