import { afterEach, describe, expect, it } from 'vitest'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AgentState } from '@/api/types'
import type { PermissionMode } from '@/claude/loop'
import { claudeRemote } from './claudeRemote'
import { PermissionHandler } from './utils/permissionHandler'

type PermissionRpcPayload = {
    id: string
    approved: boolean
    reason?: string
    mode?: PermissionMode
    allowTools?: string[]
}

type FakeClaudeLogEntry = {
    direction?: 'stdin' | 'stdout'
    event?: string
    message?: unknown
    response?: unknown
}

const previousClaudePath = process.env.HAPI_CLAUDE_PATH
const previousFakeLog = process.env.HAQI_FAKE_CLAUDE_LOG

afterEach(() => {
    if (previousClaudePath === undefined) {
        delete process.env.HAPI_CLAUDE_PATH
    } else {
        process.env.HAPI_CLAUDE_PATH = previousClaudePath
    }
    if (previousFakeLog === undefined) {
        delete process.env.HAQI_FAKE_CLAUDE_LOG
    } else {
        process.env.HAQI_FAKE_CLAUDE_LOG = previousFakeLog
    }
})

function writeFakeClaudeExecutable(dir: string): string {
    const fakeClaudePath = join(dir, 'fake-claude.mjs')
    writeFileSync(fakeClaudePath, `#!/usr/bin/env node
import { writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline'

const logPath = process.env.HAQI_FAKE_CLAUDE_LOG
const events = []
const controlResponses = []
const pendingResolvers = []

function record(entry) {
    events.push(entry)
    if (logPath) {
        writeFileSync(logPath, JSON.stringify(events, null, 2))
    }
}

function send(message) {
    record({ direction: 'stdout', message })
    process.stdout.write(JSON.stringify(message) + '\\n')
}

function waitForControlResponse() {
    const existing = controlResponses.shift()
    if (existing) {
        return Promise.resolve(existing)
    }
    return new Promise((resolve) => {
        pendingResolvers.push(resolve)
    })
}

const rl = createInterface({ input: process.stdin })
rl.on('line', (line) => {
    if (!line.trim()) return
    const message = JSON.parse(line)
    record({ direction: 'stdin', message })
    if (message.type === 'control_response') {
        const resolver = pendingResolvers.shift()
        if (resolver) {
            resolver(message)
        } else {
            controlResponses.push(message)
        }
    }
})

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function requestBash(toolId, command, requestId) {
    send({
        type: 'assistant',
        message: {
            role: 'assistant',
            content: [{
                type: 'tool_use',
                id: toolId,
                name: 'Bash',
                input: { command }
            }]
        }
    })
    await delay(50)
    send({
        type: 'control_request',
        request_id: requestId,
        request: {
            subtype: 'can_use_tool',
            tool_name: 'Bash',
            input: { command }
        }
    })
    const response = await waitForControlResponse()
    record({
        event: 'control_response_received',
        requestId,
        response: response.response.response
    })
}

await delay(10)
await requestBash('tool-1', 'echo first', 'request-1')
await delay(100)
await requestBash('tool-2', 'echo second', 'request-2')
send({ type: 'result', subtype: 'success', result: 'done' })
rl.close()
`, 'utf8')
    chmodSync(fakeClaudePath, 0o755)
    return fakeClaudePath
}

