import type { MiddlewareHandler } from 'hono'
import { z } from 'zod'
import { jwtVerify } from 'jose'
import type { Store } from '../../store'
import { resolveCliAuthToken } from '../../cloud/resolveCliAuthToken'
import { getOrCreateOwnerId } from '../../config/ownerId'

export type WebAppEnv = {
    Variables: {
        userId: number
        namespace: string
    }
}

const jwtPayloadSchema = z.object({
    uid: z.number(),
    ns: z.string()
})

export function createAuthMiddleware(jwtSecret: Uint8Array, store: Store): MiddlewareHandler<WebAppEnv> {
    // ownerId is constant per process; resolve it once instead of on every
    // raw-token request.
    let cachedOwnerId: number | null = null
    const ownerIdPromise = getOrCreateOwnerId()
        .then((id) => { cachedOwnerId = id; return id })
        .catch(() => { cachedOwnerId = 0; return 0 })

    return async (c, next) => {
        const path = c.req.path
        if (path === '/api/auth' || path === '/api/bind') {
            await next()
            return
        }

        const authorization = c.req.header('authorization')
        const tokenFromHeader = authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : undefined
        const tokenFromQuery = path === '/api/events' ? c.req.query().token : undefined
        const token = tokenFromHeader ?? tokenFromQuery

        if (!token) {
            return c.json({ error: 'Missing authorization token' }, 401)
        }

        try {
            const verified = await jwtVerify(token, jwtSecret, { algorithms: ['HS256'] })
            const parsed = jwtPayloadSchema.safeParse(verified.payload)
            if (!parsed.success) {
                return c.json({ error: 'Invalid token payload' }, 401)
            }
            c.set('userId', parsed.data.uid)
            c.set('namespace', parsed.data.ns)
            await next()
            return
        } catch {
            // Not a JWT — fall through to raw-token validation. Workers/runners
            // hit internal endpoints (crash reports etc.) using the raw machine
            // token they hold for their socket; we never want them to mint a JWT.
        }

        const resolved = resolveCliAuthToken(store, token)
        if (!resolved) {
            return c.json({ error: 'Invalid token' }, 401)
        }
        c.set('userId', cachedOwnerId ?? await ownerIdPromise)
        c.set('namespace', resolved.namespace)
        await next()
        return
    }
}
