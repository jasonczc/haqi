import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ensureHubRunning, resolveHubPort, shutdownIfWeStartedIt } from './hubManager'

class FakeChild extends EventEmitter {
    stdout = new EventEmitter()
    stderr = new EventEmitter()
    exitCode: number | null = null
    signalCode: NodeJS.Signals | null = null
    killedSignals: string[] = []

    kill(signal?: NodeJS.Signals | number): boolean {
        this.killedSignals.push(String(signal ?? 'SIGTERM'))
        this.exitCode = 0
        this.emit('exit', 0, null)
        return true
    }
}

function okResponse(): Response {
    return new Response('{}', { status: 200 })
}

describe('hubManager', () => {
    afterEach(async () => {
        await shutdownIfWeStartedIt()
        vi.restoreAllMocks()
    })

    it('resolves port from env before settings file', () => {
        const home = mkdtempSync(join(tmpdir(), 'haqi-desktop-'))
        writeFileSync(join(home, 'settings.json'), JSON.stringify({ listenPort: 3010 }))
        expect(resolveHubPort({ env: { HAPI_LISTEN_PORT: '3020' } as NodeJS.ProcessEnv, homeDir: home })).toBe(3020)
        rmSync(home, { recursive: true, force: true })
    })

    it('adopts an already healthy hub', async () => {
        const spawnImpl = vi.fn()
        const port = await ensureHubRunning({
            env: {} as NodeJS.ProcessEnv,
            fetchImpl: vi.fn(async () => okResponse()),
            spawnImpl: spawnImpl as never
        })

        expect(port).toBe(3006)
        expect(spawnImpl).not.toHaveBeenCalled()
    })

    it('spawns the hub when health check initially fails', async () => {
        const child = new FakeChild()
        const fetchImpl = vi.fn()
            .mockRejectedValueOnce(new Error('not ready'))
            .mockResolvedValue(okResponse())
        const spawnImpl = vi.fn(() => child)
        const logDir = mkdtempSync(join(tmpdir(), 'haqi-desktop-logs-'))

        const port = await ensureHubRunning({
            env: {} as NodeJS.ProcessEnv,
            logDir,
            fetchImpl,
            spawnImpl: spawnImpl as never,
            resolveBinary: () => ({ kind: 'path', command: 'haqi', args: [] }),
            startupTimeoutMs: 100,
            pollIntervalMs: 1
        })

        expect(port).toBe(3006)
        expect(spawnImpl).toHaveBeenCalledWith('haqi', ['hub'], expect.objectContaining({
            windowsHide: true
        }))
        await shutdownIfWeStartedIt()
        expect(child.killedSignals).toContain('SIGTERM')
        rmSync(logDir, { recursive: true, force: true })
    })
})
