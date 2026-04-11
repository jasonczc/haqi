import { Hono } from 'hono'
import { z } from 'zod'
import type { SyncEngine } from '../../sync/syncEngine'
import type { WebAppEnv } from '../middleware/auth'

const containerActionSchema = z.object({
    containerId: z.string().min(1)
})

export function createContainerRoutes(getSyncEngine: () => SyncEngine | null): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()

    // List containers across all online workers
    app.get('/cloud/containers', async (c) => {
        const engine = getSyncEngine()
        if (!engine) return c.json({ error: 'Not connected' }, 503)
        const namespace = c.get('namespace')

        const machines = engine.getOnlineMachinesByNamespace(namespace)
        const cloudMachines = machines.filter(m =>
            m.metadata?.executorType === 'cloud-self-hosted' || m.metadata?.executorType === 'cloud-managed'
        )

        const allContainers: Array<{ machineId: string; containers: unknown }> = []
        for (const machine of cloudMachines) {
            try {
                const containers = await engine.rpcContainerList(machine.id)
                allContainers.push({ machineId: machine.id, containers })
            } catch {
                allContainers.push({ machineId: machine.id, containers: [] })
            }
        }

        return c.json({ machines: allContainers })
    })

    // Stop session in container
    app.post('/machines/:machineId/containers/stop-session', async (c) => {
        const engine = getSyncEngine()
        if (!engine) return c.json({ error: 'Not connected' }, 503)
        const body = await c.req.json().catch(() => null)
        const parsed = containerActionSchema.safeParse(body)
        if (!parsed.success) return c.json({ error: 'Invalid body' }, 400)
        try {
            await engine.rpcContainerStopSession(c.req.param('machineId'), parsed.data.containerId)
            return c.json({ ok: true })
        } catch (err) {
            return c.json({ error: err instanceof Error ? err.message : 'Failed' }, 500)
        }
    })

    // Stop container
    app.post('/machines/:machineId/containers/stop', async (c) => {
        const engine = getSyncEngine()
        if (!engine) return c.json({ error: 'Not connected' }, 503)
        const body = await c.req.json().catch(() => null)
        const parsed = containerActionSchema.safeParse(body)
        if (!parsed.success) return c.json({ error: 'Invalid body' }, 400)
        try {
            await engine.rpcContainerStop(c.req.param('machineId'), parsed.data.containerId)
            return c.json({ ok: true })
        } catch (err) {
            return c.json({ error: err instanceof Error ? err.message : 'Failed' }, 500)
        }
    })

    // Remove container
    app.delete('/machines/:machineId/containers/:containerId', async (c) => {
        const engine = getSyncEngine()
        if (!engine) return c.json({ error: 'Not connected' }, 503)
        try {
            await engine.rpcContainerRemove(c.req.param('machineId'), c.req.param('containerId'))
            return c.json({ ok: true })
        } catch (err) {
            return c.json({ error: err instanceof Error ? err.message : 'Failed' }, 500)
        }
    })

    // Reclaim docker disk space on a worker: removes orphan haqi-checkpoint images
    // (anything NOT referenced in the hub's checkpoint DB), plus optionally prunes
    // build cache and unused volumes. Returns per-category byte counts.
    app.post('/machines/:machineId/docker/cleanup', async (c) => {
        const engine = getSyncEngine()
        if (!engine) return c.json({ error: 'Not connected' }, 503)
        const namespace = c.get('namespace')
        const body = await c.req.json().catch(() => ({})) as {
            pruneBuildCache?: unknown
            pruneVolumes?: unknown
        }
        try {
            const result = await engine.rpcDockerCleanup(
                c.req.param('machineId'),
                namespace,
                {
                    pruneBuildCache: body.pruneBuildCache === true,
                    pruneVolumes: body.pruneVolumes === true
                }
            )
            return c.json(result)
        } catch (err) {
            return c.json({ error: err instanceof Error ? err.message : 'Docker cleanup failed' }, 500)
        }
    })

    return app
}
