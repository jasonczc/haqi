/**
 * HTTP routes for the Routines subsystem.
 *
 * Two route factories:
 *
 *   createRoutineFireRoutes(deps)   → mount BEFORE the user auth
 *                                     middleware. Validates the fire
 *                                     token and calls FirePipeline.
 *
 *   createRoutineAdminRoutes(deps)  → mount AFTER the user auth
 *                                     middleware. CRUD over routines +
 *                                     tokens + run history.
 *
 * Paths under /api:
 *   POST   /routines/:routineId/fire         (fire trigger, token-auth)
 *   GET    /routines                         (list in namespace)
 *   POST   /routines                         (create)
 *   GET    /routines/:routineId              (get)
 *   PATCH  /routines/:routineId              (update)
 *   DELETE /routines/:routineId              (delete)
 *   GET    /routines/:routineId/runs
 *   GET    /routines/:routineId/events
 *   POST   /routines/:routineId/tokens       (mint fire token, returns secret once)
 *   GET    /routines/:routineId/tokens
 *   POST   /routines/:routineId/tokens/:tokenId/revoke
 */

import { Hono, type Context } from 'hono'
import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import type {
    FilterExpression,
    RoutineSpawnOverrides,
    TriggerConfig,
    TriggerKind,
    Routine,
    ConcurrencyPolicy
} from '@hapi/protocol/schemas'
import {
    FilterExpressionSchema,
    RoutineSpawnOverridesSchema,
    TriggerConfigSchema,
    ConcurrencyPolicySchema,
    RoutineStatusSchema
} from '@hapi/protocol/schemas'
import type { Store } from '../../store'
import type { WebAppEnv } from '../middleware/auth'
import type { FirePipelineSubmit } from '../../routines/triggerRegistry'
import { issueFireToken, verifyFireToken } from '../../routines'

// ── Schemas ──────────────────────────────────────────────────────────

const createRoutineBodySchema = z.object({
    name: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    trigger: TriggerConfigSchema,
    filter: FilterExpressionSchema.optional(),
    spawn: RoutineSpawnOverridesSchema,
    concurrency: ConcurrencyPolicySchema.optional()
})

const updateRoutineBodySchema = z.object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
    status: RoutineStatusSchema.optional(),
    trigger: TriggerConfigSchema.optional(),
    filter: FilterExpressionSchema.nullable().optional(),
    spawn: RoutineSpawnOverridesSchema.optional(),
    concurrency: ConcurrencyPolicySchema.optional()
})

const issueTokenBodySchema = z.object({
    name: z.string().max(200).optional(),
    expiresInDays: z.number().int().positive().max(365 * 5).optional()
})

const fireBodySchema = z.object({
    text: z.string().max(4000).optional(),
    payload: z.unknown().optional(),
    dedupKey: z.string().min(1).max(200).optional()
})

// ── Admin (user-authed) ──────────────────────────────────────────────

