import { spawn, type ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import type { SpawnRequest, SpawnResponse, ProcessStatus, ProcessEvent } from '../types'

export class ProcessManager extends EventEmitter {
    private child: ChildProcess | null = null
    private startedAt: number | null = null
    private exitCode: number | null = null
    private exitSignal: string | null = null

    async spawn(request: SpawnRequest): Promise<SpawnResponse> {
        if (this.child && this.status().running) {
            return { pid: 0, status: 'failed', error: 'Process already running' }
        }

        const [cmd, ...args] = request.command
        this.child = spawn(cmd, args, {
            cwd: request.cwd,
            env: { ...process.env, ...(request.env ?? {}) },
            stdio: ['ignore', 'pipe', 'pipe']
        })

        this.startedAt = Date.now()
        this.exitCode = null
        this.exitSignal = null

        this.child.stdout?.on('data', (data: Buffer) => {
            this.emit('stdout', data.toString())
        })

        this.child.stderr?.on('data', (data: Buffer) => {
            this.emit('stderr', data.toString())
        })

        this.child.on('exit', (code, signal) => {
            this.exitCode = code
            this.exitSignal = signal?.toString() ?? null
            const event: ProcessEvent = {
                type: 'exit',
                pid: this.child?.pid ?? undefined,
                exitCode: code,
                signal: signal?.toString() ?? null,
                timestamp: Date.now()
            }
            this.emit('exit', event)
        })

        this.child.on('error', (err) => {
            const event: ProcessEvent = {
                type: 'error',
                error: err.message,
                timestamp: Date.now()
            }
            this.emit('error', event)
        })

        if (!this.child.pid) {
            return { pid: 0, status: 'failed', error: 'Failed to spawn -- no PID' }
        }

        this.emit('spawn', {
            type: 'spawn',
            pid: this.child.pid,
            timestamp: Date.now()
        } satisfies ProcessEvent)

        return { pid: this.child.pid, status: 'running' }
    }

    status(): ProcessStatus {
        const running = this.child !== null && this.child.exitCode === null && !this.child.killed
        return {
            pid: this.child?.pid ?? null,
            running,
            exitCode: this.exitCode,
            signal: this.exitSignal,
            uptimeMs: running && this.startedAt ? Date.now() - this.startedAt : null
        }
    }

    kill(signal: NodeJS.Signals = 'SIGTERM'): void {
        if (this.child && !this.child.killed) {
            this.child.kill(signal)
        }
    }
}
