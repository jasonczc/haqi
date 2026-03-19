import { Hono, type Context } from 'hono'
import { z } from 'zod'
import type { SyncEngine } from '../../sync/syncEngine'
import type { WebAppEnv } from '../middleware/auth'
import { requireSyncEngine } from './guards'

const createLoopSchema = z.object({
    workerSessionId: z.string().min(1).max(255),
    reviewerSessionId: z.string().min(1).max(255),
    requirement: z.string().min(1).max(50000),
    acceptanceCriteria: z.string().min(1).max(50000),
    maxRounds: z.number().int().min(1).max(100).optional(),
    userPreference: z.enum(['auto', 'verbose', 'silent']).optional()
})

const updateLoopSchema = z.object({
    userPreference: z.enum(['auto', 'verbose', 'silent']).optional(),
    maxRounds: z.number().int().min(1).max(100).optional()
})

const startRoundSchema = z.object({
    instruction: z.string().min(1).max(50000)
})

const submitWorkerOutputSchema = z.object({
    workerOutput: z.object({
        rawResponse: z.string(),
        summary: z.string().optional(),
        diff: z.string(),
        filesChanged: z.array(z.string()),
        commands: z.array(z.object({
            command: z.string(),
            exitCode: z.number(),
            stdout: z.string(),
            stderr: z.string()
        })),
        exitStatus: z.enum(['success', 'error'])
    })
})

const submitVerdictSchema = z.object({
    verdict: z.object({
        action: z.enum(['continue', 'pass', 'abort', 'notify_user']),
        feedback: z.string(),
        userMessage: z.string().optional(),
        progress: z.number().min(0).max(100),
        criteriaStatus: z.array(z.object({
            criteria: z.string(),
            status: z.enum(['met', 'not_met', 'unclear']),
            note: z.string().optional()
        }))
    })
})

const userContinueSchema = z.object({
    userPreference: z.enum(['auto', 'verbose', 'silent']).optional(),
    additionalInstruction: z.string().max(50000).optional()
})

function toErrorResponse(c: Context<WebAppEnv>, error: unknown): Response {
    const message = error instanceof Error ? error.message : 'Unknown error'
    if (message.toLowerCase().includes('not found')) {
        return c.json({ error: message }, 404)
    }
    if (message.toLowerCase().includes('terminal status')) {
        return c.json({ error: message }, 409)
    }
    if (message.toLowerCase().includes('not waiting')) {
        return c.json({ error: message }, 409)
    }
    if (message.toLowerCase().includes('cannot pause')) {
        return c.json({ error: message }, 409)
    }
    if (message.toLowerCase().includes('max rounds')) {
        return c.json({ error: message }, 409)
    }
    return c.json({ error: message }, 400)
}