export function createRoutineAdminRoutes(deps: {
    getStore: () => Store
}): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()

    app.get('/routines', (c) => {
        const namespace = c.get('namespace')
        const routines = deps.getStore().routines.listRoutines(namespace)
        return c.json({ ok: true, routines })
    })

    app.post('/routines', async (c) => {
        const namespace = c.get('namespace')
        const userId = c.get('userId')
        const parsed = createRoutineBodySchema.safeParse(await c.req.json().catch(() => null))
        if (!parsed.success) {
            return c.json({ ok: false, error: 'invalid_body', issues: parsed.error.issues }, 400)
        }
        const body = parsed.data
        const id = randomUUID()
        const routine = deps.getStore().routines.createRoutine({
            id,
            namespace,
            name: body.name,
            description: body.description,
            trigger: body.trigger,
            filter: body.filter,
            spawn: body.spawn,
            concurrency: body.concurrency ?? 'skip',
            createdBy: String(userId)
        })
        return c.json({ ok: true, routine })
    })

    app.get('/routines/:routineId', (c) => {
        const namespace = c.get('namespace')
        const routine = deps.getStore().routines.getRoutine(c.req.param('routineId'), namespace)
        if (!routine) return c.json({ ok: false, error: 'not_found' }, 404)
        return c.json({ ok: true, routine })
    })

    app.patch('/routines/:routineId', async (c) => {
        const namespace = c.get('namespace')
        const parsed = updateRoutineBodySchema.safeParse(await c.req.json().catch(() => null))
        if (!parsed.success) {
            return c.json({ ok: false, error: 'invalid_body', issues: parsed.error.issues }, 400)
        }
        const updated = deps.getStore().routines.updateRoutine(c.req.param('routineId'), namespace, {
            name: parsed.data.name,
            description: parsed.data.description === null ? null : parsed.data.description,
            status: parsed.data.status,
            trigger: parsed.data.trigger,
            filter: parsed.data.filter === null ? null : parsed.data.filter,
            spawn: parsed.data.spawn,
            concurrency: parsed.data.concurrency
        })
        if (!updated) return c.json({ ok: false, error: 'not_found' }, 404)
        return c.json({ ok: true, routine: updated })
    })

    app.delete('/routines/:routineId', (c) => {
        const namespace = c.get('namespace')
        const removed = deps.getStore().routines.deleteRoutine(c.req.param('routineId'), namespace)
        if (!removed) return c.json({ ok: false, error: 'not_found' }, 404)
        return c.json({ ok: true })
    })

    // 404 shortcut: if the routine doesn't exist in this namespace,
    // bail out before the sub-collection query — silent-empty responses
    // were hiding typos and wrong-namespace access.
    const ensureRoutine = (c: Context<WebAppEnv>): { namespace: string; routineId: string; routine: Routine } | null => {
        const namespace = c.get('namespace')
        const routineId = c.req.param('routineId')
        if (!routineId) return null
        const routine = deps.getStore().routines.getRoutine(routineId, namespace)
        if (!routine) return null
        return { namespace, routineId, routine }
    }

    app.get('/routines/:routineId/runs', (c) => {
        const scope = ensureRoutine(c)
        if (!scope) return c.json({ ok: false, error: 'not_found' }, 404)
        const limitQ = c.req.query('limit')
        const limit = limitQ ? Math.max(1, Math.min(500, Number(limitQ) || 100)) : 100
        const runs = deps.getStore().routines.listRuns(scope.routineId, scope.namespace, limit)
        return c.json({ ok: true, runs })
    })

    // Hydrated run detail: returns run + fire + full event timeline for
    // this run in one round-trip, so the visualization can render the
    // state graph + activity timeline without three sequential queries.
    app.get('/routines/:routineId/runs/:runId', (c) => {
        const scope = ensureRoutine(c)
        if (!scope) return c.json({ ok: false, error: 'not_found' }, 404)
        const runId = c.req.param('runId')
        const run = deps.getStore().routines.getRun(runId, scope.namespace)
        if (!run || run.routineId !== scope.routineId) {
            return c.json({ ok: false, error: 'not_found' }, 404)
        }
        const fires = deps.getStore().routines.listFires(scope.routineId, scope.namespace, 1000)
        const fire = fires.find((f) => f.id === run.fireId) ?? null
        const events = deps.getStore().routines.listEventsForRun(runId, scope.namespace)
        return c.json({ ok: true, run, fire, events })
    })

    app.get('/routines/:routineId/events', (c) => {
        const scope = ensureRoutine(c)
        if (!scope) return c.json({ ok: false, error: 'not_found' }, 404)
        const limitQ = c.req.query('limit')
        const limit = limitQ ? Math.max(1, Math.min(1000, Number(limitQ) || 200)) : 200
        const events = deps.getStore().routines.listEvents(scope.routineId, scope.namespace, limit)
        return c.json({ ok: true, events })
    })

    app.get('/routines/:routineId/tokens', (c) => {
        const scope = ensureRoutine(c)
        if (!scope) return c.json({ ok: false, error: 'not_found' }, 404)
        const tokens = deps.getStore().routines.listFireTokens(scope.routineId, scope.namespace)
        return c.json({ ok: true, tokens })
    })

    app.post('/routines/:routineId/tokens', async (c) => {
        const namespace = c.get('namespace')
        const userId = c.get('userId')
        const routineId = c.req.param('routineId')
        const parsed = issueTokenBodySchema.safeParse(await c.req.json().catch(() => ({})))
        if (!parsed.success) {
            return c.json({ ok: false, error: 'invalid_body', issues: parsed.error.issues }, 400)
        }
        // Ownership check: routine must live in caller's namespace.
        const routine = deps.getStore().routines.getRoutine(routineId, namespace)
        if (!routine) return c.json({ ok: false, error: 'not_found' }, 404)

        const expiresAt = parsed.data.expiresInDays
            ? Date.now() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000
            : undefined
        const issued = issueFireToken(deps.getStore(), {
            id: randomUUID(),
            namespace,
            routineId,
            name: parsed.data.name,
            createdBy: String(userId),
            expiresAt
        })
        return c.json({ ok: true, token: issued.record, secret: issued.secret })
    })

    app.post('/routines/:routineId/tokens/:tokenId/revoke', (c) => {
        const namespace = c.get('namespace')
        const routineId = c.req.param('routineId')
        const tokenId = c.req.param('tokenId')
        // Authorization: the token must belong to the routine named in
        // the URL, not just to the caller's namespace. Without this
        // check, knowing any tokenId in your namespace would let you
        // revoke it via any routine URL — a lie the API should not tell.
        const tokens = deps.getStore().routines.listFireTokens(routineId, namespace)
        const owned = tokens.find((t) => t.id === tokenId)
        if (!owned) return c.json({ ok: false, error: 'not_found' }, 404)
        const removed = deps.getStore().routines.revokeFireToken(tokenId, namespace)
        if (!removed) return c.json({ ok: false, error: 'already_revoked' }, 409)
        return c.json({ ok: true })
    })

    return app
}