function createSessionHarness() {
    let state: AgentState = {}
    let permissionMode: PermissionMode | undefined = 'default'
    let permissionRpc: ((payload: PermissionRpcPayload) => Promise<void> | void) | null = null
    const permissionModeListeners = new Set<(mode: PermissionMode) => void>()
    let resolveFirstPermissionRequest: (() => void) | null = null
    const firstPermissionRequest = new Promise<void>((resolve) => {
        resolveFirstPermissionRequest = resolve
    })
    let unexpectedSecondPermissionRequest = false

    const session = {
        client: {
            rpcHandlerManager: {
                registerHandler: (method: string, handler: (payload: PermissionRpcPayload) => Promise<void> | void) => {
                    if (method === 'permission') {
                        permissionRpc = handler
                    }
                }
            },
            updateAgentState: (updater: (current: AgentState) => AgentState) => {
                state = updater(state)
                if (state.requests?.['tool-1']) {
                    resolveFirstPermissionRequest?.()
                    resolveFirstPermissionRequest = null
                }
                if (state.requests?.['tool-2']) {
                    unexpectedSecondPermissionRequest = true
                    setTimeout(() => {
                        void permissionRpc?.({ id: 'tool-2', approved: true })
                    }, 0)
                }
            }
        },
        queue: {
            unshift: () => undefined
        },
        setPermissionMode: (mode: PermissionMode) => {
            const previousMode = permissionMode
            permissionMode = mode
            if (previousMode === mode) {
                return
            }
            for (const listener of permissionModeListeners) {
                listener(mode)
            }
        },
        getPermissionMode: () => permissionMode,
        addPermissionModeChangeListener: (listener: (mode: PermissionMode) => void) => {
            permissionModeListeners.add(listener)
            return () => {
                permissionModeListeners.delete(listener)
            }
        }
    } as any

    return {
        session,
        firstPermissionRequest,
        setPermissionMode: session.setPermissionMode as (mode: PermissionMode) => void,
        approveFirstPermission: async () => {
            if (!permissionRpc) {
                throw new Error('Permission RPC handler is not registered')
            }
            await permissionRpc({ id: 'tool-1', approved: true })
        },
        getState: () => state,
        getUnexpectedSecondPermissionRequest: () => unexpectedSecondPermissionRequest
    }
}

describe('Claude remote permission mode changes', () => {
    it('applies session permission mode changes to later tool checks while the same turn is running', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'haqi-claude-live-permission-'))
        try {
            const fakeClaudePath = writeFakeClaudeExecutable(dir)
            const logPath = join(dir, 'fake-claude-log.json')
            process.env.HAPI_CLAUDE_PATH = fakeClaudePath
            process.env.HAQI_FAKE_CLAUDE_LOG = logPath

            const harness = createSessionHarness()
            const permissionHandler = new PermissionHandler(harness.session)
            let onReadyCount = 0
            let nextMessageUsed = false

            const remoteRun = claudeRemote({
                sessionId: null,
                path: dir,
                allowedTools: [],
                mcpServers: {},
                hookSettingsPath: join(dir, 'hook-settings.json'),
                canCallTool: permissionHandler.handleToolCall,
                isAborted: (toolCallId) => permissionHandler.isAborted(toolCallId),
                nextMessage: async () => {
                    if (nextMessageUsed) {
                        return null
                    }
                    nextMessageUsed = true
                    return {
                        message: 'Run two bash checks.',
                        mode: { permissionMode: 'default' }
                    }
                },
                onReady: () => {
                    onReadyCount += 1
                },
                onSessionFound: () => {},
                onMessage: (message) => {
                    permissionHandler.onMessage(message)
                }
            })

            await harness.firstPermissionRequest
            harness.setPermissionMode('bypassPermissions')
            await harness.approveFirstPermission()
            await remoteRun

            const state = harness.getState()
            expect(harness.getUnexpectedSecondPermissionRequest()).toBe(false)
            expect(state.completedRequests).toHaveProperty('tool-1')
            expect(state.completedRequests).not.toHaveProperty('tool-2')
            expect(onReadyCount).toBe(1)

            const log = JSON.parse(readFileSync(logPath, 'utf8')) as FakeClaudeLogEntry[]
            const responses = log.filter((entry) => entry.event === 'control_response_received')
            expect(responses).toHaveLength(2)
            expect(responses[1]?.response).toEqual({
                behavior: 'allow',
                updatedInput: { command: 'echo second' }
            })

            permissionHandler.dispose()
        } finally {
            rmSync(dir, { recursive: true, force: true })
        }
    }, 10_000)
})
