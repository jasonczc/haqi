import { Hono } from 'hono'
import { z } from 'zod'
import { configuration } from '../../configuration'
import { readSettingsOrThrow, writeSettings } from '../../config/settings'

import type { Store } from '../../store'
import type { WebAppEnv } from '../middleware/auth'

const updateProjectOfflineSchema = z.object({
    directories: z.array(z.string()).max(500)
})

const updateNgrokProviderSchema = z.object({
    enabled: z.boolean().optional(),
    managed: z.boolean().optional(),
    authToken: z.string().nullable().optional(),
    region: z.string().nullable().optional(),
    apiBaseUrl: z.string().nullable().optional()
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

    app.get('/settings/providers', async (c) => {
        try {
            const settings = await readSettingsOrThrow(configuration.settingsFile)
            const ngrok = settings.providers?.ngrok
            return c.json({
                providers: [
                    {
                        provider: 'ngrok',
                        enabled: ngrok?.enabled ?? true,
                        managed: ngrok?.managed ?? true,
                        configured: Boolean(ngrok?.authToken),
                        hasAuthToken: Boolean(ngrok?.authToken),
                        ...(ngrok?.authToken ? { authTokenLastFour: ngrok.authToken.slice(-4) } : {}),
                        ...(ngrok?.region ? { region: ngrok.region } : {}),
                        ...(ngrok?.apiBaseUrl ? { apiBaseUrl: ngrok.apiBaseUrl } : {})
                    }
                ]
            })
        } catch (error) {
            return c.json({
                error: error instanceof Error ? error.message : 'Failed to load provider settings'
            }, 500)
        }
    })

    app.put('/settings/providers/ngrok', async (c) => {
        const body = await c.req.json().catch(() => null)
        const parsed = updateNgrokProviderSchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        try {
            const settings = await readSettingsOrThrow(configuration.settingsFile)
            const current = settings.providers?.ngrok ?? {}
            settings.providers = settings.providers ?? {}
            settings.providers.ngrok = {
                ...current,
                ...(parsed.data.enabled !== undefined ? { enabled: parsed.data.enabled } : {}),
                ...(parsed.data.managed !== undefined ? { managed: parsed.data.managed } : {}),
                ...(parsed.data.authToken !== undefined
                    ? (parsed.data.authToken ? { authToken: parsed.data.authToken.trim() } : { authToken: undefined })
                    : {}),
                ...(parsed.data.region !== undefined
                    ? (parsed.data.region ? { region: parsed.data.region.trim() } : { region: undefined })
                    : {}),
                ...(parsed.data.apiBaseUrl !== undefined
                    ? (parsed.data.apiBaseUrl ? { apiBaseUrl: parsed.data.apiBaseUrl.trim() } : { apiBaseUrl: undefined })
                    : {})
            }
            await writeSettings(configuration.settingsFile, settings)

            const ngrok = settings.providers.ngrok
            return c.json({
                provider: {
                    provider: 'ngrok',
                    enabled: ngrok?.enabled ?? true,
                    managed: ngrok?.managed ?? true,
                    configured: Boolean(ngrok?.authToken),
                    hasAuthToken: Boolean(ngrok?.authToken),
                    ...(ngrok?.authToken ? { authTokenLastFour: ngrok.authToken.slice(-4) } : {}),
                    ...(ngrok?.region ? { region: ngrok.region } : {}),
                    ...(ngrok?.apiBaseUrl ? { apiBaseUrl: ngrok.apiBaseUrl } : {})
                }
            })
        } catch (error) {
            return c.json({
                error: error instanceof Error ? error.message : 'Failed to update provider settings'
            }, 500)
        }
    })

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
