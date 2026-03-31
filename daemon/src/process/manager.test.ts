import { describe, it, expect, afterEach } from 'bun:test'
import { ProcessManager } from './manager'

describe('ProcessManager', () => {
    let pm: ProcessManager

    afterEach(() => {
        pm?.kill()
    })

    it('spawns a process and reports running', async () => {
        pm = new ProcessManager()
        const result = await pm.spawn({
            command: ['sh', '-c', 'sleep 10'],
            cwd: '/tmp'
        })
        expect(result.pid).toBeGreaterThan(0)
        expect(result.status).toBe('running')

        const status = pm.status()
        expect(status.running).toBe(true)
        expect(status.pid).toBe(result.pid)
    })

    it('reports exit when process finishes', async () => {
        pm = new ProcessManager()
        await pm.spawn({ command: ['sh', '-c', 'echo hello'], cwd: '/tmp' })

        const event = await new Promise<{ type: string; exitCode: number | null }>((resolve) => {
            pm.on('exit', (e) => resolve(e))
        })

        expect(event.type).toBe('exit')
        expect(event.exitCode).toBe(0)
        expect(pm.status().running).toBe(false)
    })

    it('kills a running process', async () => {
        pm = new ProcessManager()
        await pm.spawn({ command: ['sh', '-c', 'sleep 60'], cwd: '/tmp' })
        expect(pm.status().running).toBe(true)

        pm.kill()
        await new Promise(r => setTimeout(r, 500))
        expect(pm.status().running).toBe(false)
    })

    it('collects stdout output', async () => {
        pm = new ProcessManager()
        await pm.spawn({ command: ['sh', '-c', 'echo hello-world'], cwd: '/tmp' })

        const chunks: string[] = []
        pm.on('stdout', (data: string) => chunks.push(data))
        await new Promise(r => setTimeout(r, 500))

        expect(chunks.join('')).toContain('hello-world')
    })
})