export function createReviewLoopsRoutes(getSyncEngine: () => SyncEngine | null): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()

    // List all review loops
    app.get('/review-loops', (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) return engine

        const namespace = c.get('namespace')
        const loops = engine.getReviewLoopsByNamespace(namespace)
        return c.json({ loops })
    })

    // Create a review loop
    app.post('/review-loops', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) return engine

        const body = await c.req.json().catch(() => null)
        const parsed = createLoopSchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body', details: parsed.error.issues }, 400)
        }

        const namespace = c.get('namespace')
        try {
            const result = engine.createReviewLoop({
                namespace,
                ...parsed.data
            })
            return c.json({ loop: result.loop, rounds: result.rounds }, 201)
        } catch (error) {
            return toErrorResponse(c, error)
        }
    })

    // Initiate (kick off) a review loop
    app.post('/review-loops/:id/initiate', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) return engine

        const namespace = c.get('namespace')
        try {
            const round = await engine.initiateReviewLoop(c.req.param('id'), namespace)
            return c.json({ round }, 201)
        } catch (error) {
            return toErrorResponse(c, error)
        }
    })

    // Get a review loop with rounds
    app.get('/review-loops/:id', (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) return engine

        const namespace = c.get('namespace')
        const result = engine.getReviewLoopByNamespace(c.req.param('id'), namespace)
        if (!result) {
            return c.json({ error: 'Review loop not found' }, 404)
        }
        return c.json({ loop: result.loop, rounds: result.rounds })
    })

    // Update loop settings (userPreference, maxRounds)
    app.patch('/review-loops/:id', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) return engine

        const body = await c.req.json().catch(() => null)
        const parsed = updateLoopSchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        const namespace = c.get('namespace')
        const loopId = c.req.param('id')
        try {
            if (parsed.data.userPreference) {
                engine.updateReviewLoopPreference(loopId, namespace, parsed.data.userPreference)
            }
            if (parsed.data.maxRounds) {
                engine.updateReviewLoopMaxRounds(loopId, namespace, parsed.data.maxRounds)
            }
            const result = engine.getReviewLoopByNamespace(loopId, namespace)
            if (!result) {
                return c.json({ error: 'Review loop not found' }, 404)
            }
            return c.json({ loop: result.loop })
        } catch (error) {
            return toErrorResponse(c, error)
        }
    })

    // Delete a review loop
    app.delete('/review-loops/:id', (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) return engine

        const namespace = c.get('namespace')
        try {
            engine.deleteReviewLoop(c.req.param('id'), namespace)
            return c.json({ success: true })
        } catch (error) {
            return toErrorResponse(c, error)
        }
    })

    // Pause a review loop (user intervention during executing/reviewing)
    app.post('/review-loops/:id/pause', (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) return engine

        const namespace = c.get('namespace')
        try {
            const loop = engine.pauseReviewLoop(c.req.param('id'), namespace)
            if (!loop) {
                return c.json({ error: 'Review loop not found' }, 404)
            }
            return c.json({ loop })
        } catch (error) {
            return toErrorResponse(c, error)
        }
    })

    // Cancel a review loop
    app.post('/review-loops/:id/cancel', (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) return engine

        const namespace = c.get('namespace')
        try {
            const loop = engine.cancelReviewLoop(c.req.param('id'), namespace)
            if (!loop) {
                return c.json({ error: 'Review loop not found' }, 404)
            }
            return c.json({ loop })
        } catch (error) {
            return toErrorResponse(c, error)
        }
    })

    // Start a new round (usually called by reviewer or controller)
    app.post('/review-loops/:id/rounds', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) return engine

        const body = await c.req.json().catch(() => null)
        const parsed = startRoundSchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        const namespace = c.get('namespace')
        try {
            const round = await engine.startReviewRound(
                c.req.param('id'),
                namespace,
                parsed.data.instruction
            )
            return c.json({ round }, 201)
        } catch (error) {
            return toErrorResponse(c, error)
        }
    })

    // Submit worker output for a round
    app.post('/review-loops/:id/rounds/:roundId/worker-output', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) return engine

        const body = await c.req.json().catch(() => null)
        const parsed = submitWorkerOutputSchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        const namespace = c.get('namespace')
        try {
            const round = await engine.submitReviewWorkerOutput(
                c.req.param('id'),
                namespace,
                c.req.param('roundId'),
                parsed.data.workerOutput
            )
            return c.json({ round })
        } catch (error) {
            return toErrorResponse(c, error)
        }
    })

    // Submit reviewer verdict for a round
    app.post('/review-loops/:id/rounds/:roundId/verdict', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) return engine

        const body = await c.req.json().catch(() => null)
        const parsed = submitVerdictSchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body', details: parsed.error.issues }, 400)
        }

        const namespace = c.get('namespace')
        try {
            const result = await engine.submitReviewVerdict(
                c.req.param('id'),
                namespace,
                c.req.param('roundId'),
                parsed.data.verdict
            )
            return c.json(result)
        } catch (error) {
            return toErrorResponse(c, error)
        }
    })

    // User continues from waiting_user state (gas pedal)
    app.post('/review-loops/:id/continue', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) return engine

        const body = await c.req.json().catch(() => ({}))
        const parsed = userContinueSchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        const namespace = c.get('namespace')
        try {
            const loop = await engine.userContinueReviewLoop(
                c.req.param('id'),
                namespace,
                parsed.data
            )
            return c.json({ loop })
        } catch (error) {
            return toErrorResponse(c, error)
        }
    })

    return app
}