// ── Fire (token-authed, mounted BEFORE user auth mw) ────────────────

export function createRoutineFireRoutes(deps: {
    getStore: () => Store
    getFirePipeline: () => FirePipelineSubmit | null
}): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()

    app.post('/routines/:routineId/fire', async (c) => {
        const store = deps.getStore()
        const routineId = c.req.param('routineId')
        const presentedToken = extractBearer(c.req.header('authorization'))
        if (!presentedToken) {
            return c.json({ ok: false, error: 'missing_bearer_token' }, 401)
        }
        const verification = verifyFireToken(store, { routineId, presentedToken })
        if (!verification.ok) {
            return c.json({ ok: false, error: `token_${verification.reason}` }, 401)
        }
        const routine = store.routines.getRoutine(routineId, verification.token.namespace)
        if (!routine) return c.json({ ok: false, error: 'routine_not_found' }, 404)

        const bodyRaw = await c.req.json().catch(() => ({}))
        const parsed = fireBodySchema.safeParse(bodyRaw)
        if (!parsed.success) {
            return c.json({ ok: false, error: 'invalid_body', issues: parsed.error.issues }, 400)
        }

        const pipeline = deps.getFirePipeline()
        if (!pipeline) return c.json({ ok: false, error: 'pipeline_unavailable' }, 503)

        const result = await pipeline.submit({
            namespace: verification.token.namespace,
            routineId,
            triggerKind: 'api',
            actor: { type: 'api', tokenId: verification.token.id },
            dedupKey: parsed.data.dedupKey,
            payload: parsed.data.payload,
            textContext: parsed.data.text
        })
        switch (result.kind) {
            case 'accepted':
                return c.json({ ok: true, run: result.run, fire: result.fire })
            case 'skipped':
                return c.json({ ok: true, skipped: true, reason: result.reason, run: result.run, fire: result.fire })
            case 'duplicate':
                return c.json({ ok: false, error: 'duplicate_fire', dedupKey: result.dedupKey }, 409)
            case 'routine-not-found':
                return c.json({ ok: false, error: 'routine_not_found' }, 404)
            case 'routine-inactive':
                return c.json({ ok: false, error: 'routine_inactive', status: result.status }, 409)
            default: {
                const _exhaustive: never = result
                return c.json({ ok: false, error: 'unknown_result' }, 500)
            }
        }
    })

    return app
}

function extractBearer(header: string | undefined): string | null {
    if (!header) return null
    const [scheme, token] = header.trim().split(/\s+/)
    if (!token) return null
    if (scheme.toLowerCase() !== 'bearer') return null
    return token
}

// Re-export for wiring in server.ts.
export type { Routine, TriggerConfig, TriggerKind, FilterExpression, RoutineSpawnOverrides, ConcurrencyPolicy }
