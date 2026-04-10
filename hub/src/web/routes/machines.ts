import { Hono } from 'hono'
import { z } from 'zod'
import {
    CodexCredentialActivateRequestSchema,
    CodexCredentialImportRequestSchema,
    MachineSpawnRequestSchema,
    CodexCredentialSaveCurrentRequestSchema
} from '@hapi/protocol/schemas'
import type { SyncEngine } from '../../sync/syncEngine'
import type { WebAppEnv } from '../middleware/auth'
import { requireMachine } from './guards'

const pathsExistsSchema = z.object({
    paths: z.array(z.string().min(1)).max(1000)
})

function normalizePreviewUrl(raw: string | undefined): { ok: true; value?: string } | { ok: false; error: string } {
    if (raw === undefined) {
        return { ok: true }
    }

    const trimmed = raw.trim()
    if (!trimmed) {
        return { ok: true, value: undefined }
    }

    try {
        const url = new URL(trimmed)
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
            return { ok: false, error: 'Preview URL must use http:// or https://' }
        }
        return { ok: true, value: url.toString() }
    } catch {
        return { ok: false, error: 'Invalid preview URL' }
    }
}

export function createMachinesRoutes(getSyncEngine: () => SyncEngine | null): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()

    app.get('/machines', (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not connected' }, 503)
        }

        const namespace = c.get('namespace')
        const machines = engine.getOnlineMachinesByNamespace(namespace)
        return c.json({ machines })
    })

    app.get('/machines/cloud/environments', (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not connected' }, 503)
        }

        return c.json({
            environments: engine.listCloudEnvironments()
        })
    })

    app.get('/machines/cloud/previews', (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not connected' }, 503)
        }

        return c.json({
            previews: engine.listCloudPreviews()
        })
    })

    app.post('/machines/:id/spawn', async (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not connected' }, 503)
        }

        const namespace = c.get('namespace')
        const machineId = c.req.param('id')
        if (machineId !== 'auto') {
            const machine = requireMachine(c, engine, machineId)
            if (machine instanceof Response) {
                return machine
            }
        }

        const body = await c.req.json().catch(() => null)
        const parsed = MachineSpawnRequestSchema.safeParse(body)
        if (!parsed.success) {
            const issues = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')
            return c.json({ error: `Invalid body: ${issues}` }, 400)
        }

        const previewUrl = normalizePreviewUrl(parsed.data.previewUrl)
        if (!previewUrl.ok) {
            return c.json({ error: previewUrl.error }, 400)
        }

        if (parsed.data.agent === 'claude' && parsed.data.thinkEffort === 'xhigh') {
            return c.json({ error: 'Claude thinkEffort does not support xhigh (expected low/medium/high)' }, 400)
        }

        if (parsed.data.executionBackend === 'cloud-self-hosted' || parsed.data.executionBackend === 'cloud-managed') {
            if (parsed.data.directory?.trim()) {
                return c.json({ error: 'Cloud sessions do not accept directory; use workspaceSource.repository' }, 400)
            }
            // Setup sessions and host-process/daemon-session runtime can run without a checkpoint and without a repo
            const needsDockerImage = parsed.data.runtimeKind !== 'host-process' && parsed.data.runtimeKind !== 'daemon-session'
            if (parsed.data.sessionType !== 'setup' && needsDockerImage) {
                if (!parsed.data.checkpointId?.trim() && !parsed.data.workspaceSource?.repository) {
                    return c.json({ error: 'Cloud docker sessions require checkpointId or workspaceSource.repository' }, 400)
                }
            }
        }

        if (machineId === 'auto') {
            if (parsed.data.executionBackend !== 'cloud-self-hosted' && parsed.data.executionBackend !== 'cloud-managed') {
                return c.json({ error: 'Auto machine selection requires a cloud execution backend' }, 400)
            }
            const result = await engine.spawnSessionOnAutoCloudWorker(namespace, parsed.data)
            return c.json(result)
        }

        const result = await engine.spawnSession(machineId, parsed.data)
        return c.json(result)
    })

    app.post('/machines/:id/paths/exists', async (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not connected' }, 503)
        }

        const machineId = c.req.param('id')
        const machine = requireMachine(c, engine, machineId)
        if (machine instanceof Response) {
            return machine
        }

        const body = await c.req.json().catch(() => null)
        const parsed = pathsExistsSchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        const uniquePaths = Array.from(new Set(parsed.data.paths.map((path: string) => path.trim()).filter(Boolean)))
        if (uniquePaths.length === 0) {
            return c.json({ exists: {} })
        }

        try {
            const exists = await engine.checkPathsExist(machineId, uniquePaths)
            return c.json({ exists })
        } catch (error) {
            return c.json({ error: error instanceof Error ? error.message : 'Failed to check paths' }, 500)
        }
    })

    app.get('/machines/:id/codex-credentials', async (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not connected' }, 503)
        }

        const machineId = c.req.param('id')
        const machine = requireMachine(c, engine, machineId)
        if (machine instanceof Response) {
            return machine
        }

        try {
            return c.json(await engine.getMachineCodexCredentials(machineId))
        } catch (error) {
            return c.json({ error: error instanceof Error ? error.message : 'Failed to load Codex credentials' }, 500)
        }
    })

    app.get('/machines/:id/codex-credentials/export', async (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not connected' }, 503)
        }

        const machineId = c.req.param('id')
        const machine = requireMachine(c, engine, machineId)
        if (machine instanceof Response) {
            return machine
        }

        try {
            return c.json(await engine.exportMachineCodexCredentials(machineId))
        } catch (error) {
            return c.json({ error: error instanceof Error ? error.message : 'Failed to export Codex credentials' }, 500)
        }
    })

    app.post('/machines/:id/codex-credentials/import', async (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not connected' }, 503)
        }

        const machineId = c.req.param('id')
        const machine = requireMachine(c, engine, machineId)
        if (machine instanceof Response) {
            return machine
        }

        const body = await c.req.json().catch(() => null)
        const parsed = CodexCredentialImportRequestSchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        try {
            return c.json(await engine.importMachineCodexCredentials(machineId, parsed.data))
        } catch (error) {
            return c.json({ error: error instanceof Error ? error.message : 'Failed to import Codex credentials' }, 500)
        }
    })

    app.post('/machines/:id/codex-credentials/save-current', async (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not connected' }, 503)
        }

        const machineId = c.req.param('id')
        const machine = requireMachine(c, engine, machineId)
        if (machine instanceof Response) {
            return machine
        }

        const body = await c.req.json().catch(() => ({}))
        const parsed = CodexCredentialSaveCurrentRequestSchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        try {
            return c.json(await engine.saveCurrentMachineCodexCredentials(machineId, parsed.data))
        } catch (error) {
            return c.json({ error: error instanceof Error ? error.message : 'Failed to save current Codex credentials' }, 500)
        }
    })

    app.post('/machines/:id/codex-credentials/activate', async (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not connected' }, 503)
        }

        const machineId = c.req.param('id')
        const machine = requireMachine(c, engine, machineId)
        if (machine instanceof Response) {
            return machine
        }

        const body = await c.req.json().catch(() => null)
        const parsed = CodexCredentialActivateRequestSchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        try {
            return c.json(await engine.activateMachineCodexCredential(machineId, parsed.data.profileId))
        } catch (error) {
            return c.json({ error: error instanceof Error ? error.message : 'Failed to activate Codex credentials' }, 500)
        }
    })

    app.delete('/machines/:id/codex-credentials/:profileId', async (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not connected' }, 503)
        }

        const machineId = c.req.param('id')
        const machine = requireMachine(c, engine, machineId)
        if (machine instanceof Response) {
            return machine
        }

        const profileId = c.req.param('profileId')
        if (!profileId) {
            return c.json({ error: 'profileId is required' }, 400)
        }

        try {
            return c.json(await engine.deleteMachineCodexCredential(machineId, profileId))
        } catch (error) {
            return c.json({ error: error instanceof Error ? error.message : 'Failed to delete Codex credentials' }, 500)
        }
    })

    return app
}
