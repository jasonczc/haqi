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

    if (options.executionBackend) {
        extraEnv.HAPI_EXECUTION_BACKEND = options.executionBackend
    }

    // Computer-use flag: flipped on at session-spawn time when the user
    // opted in. Downstream:
    //   - Claude reads it in startHappyServer and registers tools directly
    //     on the in-process HTTP MCP server (native path).
    //   - Codex/Gemini/OpenCode read it in buildHapiMcpBridge and inject
    //     the stdio MCP bridge into their ACP backend config.
    //   - Cursor does not currently wire MCP in its launcher (no-op).
    if (options.computerUse) {
        extraEnv.HAQI_COMPUTER_USE = '1'
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
            || options.thinkEffort === 'max'
            || options.thinkEffort === 'xhigh')
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

    // initialPrompt is sent as the first user message via Hub after session registers,
    // NOT via -p flag (which runs in non-interactive one-shot mode).

    return args
}

export function startHostProcessExecutor(params: {
    executionCwd: string
    workingDirectory: string
    env: Record<string, string>
    options: SpawnSessionOptions
    controlPort?: number
    callbackToken?: string
}): HostProcessExecutionResult {
    const callbackUrl = params.controlPort ? `http://127.0.0.1:${params.controlPort}` : undefined
    const childProcess = spawnHappyCLI(buildSpawnArgs(params.options), {
        cwd: params.executionCwd,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
            ...process.env,
            ...params.env,
            CLI_API_TOKEN: process.env.HAPI_CHILD_CLI_API_TOKEN ?? process.env.CLI_API_TOKEN ?? '',
            HAPI_WORKING_DIRECTORY: params.workingDirectory,
            ...(callbackUrl ? { HAPI_RUNNER_CALLBACK_URL: callbackUrl } : {}),
            ...(params.callbackToken ? { HAPI_RUNNER_CALLBACK_TOKEN: params.callbackToken } : {})
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
