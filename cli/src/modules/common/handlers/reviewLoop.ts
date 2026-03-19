import type { RpcHandlerManager } from '@/api/rpc/RpcHandlerManager'
import { configuration } from '@/configuration'
import { getAuthToken } from '@/api/auth'
import axios from 'axios'
import { z } from 'zod'
import { logger } from '@/ui/logger'
import { rpcError, getErrorMessage } from '../rpcResponses'

const workerSubmitSchema = z.object({
    loopId: z.string(),
    roundId: z.string(),
    workerOutput: z.object({
        rawResponse: z.string(),
        summary: z.string().optional(),
        diff: z.string(),
        filesChanged: z.array(z.string()),
        commands: z.array(
            z.object({
                command: z.string(),
                exitCode: z.number(),
                stdout: z.string(),
                stderr: z.string(),
            })
        ),
        exitStatus: z.enum(['success', 'error']),
    }),
})

const reviewerSubmitSchema = z.object({
    loopId: z.string(),
    roundId: z.string(),
    verdict: z.object({
        action: z.enum(['continue', 'pass', 'abort', 'notify_user']),
        feedback: z.string(),
        userMessage: z.string().optional(),
        progress: z.number().min(0).max(100),
        criteriaStatus: z.array(
            z.object({
                criteria: z.string(),
                status: z.enum(['met', 'not_met', 'unclear']),
                note: z.string().optional(),
            })
        ),
    }),
})

type WorkerSubmitRequest = z.infer<typeof workerSubmitSchema>
type ReviewerSubmitRequest = z.infer<typeof reviewerSubmitSchema>

interface WorkerSubmitResponse {
    success: boolean
    error?: string
}

interface ReviewerSubmitResponse {
    success: boolean
    nextAction?: string
    error?: string
}

export function registerReviewLoopHandlers(
    rpcHandlerManager: RpcHandlerManager,
    _workingDirectory: string
): void {
    rpcHandlerManager.registerHandler<WorkerSubmitRequest, WorkerSubmitResponse>(
        'review-loop-worker-submit',
        async (data) => {
            logger.debug('Review loop worker submit:', data.loopId, data.roundId)

            const parsed = workerSubmitSchema.safeParse(data)
            if (!parsed.success) {
                return rpcError(parsed.error.message)
            }

            const { loopId, roundId, workerOutput } = parsed.data

            try {
                const token = getAuthToken()
                await axios.post(
                    `${configuration.apiUrl}/api/review-loops/${loopId}/rounds/${roundId}/worker-output`,
                    { workerOutput },
                    {
                        headers: {
                            Authorization: `Bearer ${token}`,
                            'Content-Type': 'application/json',
                        },
                    }
                )

                return { success: true }
            } catch (error) {
                logger.debug('Review loop worker submit error:', error)
                return rpcError(getErrorMessage(error, 'Failed to submit worker output'))
            }
        }
    )

    rpcHandlerManager.registerHandler<ReviewerSubmitRequest, ReviewerSubmitResponse>(
        'review-loop-reviewer-submit',
        async (data) => {
            logger.debug('Review loop reviewer submit:', data.loopId, data.roundId)

            const parsed = reviewerSubmitSchema.safeParse(data)
            if (!parsed.success) {
                return rpcError(parsed.error.message)
            }

            const { loopId, roundId, verdict } = parsed.data

            try {
                const token = getAuthToken()
                const response = await axios.post(
                    `${configuration.apiUrl}/api/review-loops/${loopId}/rounds/${roundId}/verdict`,
                    { verdict },
                    {
                        headers: {
                            Authorization: `Bearer ${token}`,
                            'Content-Type': 'application/json',
                        },
                    }
                )

                return {
                    success: true,
                    nextAction: response.data?.nextAction ?? verdict.action,
                }
            } catch (error) {
                logger.debug('Review loop reviewer submit error:', error)
                return rpcError(getErrorMessage(error, 'Failed to submit reviewer verdict'))
            }
        }
    )
}
