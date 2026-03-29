import fs from 'node:fs/promises'
import os from 'node:os'
import { join } from 'node:path'
import type { ChildProcess } from 'node:child_process'
import type { RuntimeKind } from '@hapi/protocol/types'
import type { SpawnSessionOptions } from '@/modules/common/rpcTypes'
import { spawnHappyCLI } from '@/utils/spawnHappyCLI'
import type { WorktreeInfo } from '@/runner/worktree'

export type HostProcessExecutionResult = {
    childProcess: ChildProcess
    pid: number
    runtimeKind: RuntimeKind
    containerId?: string
    workingDirectory: string
    env: Record<string, string>
}

export async function buildSpawnEnvironment(
    options: SpawnSessionOptions,
    params: {
        worktreeInfo: WorktreeInfo | null
        serviceEnv?: Record<string, string>
    }
): Promise<Record<string, string>> {
    const extraEnv: Record<string, string> = {
        ...(params.serviceEnv ?? {})
    }

    if (options.token) {
        if (options.agent === 'codex') {
            const codexHomeDir = await fs.mkdtemp(join(os.tmpdir(), 'hapi-codex-'))
            await fs.writeFile(join(codexHomeDir, 'auth.json'), options.token)
            extraEnv.CODEX_HOME = codexHomeDir
        } else if (options.agent === 'claude' || !options.agent) {
            extraEnv.CLAUDE_CODE_OAUTH_TOKEN = options.token
        }
    }

    if (params.worktreeInfo) {
        extraEnv.HAPI_WORKTREE_BASE_PATH = params.worktreeInfo.basePath
        extraEnv.HAPI_WORKTREE_BRANCH = params.worktreeInfo.branch
        extraEnv.HAPI_WORKTREE_NAME = params.worktreeInfo.name
        extraEnv.HAPI_WORKTREE_PATH = params.worktreeInfo.worktreePath
        extraEnv.HAPI_WORKTREE_CREATED_AT = String(params.worktreeInfo.createdAt)
    }

    if (
        options.agent === 'claude'
        && options.thinkEffort
        && options.thinkEffort !== 'auto'
        && options.thinkEffort !== 'xhigh'
        && options.thinkEffort !== 'max'
    ) {
        extraEnv.CLAUDE_CODE_EFFORT_LEVEL = options.thinkEffort
    }

    return extraEnv
}

export function buildSpawnArgs(options: SpawnSessionOptions): string[] {
    const agent = options.agent ?? 'claude'
    const agentCommand = agent === 'codex'
        ? 'codex'
        : agent === 'cursor'
            ? 'cursor'
            : agent === 'gemini'
                ? 'gemini'
                : agent === 'opencode'
                    ? 'opencode'
                    : 'claude'
    const args = [agentCommand]

    if (options.resumeSessionId) {
        if (agent === 'codex') {
            args.push('resume', options.resumeSessionId)
        } else {
            args.push('--resume', options.resumeSessionId)
        }
    }

    args.push('--hapi-starting-mode', 'remote', '--started-by', 'runner')

    if (options.model && agent !== 'opencode') {
        args.push('--model', options.model)
    }
    if (agent === 'codex' && options.thinkEffort) {
        args.push('--effort', options.thinkEffort)
    }
    if (agent === 'codex' && options.serviceTier) {
        args.push('--service-tier', options.serviceTier)
    }
    if (
        agent === 'claude'
        && options.thinkEffort
        && (options.thinkEffort === 'low'
            || options.thinkEffort === 'medium'
            || options.thinkEffort === 'high'
            || options.thinkEffort === 'max')
    ) {
        args.push('--effort', options.thinkEffort)
    }
    if (options.yolo) {
        if (agent === 'codex') {
            args.push('--auto-approve')
        } else {
            args.push('--yolo')
        }
    }

    return args
}

export function startHostProcessExecutor(params: {
    executionCwd: string
    workingDirectory: string
    env: Record<string, string>
    options: SpawnSessionOptions
}): HostProcessExecutionResult {
    const childProcess = spawnHappyCLI(buildSpawnArgs(params.options), {
        cwd: params.executionCwd,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
            ...process.env,
            ...params.env,
            HAPI_WORKING_DIRECTORY: params.workingDirectory
        }
    })

    if (!childProcess.pid) {
        throw new Error('Failed to spawn host process executor: no PID returned')
    }

    return {
        childProcess,
        pid: childProcess.pid,
        runtimeKind: 'host-process',
        workingDirectory: params.workingDirectory,
        env: params.env
    }
}
