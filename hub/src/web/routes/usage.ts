import { Hono } from 'hono'
import type { WebAppEnv } from '../middleware/auth'
import { scanUsageOverview, type UsageOverview } from '../../usage/usageScanner'
import { withUsageCostEstimate } from '../../usage/usageCostEstimate'

const CACHE_TTL_MS = 60_000

let cachedOverview: { value: UsageOverview; expiresAt: number } | null = null
let inFlightOverview: Promise<UsageOverview> | null = null

async function getUsageOverview(forceRefresh: boolean): Promise<UsageOverview> {
    const now = Date.now()
    if (!forceRefresh && cachedOverview && cachedOverview.expiresAt > now) {
        return cachedOverview.value
    }

    if (inFlightOverview) {
        return await inFlightOverview
    }

    inFlightOverview = scanUsageOverview()
    try {
        const value = await inFlightOverview
        cachedOverview = {
            value,
            expiresAt: Date.now() + CACHE_TTL_MS
        }
        return value
    } finally {
        inFlightOverview = null
    }
}

function parseForceRefresh(raw: string | undefined): boolean {
    if (!raw) return false
    const normalized = raw.trim().toLowerCase()
    return normalized === '1'
        || normalized === 'true'
        || normalized === 'yes'
}

export function createUsageRoutes(): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()

    app.get('/usage/overview', async (c) => {
        const forceRefresh = parseForceRefresh(c.req.query('refresh'))

        try {
            const overview = await getUsageOverview(forceRefresh)
            const overviewWithEstimate = await withUsageCostEstimate(overview)
            return c.json({
                success: true,
                overview: overviewWithEstimate
            })
        } catch (error) {
            return c.json({
                success: false,
                error: error instanceof Error ? error.message : 'Failed to compute usage overview'
            }, 500)
        }
    })

    return app
}
