import { Hono } from 'hono'
import { z } from 'zod'

import type { Store } from '../../store'
import type { WebAppEnv } from '../middleware/auth'

const updateProjectOfflineSchema = z.object({
    directories: z.array(z.string()).max(500)
})

function normalizeDirectories(directories: string[]): string[] {
    const seen = new Set<string>()
    const normalized: string[] = []
    for (const directory of directories) {
        const trimmed = directory.trim()
        if (!trimmed || seen.has(trimmed)) {
            continue
        }
        seen.add(trimmed)
        normalized.push(trimmed)
    }
    return normalized
}

export function createSettingsRoutes(store: Store): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()

    app.get('/settings/project-offline', (c) => {
        try {
            const namespace = c.get('namespace')
            const userId = c.get('userId')
            const directories = store.projectPreferences.getProjectOfflineDirectories(namespace, userId)
            return c.json({ directories })
        } catch (error) {
            return c.json({
                error: error instanceof Error ? error.message : 'Failed to load project offline settings'
            }, 500)
        }
    })

    app.put('/settings/project-offline', async (c) => {
        const body = await c.req.json().catch(() => null)
        const parsed = updateProjectOfflineSchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        try {
            const namespace = c.get('namespace')
            const userId = c.get('userId')
            const directories = store.projectPreferences.replaceProjectOfflineDirectories(
                namespace,
                userId,
                normalizeDirectories(parsed.data.directories)
            )
            return c.json({ directories })
        } catch (error) {
            return c.json({
                error: error instanceof Error ? error.message : 'Failed to update project offline settings'
            }, 500)
        }
    })

    return app
}
